import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { getAdminDb, verifyRequestIdToken } from "../../../firebaseAdmin";
import {
  INITIAL_ORDER_STATUS,
  INITIAL_PAYMENT_STATUS,
  PHONE_FORMAT_ERROR,
  formatUzPhone,
  isFreeDelivery,
  normalizeUzPhone,
} from "../../../shopConfig";
import { validateTelegramInitData } from "../../../telegramServer";

// Создание заказа. Цены, названия, сумма и статусы берутся только на сервере;
// клиент присылает лишь товары с количеством и свои контактные данные.

type RequestItem = {
  productId?: unknown;
  quantity?: unknown;
  size?: unknown;
  color?: unknown;
};

type RequestBody = {
  items?: unknown;
  customer?: {
    name?: unknown;
    phone?: unknown;
    address?: unknown;
    comment?: unknown;
  };
  initData?: unknown;
  // Профиль, который клиент хранил локально до первого заказа.
  profile?: {
    addresses?: unknown;
    passwordChangedOnce?: unknown;
  };
};

type Customer = {
  name: string;
  phone: string;
  address: string;
  comment: string;
};

const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

// code — машиночитаемая причина: клиент по ней показывает понятный текст
// на русском или узбекском.
function badRequest(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

const MAX_ADDRESSES = 20;

function cleanAddresses(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, MAX_ADDRESSES)
    .map((item, index) => ({
      id: cleanText(item?.id, 60) || `address-${index}`,
      label: cleanText(item?.label, 60) || `Адрес ${index + 1}`,
      address: cleanText(item?.address, 300),
    }))
    .filter((item) => item.address);
}

// Документ users/{uid} появляется только с первым заказом: до этого профиль
// и адреса клиент хранит у себя (localStorage) и присылает их сюда.
// Возвращает true, если профиль создан этим заказом.
async function saveCustomerProfile(
  db: Firestore,
  uid: string,
  customer: Customer,
  profile: RequestBody["profile"]
) {
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const contact = {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (snapshot.exists) {
      transaction.update(userRef, contact);
      return false;
    }

    transaction.set(userRef, {
      ...contact,
      addresses: cleanAddresses(profile?.addresses),
      passwordChangedOnce: profile?.passwordChangedOnce === true,
      createdAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

// Вариант (размер/цвет) сохраняем, только если он есть у товара.
function pickVariant(value: unknown, allowed: unknown) {
  if (typeof value !== "string" || !Array.isArray(allowed)) {
    return undefined;
  }

  return allowed.includes(value) ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestIdToken(request);

    if (!user) {
      return badRequest("Требуется вход", "auth-required", 401);
    }

    let body: RequestBody;

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return badRequest("Некорректный запрос", "bad-request");
    }

    const customer: Customer = {
      name: cleanText(body.customer?.name, 100),
      phone: cleanText(body.customer?.phone, 30),
      address: cleanText(body.customer?.address, 300),
      comment: cleanText(body.customer?.comment, 500),
    };

    if (!customer.name || !customer.phone || !customer.address) {
      return badRequest("Заполните имя, телефон и адрес", "missing-fields");
    }

    // Телефон в едином виде +998 XX XXX XX XX.
    const normalizedPhone = normalizeUzPhone(customer.phone);

    if (!normalizedPhone) {
      return badRequest(PHONE_FORMAT_ERROR.ru, "invalid-phone");
    }

    customer.phone = formatUzPhone(normalizedPhone);

    const rawItems = Array.isArray(body.items) ? (body.items as RequestItem[]) : [];

    if (rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
      return badRequest("Корзина пуста или слишком большая", "invalid-cart");
    }

    const requested = [];

    for (const item of rawItems) {
      const productId =
        typeof item?.productId === "string" ? item.productId.trim() : "";
      const quantity = Number(item?.quantity);

      if (
        !productId ||
        productId.includes("/") ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUANTITY
      ) {
        return badRequest("Некорректный товар в корзине", "invalid-item");
      }

      requested.push({ productId, quantity, size: item.size, color: item.color });
    }

    const db = getAdminDb();
    const snapshots = await db.getAll(
      ...requested.map((item) => db.collection("products").doc(item.productId))
    );

    const items = [];
    let total = 0;
    let totalItems = 0;

    for (const [index, snapshot] of snapshots.entries()) {
      const product = snapshot.data();
      const price = Number(product?.price);
      const name = String(
        product?.nameRu || product?.name || product?.nameUz || "Товар"
      );

      if (!snapshot.exists || !product) {
        return badRequest("Один из товаров больше не продаётся", "product-unavailable", 409);
      }

      if (product.available === false || !Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Товар «${name}» сейчас недоступен`,
            code: "product-unavailable",
            productId: snapshot.id,
          },
          { status: 409 }
        );
      }

      const { quantity, size, color } = requested[index];
      const pickedSize = pickVariant(size, product.sizes);
      const pickedColor = pickVariant(color, product.colors);

      items.push({
        // id — для совместимости со старыми заказами и админкой.
        id: snapshot.id,
        productId: snapshot.id,
        name,
        price,
        collection: String(product.collection || ""),
        quantity,
        ...(pickedSize ? { size: pickedSize } : {}),
        ...(pickedColor ? { color: pickedColor } : {}),
      });

      total += price * quantity;
      totalItems += quantity;
    }

    // Telegram ID — только из подписанного initData, иначе null.
    const telegramUser = validateTelegramInitData(
      typeof body.initData === "string" ? body.initData : "",
      "orders/create"
    );

    // Доставка: бесплатная по Ташкенту, если в settings/shop не выключено.
    // deliveryPrice: 0 — бесплатно, null — стоимость уточнит менеджер.
    // total при этом не меняется.
    const settingsSnapshot = await db.collection("settings").doc("shop").get();
    const freeDelivery = isFreeDelivery(settingsSnapshot.data());

    const orderRef = await db.collection("orders").add({
      userId: user.uid,
      customer,
      phoneNormalized: normalizedPhone,
      items,
      total,
      totalItems,
      deliveryPrice: freeDelivery ? 0 : null,

      telegramUserId: telegramUser?.id ?? null,
      telegramUsername: telegramUser?.username ?? null,
      telegramName: telegramUser
        ? [telegramUser.first_name, telegramUser.last_name]
            .filter(Boolean)
            .join(" ")
        : null,
      telegramVerified: !!telegramUser,

      status: INITIAL_ORDER_STATUS,
      paymentStatus: INITIAL_PAYMENT_STATUS,
      receiptUrl: "",

      createdAt: FieldValue.serverTimestamp(),
    });

    // Профиль — после заказа: его ошибка не должна отменять уже созданный заказ.
    let profileCreated = false;

    try {
      profileCreated = await saveCustomerProfile(db, user.uid, customer, body.profile);
    } catch (error) {
      console.error(`Order ${orderRef.id}: customer profile save failed:`, error);
    }

    return NextResponse.json({
      ok: true,
      orderId: orderRef.id,
      total,
      profileCreated,
    });
  } catch (error) {
    console.error("Order creation failed:", error);

    return badRequest("Не удалось оформить заказ", "server-error", 500);
  }
}

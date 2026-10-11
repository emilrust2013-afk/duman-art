import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb, verifyRequestIdToken } from "../../../firebaseAdmin";
import {
  INITIAL_ORDER_STATUS,
  INITIAL_PAYMENT_STATUS,
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
};

const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
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
      return badRequest("Требуется вход", 401);
    }

    let body: RequestBody;

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return badRequest("Некорректный запрос");
    }

    const customer = {
      name: cleanText(body.customer?.name, 100),
      phone: cleanText(body.customer?.phone, 30),
      address: cleanText(body.customer?.address, 300),
      comment: cleanText(body.customer?.comment, 500),
    };

    if (!customer.name || !customer.phone || !customer.address) {
      return badRequest("Заполните имя, телефон и адрес");
    }

    const rawItems = Array.isArray(body.items) ? (body.items as RequestItem[]) : [];

    if (rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
      return badRequest("Корзина пуста или слишком большая");
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
        return badRequest("Некорректный товар в корзине");
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
        return badRequest("Один из товаров больше не продаётся", 409);
      }

      if (product.available === false || !Number.isFinite(price) || price <= 0) {
        return NextResponse.json(
          { ok: false, error: `Товар «${name}» сейчас недоступен`, productId: snapshot.id },
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
      typeof body.initData === "string" ? body.initData : ""
    );

    const orderRef = await db.collection("orders").add({
      userId: user.uid,
      customer,
      items,
      total,
      totalItems,

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

    return NextResponse.json({ ok: true, orderId: orderRef.id, total });
  } catch (error) {
    console.error("Order creation failed:", error);

    return badRequest("Не удалось оформить заказ", 500);
  }
}

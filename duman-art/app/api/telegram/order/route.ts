import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { getAdminDb, verifyRequestIdToken } from "../../../firebaseAdmin";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type OrderItem = {
  name: string;
  price: number;
  quantity: number;
  collection?: string;
};

type RequestBody = {
  initData?: string;
  orderId?: string;
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    comment?: string;
  };
  items?: OrderItem[];
  total?: number;
  receiptUrl?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validateTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !initData) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return null;
  }

  params.delete("hash");
  params.delete("signature");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const receivedBuffer = Buffer.from(receivedHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (
    receivedBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(
      receivedBuffer,
      calculatedBuffer
    )
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate) {
    return null;
  }

  const maxAgeSeconds = 24 * 60 * 60;
  if (
    Math.abs(Math.floor(Date.now() / 1000) - authDate) >
    maxAgeSeconds
  ) {
    return null;
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as TelegramUser;
  } catch {
    return null;
  }
}

// Записывает в заказ Telegram ID клиента из проверенного (подписанного) initData,
// а не из initDataUnsafe браузера. Только если Firebase ID token принадлежит
// владельцу заказа. Любая ошибка здесь не мешает уведомлению администраторов.
async function saveVerifiedTelegramUser(
  request: Request,
  orderId: string,
  telegramUser: TelegramUser
) {
  try {
    const decoded = await verifyRequestIdToken(request);

    if (!decoded || orderId.includes("/")) {
      return;
    }

    const orderRef = getAdminDb().collection("orders").doc(orderId);
    const snapshot = await orderRef.get();

    if (!snapshot.exists || snapshot.get("userId") !== decoded.uid) {
      return;
    }

    await orderRef.update({
      telegramUserId: telegramUser.id,
      telegramUsername: telegramUser.username || null,
      telegramVerified: true,
    });
  } catch (error) {
    console.error("Saving verified Telegram user failed:", error);
  }
}

function buildChatUrl(user: TelegramUser) {
  if (user.username) {
    return `https://t.me/${user.username}`;
  }

  return `tg://user?id=${user.id}`;
}

async function telegramRequest(
  method: string,
  payload: Record<string, unknown>
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.description || `Telegram API error: ${response.status}`
    );
  }

  return data.result;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;

    const adminChatIds = (
      process.env.TELEGRAM_ADMIN_CHAT_IDS ||
      process.env.TELEGRAM_ADMIN_CHAT_ID ||
      ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (adminChatIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "TELEGRAM_ADMIN_CHAT_IDS is not configured",
        },
        { status: 500 }
      );
    }

    const customer = body.customer || {};
    const items = Array.isArray(body.items)
      ? body.items
      : [];
    const total = Number(body.total || 0);
    const orderId = String(body.orderId || "");

    if (!orderId || !customer.name || !customer.phone || !customer.address) {
      return NextResponse.json(
        { ok: false, error: "Order data is incomplete" },
        { status: 400 }
      );
    }

    const telegramUser = validateTelegramInitData(
      String(body.initData || "")
    );

    if (telegramUser) {
      await saveVerifiedTelegramUser(request, orderId, telegramUser);
    }

    const itemLines = items.length
      ? items
          .map((item, index) => {
            const name = escapeHtml(item.name || `Товар ${index + 1}`);
            const quantity = Number(item.quantity || 1);
            const price = Number(item.price || 0);
            const collection = item.collection
              ? ` · ${escapeHtml(item.collection)}`
              : "";

            return `${index + 1}. ${name}${collection} × ${quantity} — ${price.toLocaleString(
              "ru-RU"
            )} сум`;
          })
          .join("\n")
      : "—";

    const customerName = escapeHtml(customer.name);
    const customerPhone = escapeHtml(customer.phone);
    const customerAddress = escapeHtml(customer.address);
    const customerComment = escapeHtml(customer.comment || "—");

    const telegramName = telegramUser
      ? [telegramUser.first_name, telegramUser.last_name]
          .filter(Boolean)
          .join(" ")
      : "";

    const telegramUsername = telegramUser?.username
      ? `@${escapeHtml(telegramUser.username)}`
      : "";

    const telegramLine = telegramUser
      ? `\n💬 Telegram: ${escapeHtml(telegramName || "пользователь")} ${telegramUsername}\n🆔 ID: ${telegramUser.id}`
      : "\n💬 Telegram: данные Mini App не переданы";

    const message =
      `🛍 <b>НОВЫЙ ЗАКАЗ</b>\n\n` +
      `📦 Заказ: <b>#${escapeHtml(orderId.slice(0, 8).toUpperCase())}</b>\n` +
      `👤 Клиент: <b>${customerName}</b>\n` +
      `📱 Телефон: <b>${customerPhone}</b>\n` +
      `📍 Адрес: <b>${customerAddress}</b>\n` +
      `${telegramLine}\n\n` +
      `🛒 <b>Товары:</b>\n${itemLines}\n\n` +
      `💰 <b>Итого: ${total.toLocaleString("ru-RU")} сум</b>\n` +
      `💳 Оплата: перевод на карту\n` +
      `📝 Комментарий: ${customerComment}`;

    const replyMarkup = telegramUser
      ? {
          inline_keyboard: [
            [
              {
                text: "💬 Перейти в чат",
                url: buildChatUrl(telegramUser),
              },
            ],
          ],
        }
      : undefined;

    const results = [];

    for (const chatId of adminChatIds) {
      const result = await telegramRequest("sendMessage", {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });

      results.push(result?.message_id);

      if (body.receiptUrl) {
        try {
          await telegramRequest("sendPhoto", {
            chat_id: chatId,
            photo: body.receiptUrl,
            caption: `🧾 Чек к заказу #${escapeHtml(
              orderId.slice(0, 8).toUpperCase()
            )}`,
          });
        } catch (error) {
          console.error("Receipt send failed:", error);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sentTo: adminChatIds.length,
      messageIds: results,
    });
  } catch (error) {
    console.error("Telegram order notification failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}

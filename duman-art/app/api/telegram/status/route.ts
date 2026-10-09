import { NextResponse } from "next/server";
import crypto from "node:crypto";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type RequestBody = {
  initData?: string;
  telegramUserId?: number | string | null;
  telegramUsername?: string | null;
  orderId?: string;
  status?: string;
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
  if (!botToken || !initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

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
    !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
  ) {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return null;

  const maxAgeSeconds = 24 * 60 * 60;
  if (
    Math.abs(Math.floor(Date.now() / 1000) - authDate) >
    maxAgeSeconds
  ) {
    return null;
  }

  const rawUser = params.get("user");
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as TelegramUser;
  } catch {
    return null;
  }
}

function statusText(status: string, orderId: string) {
  const id = escapeHtml(orderId.slice(0, 8).toUpperCase());

  switch (status) {
    case "Подтверждён":
      return (
        `✅ <b>Заказ #${id} подтверждён!</b>\n\n` +
        `Мы уже начали его обработку.\n` +
        `Скоро он будет у вас. 📦`
      );

    case "В доставке":
      return (
        `🚚 <b>Заказ #${id} передан в доставку!</b>\n\n` +
        `Курьер уже в пути. Скоро заказ будет у вас. 📦`
      );

    case "Завершён":
      return (
        `✅ <b>Заказ #${id} завершён.</b>\n\n` +
        `Спасибо за покупку в Duman Art! 💎`
      );

    case "В обработке":
      return (
        `🛠 <b>Заказ #${id} в обработке.</b>\n\n` +
        `Мы занимаемся вашим заказом. 📦`
      );

    default:
      return (
        `📦 <b>Статус заказа #${id}: ${escapeHtml(status)}</b>`
      );
  }
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
      headers: { "Content-Type": "application/json" },
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

    const telegramAdmin = validateTelegramInitData(
      String(body.initData || "")
    );

    if (!telegramAdmin) {
      return NextResponse.json(
        { ok: false, error: "Invalid Telegram Mini App data" },
        { status: 401 }
      );
    }

    if (!adminChatIds.includes(String(telegramAdmin.id))) {
      return NextResponse.json(
        { ok: false, error: "Telegram user is not an admin" },
        { status: 403 }
      );
    }

    const customerChatId = String(body.telegramUserId || "").trim();
    const orderId = String(body.orderId || "").trim();
    const status = String(body.status || "").trim();

    if (!customerChatId || !orderId || !status) {
      return NextResponse.json(
        { ok: false, error: "Status data is incomplete" },
        { status: 400 }
      );
    }

    await telegramRequest("sendMessage", {
      chat_id: customerChatId,
      text: statusText(status, orderId),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram status notification failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

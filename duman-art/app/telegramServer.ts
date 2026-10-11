// Общие функции Telegram для серверных маршрутов (app/api/**).
// Не импортируйте этот файл в клиентские компоненты: он читает токен бота.
import crypto from "node:crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Проверяет подпись initData Telegram Mini App и возвращает пользователя.
// Данные старше 24 часов не принимаются.
// context — метка для серверного лога: при отказе пишется только причина,
// без самих данных и токена.
export function validateTelegramInitData(
  initData: string,
  context?: string
): TelegramUser | null {
  const reject = (reason: string) => {
    if (context) {
      console.warn(`Telegram initData rejected (${context}): ${reason}`);
    }

    return null;
  };

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return reject("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!initData) {
    return reject("no initData (opened outside Telegram Mini App?)");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash) {
    return reject("no hash");
  }

  // По документации Telegram (Validating data received via the Mini App)
  // data-check-string для HMAC строится из ВСЕХ полей, кроме hash.
  // Поле signature исключается только при проверке Ed25519 для третьих лиц,
  // поэтому здесь его не удаляем.
  params.delete("hash");

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
    return reject("hash mismatch");
  }

  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate) {
    return reject("no auth_date");
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;

  if (Math.abs(ageSeconds) > 24 * 60 * 60) {
    return reject(`auth_date expired (age ${ageSeconds}s)`);
  }

  try {
    const user = JSON.parse(params.get("user") || "") as TelegramUser;

    return Number.isSafeInteger(user?.id)
      ? user
      : reject("user has no valid id");
  } catch {
    return reject("no user or user is not valid JSON");
  }
}

export function getAdminChatIds() {
  return String(
    process.env.TELEGRAM_ADMIN_CHAT_IDS ||
      process.env.TELEGRAM_ADMIN_CHAT_ID ||
      ""
  )
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter((value) => /^-?\d+$/.test(value));
}

export async function telegramRequest(
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
      signal: AbortSignal.timeout(15_000),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(
      `${method}: ${data?.description || `Telegram API error: ${response.status}`}`
    );
  }

  return data.result;
}

// Устанавливает webhook бота на <адрес сайта>/api/telegram/webhook.
// Адрес: DUMAN_ART_STORE_URL, иначе RENDER_EXTERNAL_URL (задаётся Render).
import { printWebhookInfo, requireEnv, telegramRequest } from "./telegram-api.mjs";

const baseUrl = String(
  process.env.DUMAN_ART_STORE_URL || process.env.RENDER_EXTERNAL_URL || ""
).replace(/\/+$/, "");

if (!/^https:\/\//.test(baseUrl)) {
  console.error(
    "❌ DUMAN_ART_STORE_URL не задан или не начинается с https://"
  );
  process.exit(1);
}

const secret = requireEnv("TELEGRAM_WEBHOOK_SECRET");

if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error(
    "❌ TELEGRAM_WEBHOOK_SECRET: допустимы только A-Z, a-z, 0-9, _ и -, до 256 символов"
  );
  process.exit(1);
}

const url = `${baseUrl}/api/telegram/webhook`;

try {
  await telegramRequest("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
  console.log(`✅ Webhook установлен: ${url}`);
  await printWebhookInfo();
} catch (error) {
  console.error("❌ Не удалось установить webhook:", error.message);
  process.exit(1);
}

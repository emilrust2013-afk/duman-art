// Удаляет webhook, чтобы локально можно было запустить bot/index.js (long polling).
// Пока webhook удалён, бот на сайте не получает обновлений — потом снова
// выполните npm run webhook:set.
import { printWebhookInfo, telegramRequest } from "./telegram-api.mjs";

try {
  await telegramRequest("deleteWebhook", { drop_pending_updates: false });
  console.log("✅ Webhook удалён");
  await printWebhookInfo();
} catch (error) {
  console.error("❌ Не удалось удалить webhook:", error.message);
  process.exit(1);
}

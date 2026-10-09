// Печатает текущее состояние webhook бота.
import { printWebhookInfo } from "./telegram-api.mjs";

try {
  await printWebhookInfo();
} catch (error) {
  console.error("❌ Не удалось получить getWebhookInfo:", error.message);
  process.exit(1);
}

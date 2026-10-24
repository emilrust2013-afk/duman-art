// Настройка бота: меню команд (при вводе «/») и кнопка Mini App слева
// от поля ввода. Можно запускать повторно: npm run bot:setup
// Обработчики команд — в app/api/telegram/webhook/route.ts.
import { requireEnv, telegramRequest } from "./telegram-api.mjs";

const storeUrl = requireEnv("DUMAN_ART_STORE_URL").replace(/\/+$/, "");

if (!/^https:\/\//.test(storeUrl)) {
  console.error("❌ DUMAN_ART_STORE_URL должен начинаться с https://");
  process.exit(1);
}

const COMMANDS = {
  // По умолчанию (и для русского языка).
  ru: [
    { command: "start", description: "Главное меню" },
    { command: "shop", description: "Открыть магазин" },
    { command: "orders", description: "Мои заказы" },
    { command: "contact", description: "Связаться с нами" },
    { command: "myid", description: "Мой Telegram ID" },
  ],
  uz: [
    { command: "start", description: "Asosiy menyu" },
    { command: "shop", description: "Do‘konni ochish" },
    { command: "orders", description: "Mening buyurtmalarim" },
    { command: "contact", description: "Biz bilan bog‘lanish" },
    { command: "myid", description: "Mening Telegram ID raqamim" },
  ],
};

try {
  await telegramRequest("setMyCommands", { commands: COMMANDS.ru });
  await telegramRequest("setMyCommands", {
    commands: COMMANDS.ru,
    language_code: "ru",
  });
  await telegramRequest("setMyCommands", {
    commands: COMMANDS.uz,
    language_code: "uz",
  });
  console.log("✅ setMyCommands: по умолчанию, ru, uz");

  await telegramRequest("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Открыть",
      web_app: { url: storeUrl },
    },
  });
  console.log(`✅ setChatMenuButton: «Открыть» → ${storeUrl}`);

  // Проверка: что сейчас стоит у бота.
  const [defaults, uz, menuButton] = await Promise.all([
    telegramRequest("getMyCommands"),
    telegramRequest("getMyCommands", { language_code: "uz" }),
    telegramRequest("getChatMenuButton"),
  ]);

  console.log("\nℹ️ Команды (по умолчанию):");
  for (const item of defaults) console.log(`   /${item.command} — ${item.description}`);
  console.log("ℹ️ Команды (uz):");
  for (const item of uz) console.log(`   /${item.command} — ${item.description}`);
  console.log("ℹ️ Кнопка меню:", JSON.stringify(menuButton));
} catch (error) {
  console.error("❌ Не удалось настроить бота:", error.message);
  process.exit(1);
}

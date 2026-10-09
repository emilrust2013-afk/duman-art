const path = require("path");
const dotenv = require("dotenv");

// Порядок: переменные окружения хостинга > bot/.env > корневой .env.
// dotenv не перезаписывает уже заданные переменные, поэтому первый
// найденный источник побеждает. Отсутствующий файл просто пропускается.
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { Telegraf, Markup } = require("telegraf");

const token =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN не найден");
  process.exit(1);
}

const STORE_URL = String(
  process.env.DUMAN_ART_STORE_URL || ""
).replace(/\/+$/, "");

if (!/^https:\/\//.test(STORE_URL)) {
  console.error(
    "❌ DUMAN_ART_STORE_URL не задан или не начинается с https://\n" +
      "   Укажите адрес Mini App в bot/.env, корневом .env или в переменных окружения хостинга."
  );
  process.exit(1);
}

const ADMIN_CHAT_IDS = String(
  process.env.TELEGRAM_ADMIN_CHAT_IDS ||
    process.env.TELEGRAM_ADMIN_CHAT_ID ||
    ""
)
  .split(/[;,]/)
  .map((value) => value.trim())
  .filter((value) => /^-?\d+$/.test(value));

if (ADMIN_CHAT_IDS.length === 0) {
  console.warn(
    "⚠️ TELEGRAM_ADMIN_CHAT_IDS пуст — кнопка админ-панели не будет показана никому."
  );
}

const bot = new Telegraf(token);

// Администратор определяется только по ID пользователя, не по чату и не по username.
function isAdmin(ctx) {
  const userId = ctx.from?.id;

  return (
    userId !== undefined &&
    ADMIN_CHAT_IDS.includes(String(userId))
  );
}

function shopKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        "🛍 Открыть магазин",
        STORE_URL
      ),
    ],
  ]);
}

function mainMenu(ctx) {
  const buttons = [
    [
      Markup.button.webApp(
        "🛍 Открыть магазин",
        STORE_URL
      ),
    ],
  ];

  if (isAdmin(ctx)) {
    buttons.push([
      Markup.button.webApp(
        "🔐 Админ-панель",
        `${STORE_URL}/admin`
      ),
    ]);
  }

  buttons.push(
    [
      Markup.button.callback(
        "🇷🇺 Русский",
        "lang_ru"
      ),
      Markup.button.callback(
        "🇺🇿 O‘zbekcha",
        "lang_uz"
      ),
    ],
    [
      Markup.button.callback(
        "📞 Связаться с нами",
        "contact"
      ),
    ]
  );

  return Markup.inlineKeyboard(buttons);
}

bot.start(async (ctx) => {
  console.log(
    `📩 /start | from=${ctx.from?.id} | chat=${ctx.chat?.id} | admin=${isAdmin(ctx)}`
  );

  await ctx.reply(
    "💎 Добро пожаловать в Duman Art!\n\nОткройте магазин ниже.",
    mainMenu(ctx)
  );
});

async function sendShop(ctx) {
  await ctx.reply(
    "🛍 Duman Art — нажмите кнопку, чтобы открыть магазин.",
    shopKeyboard()
  );
}

bot.command("shop", sendShop);

bot.action("shop", async (ctx) => {
  await ctx.answerCbQuery();
  await sendShop(ctx);
});

bot.command("myid", async (ctx) => {
  await ctx.reply(
    `🆔 Ваш Telegram ID: ${ctx.from?.id}`
  );

  console.log(
    `🆔 myid: ${ctx.from?.id}`
  );
});

bot.action("lang_ru", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "🇷🇺 Русский выбран.",
    mainMenu(ctx)
  );
});

bot.action("lang_uz", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "🇺🇿 O‘zbekcha tanlandi.",
    mainMenu(ctx)
  );
});

bot.action("contact", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "📞 Duman Art\n\nТелефон: +998 87 907 01 07"
  );
});

bot.catch((error) => {
  console.error("❌ Ошибка бота:", error);
});

async function startBot() {
  try {
    const me = await bot.telegram.getMe();

    console.log("━━━━━━━━━━━━━━━━━━━━");
    console.log("🤖 Бот:", `@${me.username}`);
    console.log("🛍 STORE_URL:", STORE_URL);
    console.log("🔐 ADMIN IDS:", ADMIN_CHAT_IDS.length);
    console.log("━━━━━━━━━━━━━━━━━━━━");

    // launch() завершается только при остановке бота, поэтому
    // сообщение о запуске выводим в колбэке onLaunch.
    await bot.launch(
      {
        dropPendingUpdates: true,
      },
      () =>
        console.log("✅ Duman Art bot запущен и ожидает сообщения...")
    );
  } catch (error) {
    console.error("❌ Бот не смог запуститься:");
    console.error(error);
    process.exit(1);
  }
}

startBot();

process.once("SIGINT", () => {
  console.log("🛑 Бот остановлен");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  console.log("🛑 Бот остановлен");
  bot.stop("SIGTERM");
});
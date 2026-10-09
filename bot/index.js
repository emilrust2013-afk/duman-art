require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

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

const ADMIN_CHAT_IDS = String(
  process.env.TELEGRAM_ADMIN_CHAT_IDS ||
    process.env.TELEGRAM_ADMIN_CHAT_ID ||
    ""
)
  .split(/[;,]/)
  .map((value) => value.trim())
  .filter(Boolean);

const bot = new Telegraf(token);

function getIds(ctx) {
  return [
    ctx.from?.id,
    ctx.chat?.id,
  ]
    .filter((id) => id !== undefined && id !== null)
    .map(String);
}

function isAdmin(ctx) {
  const ids = getIds(ctx);

  return ids.some((id) =>
    ADMIN_CHAT_IDS.includes(id)
  );
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
        "🔐 Админка",
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

bot.command("shop", async (ctx) => {
  await ctx.reply(
    "🛍 Duman Art",
    mainMenu(ctx)
  );
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

    await bot.launch({
      dropPendingUpdates: true,
    });

    console.log("✅ Duman Art bot запущен и ожидает сообщения...");
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

// Не даём процессу завершиться
setInterval(() => {}, 1000);
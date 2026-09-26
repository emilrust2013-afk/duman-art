require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const { Telegraf, Markup } = require("telegraf");

const token =
  process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

if (!token) {
  console.error(
    "❌ TELEGRAM_BOT_TOKEN не найден в bot/.env"
  );
  process.exit(1);
}
const STORE_URL = "https://admit-tcp-immediately-challenging.trycloudflare.com";

const bot = new Telegraf(token);

function mainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp(
        "🛍 Открыть магазин",
        STORE_URL
      ),
    ],
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
    ],
  ]);
}

bot.start(async (ctx) => {
  await ctx.reply(
    "💙 DUMAN ART\n\n" +
      "Добро пожаловать в Duman Art.\n" +
      "Украшения • Tashkent\n\n" +
      "Выберите действие:",
    mainMenu()
  );
});

bot.action("lang_ru", async (ctx) => {
  await ctx.answerCbQuery("Русский");

  await ctx.reply(
    "Язык: Русский 🇷🇺\n\n" +
      "Нажмите кнопку ниже, чтобы открыть магазин.",
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          "🛍 Открыть магазин",
          STORE_URL
        ),
      ],
      [
        Markup.button.callback(
          "📞 Связаться с нами",
          "contact"
        ),
      ],
    ])
  );
});

bot.action("lang_uz", async (ctx) => {
  await ctx.answerCbQuery("O‘zbekcha");

  await ctx.reply(
    "Til: O‘zbekcha 🇺🇿\n\n" +
      "Do‘konni ochish uchun quyidagi tugmani bosing.",
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          "🛍 Do‘konni ochish",
          STORE_URL
        ),
      ],
      [
        Markup.button.callback(
          "📞 Biz bilan bog‘lanish",
          "contact"
        ),
      ],
    ])
  );
});

bot.action("contact", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "📞 DUMAN ART\n\n" +
      "Телефон: +998 87 907 01 07"
  );
});

bot.action("shop", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "🛍 Открываю Duman Art...",
    Markup.inlineKeyboard([
      [
        Markup.button.webApp(
          "🛍 Открыть магазин",
          STORE_URL
        ),
      ],
    ])
  );
});

bot.catch((error, ctx) => {
  console.error(
    "❌ Ошибка бота:",
    error
  );

  try {
    ctx.reply(
      "Произошла ошибка. Попробуйте ещё раз через несколько секунд."
    );
  } catch {}
});

bot.launch()
  .then(() => {
    console.log(
      "✅ 💙 DUMAN ART BOT запущен!"
    );

    console.log(
      `🌐 Mini App: ${STORE_URL}`
    );
  })
  .catch((error) => {
    console.error(
      "❌ Ошибка запуска:",
      error
    );

    process.exit(1);
  });

process.once("SIGINT", () =>
  bot.stop("SIGINT")
);

process.once("SIGTERM", () =>
  bot.stop("SIGTERM")
);
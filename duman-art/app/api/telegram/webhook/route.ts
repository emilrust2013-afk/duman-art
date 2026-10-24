import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { SHOP_PHONE } from "../../../shopConfig";

// Webhook Telegram-бота. Повторяет поведение bot/index.js, но работает
// внутри Next.js, поэтому сайт и бот живут в одном веб-сервисе.

type TelegramUser = {
  id: number;
  username?: string;
  language_code?: string;
};

type TelegramChat = {
  id: number;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type InlineButton =
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string };

type InlineKeyboard = { inline_keyboard: InlineButton[][] };

function getStoreUrl() {
  return String(process.env.DUMAN_ART_STORE_URL || "").replace(/\/+$/, "");
}

// Администратор определяется только по ID пользователя, не по чату и не по username.
function isAdmin(userId: number | undefined) {
  const adminChatIds = String(
    process.env.TELEGRAM_ADMIN_CHAT_IDS ||
      process.env.TELEGRAM_ADMIN_CHAT_ID ||
      ""
  )
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter((value) => /^-?\d+$/.test(value));

  return userId !== undefined && adminChatIds.includes(String(userId));
}

function secretMatches(received: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return false;
  }

  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
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
      signal: AbortSignal.timeout(10_000),
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(
      `${method}: ${data?.description || `Telegram API error: ${response.status}`}`
    );
  }

  return data.result;
}

let botUsername: Promise<string> | null = null;

// Имя бота нужно только для команд вида /shop@BotName (в группах).
function getBotUsername() {
  if (!botUsername) {
    botUsername = telegramRequest("getMe", {})
      .then((me) => String(me?.username || ""))
      .catch((error) => {
        botUsername = null;
        throw error;
      });
  }

  return botUsername;
}

async function parseCommand(text: string | undefined) {
  const match = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s|$)/i.exec(
    text || ""
  );

  if (!match) {
    return null;
  }

  const [, command, mention] = match;

  if (
    mention &&
    mention.toLowerCase() !== (await getBotUsername()).toLowerCase()
  ) {
    return null;
  }

  return command.toLowerCase();
}

function shopKeyboard(storeUrl: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🛍 Открыть магазин", web_app: { url: storeUrl } }],
    ],
  };
}

function mainMenu(storeUrl: string, userId: number | undefined): InlineKeyboard {
  const buttons: InlineButton[][] = [
    [{ text: "🛍 Открыть магазин", web_app: { url: storeUrl } }],
  ];

  if (isAdmin(userId)) {
    buttons.push([
      { text: "🔐 Админ-панель", web_app: { url: `${storeUrl}/admin` } },
    ]);
  }

  buttons.push(
    [
      { text: "🇷🇺 Русский", callback_data: "lang_ru" },
      { text: "🇺🇿 O‘zbekcha", callback_data: "lang_uz" },
    ],
    [{ text: "📞 Связаться с нами", callback_data: "contact" }]
  );

  return { inline_keyboard: buttons };
}

function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard
) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function sendShop(chatId: number, storeUrl: string) {
  return sendMessage(
    chatId,
    "🛍 Duman Art — нажмите кнопку, чтобы открыть магазин.",
    shopKeyboard(storeUrl)
  );
}

// Mini App сразу на вкладке «Мои заказы» (параметр tab читает app/page.tsx).
function ordersKeyboard(storeUrl: string, uz: boolean): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        {
          text: uz ? "📦 Buyurtmalarim" : "📦 Мои заказы",
          web_app: { url: `${storeUrl}/?tab=orders` },
        },
      ],
    ],
  };
}

function contactText(uz: boolean) {
  return uz
    ? `📞 Duman Art\n\nTelefon: ${SHOP_PHONE}\nSavollar bo‘lsa, qo‘ng‘iroq qiling yoki shu chatga yozing.`
    : `📞 Duman Art\n\nТелефон: ${SHOP_PHONE}\nЗвоните или пишите в этот чат — ответим на вопросы.`;
}

async function handleMessage(message: TelegramMessage, storeUrl: string) {
  const command = await parseCommand(message.text);
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const uz = message.from?.language_code === "uz";

  switch (command) {
    case "start":
      console.log(
        `📩 /start | from=${userId} | chat=${chatId} | admin=${isAdmin(userId)}`
      );
      await sendMessage(
        chatId,
        "💎 Добро пожаловать в Duman Art!\n\nОткройте магазин ниже.",
        mainMenu(storeUrl, userId)
      );
      break;

    case "shop":
      await sendShop(chatId, storeUrl);
      break;

    case "orders":
      await sendMessage(
        chatId,
        uz
          ? "📦 Buyurtmalaringiz va ularning holati — ilovada."
          : "📦 Ваши заказы и их статусы — в приложении.",
        ordersKeyboard(storeUrl, uz)
      );
      break;

    case "contact":
      await sendMessage(chatId, contactText(uz));
      break;

    case "myid":
      await sendMessage(chatId, `🆔 Ваш Telegram ID: ${userId}`);
      console.log(`🆔 myid: ${userId}`);
      break;
  }
}

async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  storeUrl: string
) {
  const actions: Record<string, (chatId: number) => Promise<unknown>> = {
    shop: (chatId) => sendShop(chatId, storeUrl),
    lang_ru: (chatId) =>
      sendMessage(
        chatId,
        "🇷🇺 Русский выбран.",
        mainMenu(storeUrl, query.from.id)
      ),
    lang_uz: (chatId) =>
      sendMessage(
        chatId,
        "🇺🇿 O‘zbekcha tanlandi.",
        mainMenu(storeUrl, query.from.id)
      ),
    contact: (chatId) =>
      sendMessage(chatId, contactText(query.from.language_code === "uz")),
  };

  const action = query.data ? actions[query.data] : undefined;

  if (!action) {
    return;
  }

  await telegramRequest("answerCallbackQuery", {
    callback_query_id: query.id,
  });

  if (query.message) {
    await action(query.message.chat.id);
  }
}

export async function POST(request: Request) {
  if (
    !secretMatches(
      request.headers.get("x-telegram-bot-api-secret-token")
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Любая ошибка обработки логируется, но Telegram всегда получает 200,
  // иначе он будет бесконечно повторять одно и то же обновление.
  try {
    const storeUrl = getStoreUrl();

    if (!/^https:\/\//.test(storeUrl)) {
      throw new Error(
        "DUMAN_ART_STORE_URL is not configured or does not start with https://"
      );
    }

    if (update.message) {
      await handleMessage(update.message, storeUrl);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, storeUrl);
    }
  } catch (error) {
    console.error(
      `❌ Telegram webhook update ${update?.update_id} failed:`,
      error
    );
  }

  return NextResponse.json({ ok: true });
}

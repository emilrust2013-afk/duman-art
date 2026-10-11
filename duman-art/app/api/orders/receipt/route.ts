import { NextResponse } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getDownloadURL } from "firebase-admin/storage";

import {
  getAdminBucket,
  getAdminDb,
  verifyRequestIdToken,
} from "../../../firebaseAdmin";
import { formatOrderNumber } from "../../../shopConfig";
import {
  escapeHtml,
  getAdminChatIds,
  telegramRequest,
} from "../../../telegramServer";

// Прикрепление чека к заказу и уведомление администраторов.
// Клиент сначала загружает файл в Storage (receipts/{uid}/{orderId}/...),
// затем вызывает этот маршрут. Сообщение админам строится только из базы
// и отправляется один раз на заказ (поле notifiedAt).

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

type OrderData = DocumentData;

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function formatSum(value: unknown) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value || 0))} сум`;
}

function buildAdminMessage(orderId: string, order: OrderData) {
  const customer = order.customer || {};
  const items: OrderData[] = Array.isArray(order.items) ? order.items : [];

  const itemLines = items.length
    ? items
        .map((item, index) => {
          const variant = [item.size, item.color].filter(Boolean).join(", ");

          return (
            `${index + 1}. ${escapeHtml(item.name || "Товар")}` +
            (item.collection ? ` · ${escapeHtml(item.collection)}` : "") +
            (variant ? ` (${escapeHtml(variant)})` : "") +
            ` × ${Number(item.quantity || 1)} — ${formatSum(item.price)}`
          );
        })
        .join("\n")
    : "—";

  const telegramLine = order.telegramUserId
    ? `💬 Telegram: ${escapeHtml(order.telegramName || "пользователь")}` +
      (order.telegramUsername ? ` @${escapeHtml(order.telegramUsername)}` : "") +
      `\n🆔 ID: ${escapeHtml(order.telegramUserId)}`
    : "💬 Telegram: заказ оформлен не из Mini App";

  return (
    `🛍 <b>НОВЫЙ ЗАКАЗ</b>\n\n` +
    `📦 Заказ: <b>${formatOrderNumber(orderId)}</b>\n` +
    `👤 Клиент: <b>${escapeHtml(customer.name)}</b>\n` +
    `📱 Телефон: <b>${escapeHtml(customer.phone)}</b>\n` +
    `📍 Адрес: <b>${escapeHtml(customer.address)}</b>\n` +
    `${telegramLine}\n\n` +
    `🛒 <b>Товары:</b>\n${itemLines}\n\n` +
    `💰 <b>Итого: ${formatSum(order.total)}</b>\n` +
    `💳 Оплата: перевод на карту, чек приложен\n` +
    `📝 Комментарий: ${escapeHtml(customer.comment || "—")}`
  );
}

// Возвращает true, если сообщение дошло хотя бы до одного администратора.
async function notifyAdmins(orderId: string, order: OrderData) {
  const chatIds = getAdminChatIds();

  if (chatIds.length === 0) {
    console.error("TELEGRAM_ADMIN_CHAT_IDS is not configured");
    return false;
  }

  const text = buildAdminMessage(orderId, order);
  const telegramUserId = Number(order.telegramUserId);
  const replyMarkup =
    order.telegramVerified && Number.isSafeInteger(telegramUserId)
      ? {
          inline_keyboard: [
            [
              {
                text: "💬 Перейти в чат",
                url: order.telegramUsername
                  ? `https://t.me/${encodeURIComponent(order.telegramUsername)}`
                  : `tg://user?id=${telegramUserId}`,
              },
            ],
          ],
        }
      : undefined;

  let delivered = 0;

  for (const chatId of chatIds) {
    try {
      await telegramRequest("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
      delivered++;
    } catch (error) {
      console.error(`Order ${orderId}: admin message failed:`, error);
      continue;
    }

    try {
      await telegramRequest("sendPhoto", {
        chat_id: chatId,
        photo: order.receiptUrl,
        caption: `🧾 Чек к заказу ${formatOrderNumber(orderId)}`,
      });
    } catch (error) {
      console.error(`Order ${orderId}: receipt photo failed:`, error);
    }
  }

  return delivered > 0;
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestIdToken(request);

    if (!user) {
      return fail("Требуется вход", 401);
    }

    let body: { orderId?: unknown; receiptPath?: unknown };

    try {
      body = await request.json();
    } catch {
      return fail("Некорректный запрос", 400);
    }

    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    const receiptPath =
      typeof body.receiptPath === "string" ? body.receiptPath : "";
    const prefix = `receipts/${user.uid}/${orderId}/`;
    const fileName = receiptPath.slice(prefix.length);

    if (
      !orderId ||
      orderId.includes("/") ||
      !receiptPath.startsWith(prefix) ||
      !fileName ||
      fileName.includes("/")
    ) {
      return fail("Некорректный заказ или файл", 400);
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnapshot = await orderRef.get();

    // Чужой заказ не отличаем от несуществующего.
    if (!orderSnapshot.exists || orderSnapshot.get("userId") !== user.uid) {
      return fail("Заказ не найден", 404);
    }

    const existingPath = orderSnapshot.get("receiptPath");

    if (orderSnapshot.get("receiptUrl") && existingPath !== receiptPath) {
      return fail("Чек к этому заказу уже загружен", 409);
    }

    // Файл проверяем на сервере, а не верим клиенту.
    const file = getAdminBucket().file(receiptPath);
    const [exists] = await file.exists();

    if (!exists) {
      return fail("Файл чека не найден", 400);
    }

    const [metadata] = await file.getMetadata();

    if (
      !String(metadata.contentType || "").startsWith("image/") ||
      Number(metadata.size || 0) > MAX_RECEIPT_SIZE
    ) {
      return fail("Чек должен быть изображением до 10 МБ", 400);
    }

    const receiptUrl = await getDownloadURL(file);

    // В транзакции прикрепляем чек и «занимаем» отправку уведомления,
    // чтобы два параллельных запроса не отправили его дважды.
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      const order = snapshot.data();

      if (!order || order.userId !== user.uid) {
        return { status: "not-found" as const };
      }

      if (order.receiptUrl && order.receiptPath !== receiptPath) {
        return { status: "conflict" as const };
      }

      const shouldNotify = !order.notifiedAt;
      const update: Record<string, unknown> = {
        receiptUrl,
        receiptPath,
        receiptFileName: fileName.replace(/^\d+-/, ""),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!order.receiptUrl) {
        update.receiptUploadedAt = FieldValue.serverTimestamp();
      }

      if (shouldNotify) {
        update.notifiedAt = FieldValue.serverTimestamp();
      }

      transaction.update(orderRef, update);

      return {
        status: "ok" as const,
        shouldNotify,
        order: { ...order, receiptUrl, receiptPath },
      };
    });

    if (result.status === "not-found") {
      return fail("Заказ не найден", 404);
    }

    if (result.status === "conflict") {
      return fail("Чек к этому заказу уже загружен", 409);
    }

    if (!result.shouldNotify) {
      // Админы уже уведомлены ранее.
      return NextResponse.json({ ok: true, notified: true });
    }

    const notified = await notifyAdmins(orderId, result.order);

    if (!notified) {
      // Снимаем отметку, чтобы повторный вызов снова попробовал уведомить.
      await orderRef.update({ notifiedAt: FieldValue.delete() });
    }

    return NextResponse.json({ ok: true, notified });
  } catch (error) {
    console.error("Receipt attach failed:", error);

    return fail("Не удалось прикрепить чек", 500);
  }
}

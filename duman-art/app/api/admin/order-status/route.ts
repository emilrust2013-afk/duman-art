import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  getAdminDb,
  isAdminToken,
  verifyRequestIdToken,
} from "../../../firebaseAdmin";
import {
  buildStatusNotification,
  isOrderStatus,
  isPaymentStatus,
} from "../../../shopConfig";

// Смена статуса заказа / оплаты администратором.
// Заказ обновляется через Admin SDK, затем клиенту уходит сообщение в Telegram.
// Ошибка Telegram не откатывает смену статуса.

type RequestBody = {
  orderId?: string;
  status?: string;
  paymentStatus?: string;
};

type Change = {
  field: "status" | "paymentStatus";
  from: string | null;
  to: string;
};

class TelegramError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
  }
}

async function sendTelegramMessage(chatId: string, text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new TelegramError("TELEGRAM_BOT_TOKEN is not configured", 0);
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new TelegramError(
      data?.description || `Telegram API error: ${response.status}`,
      Number(data?.error_code || response.status)
    );
  }
}

// Понятная админу причина, почему сообщение не доставлено.
function describeTelegramError(error: unknown) {
  if (error instanceof TelegramError) {
    if (error.code === 403) {
      return "клиент не запускал бота (/start) или заблокировал его";
    }

    if (error.code === 400 && /chat not found/i.test(error.message)) {
      return "клиент не запускал бота (/start)";
    }
  }

  return "ошибка Telegram";
}

export async function POST(request: Request) {
  try {
    const admin = await verifyRequestIdToken(request);

    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Требуется вход администратора" },
        { status: 401 }
      );
    }

    if (!isAdminToken(admin)) {
      return NextResponse.json(
        { ok: false, error: "Нет прав администратора" },
        { status: 403 }
      );
    }

    let body: RequestBody;

    try {
      body = (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Некорректный запрос" },
        { status: 400 }
      );
    }

    const orderId = String(body.orderId || "").trim();
    const hasStatus = body.status !== undefined;
    const hasPayment = body.paymentStatus !== undefined;

    if (
      !orderId ||
      orderId.includes("/") ||
      (!hasStatus && !hasPayment) ||
      (hasStatus && !isOrderStatus(body.status)) ||
      (hasPayment && !isPaymentStatus(body.paymentStatus))
    ) {
      return NextResponse.json(
        { ok: false, error: "Недопустимый заказ или статус" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);

    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(orderRef);

      if (!snapshot.exists) {
        return null;
      }

      const order = snapshot.data() || {};
      const changes: Change[] = [];

      if (hasStatus && order.status !== body.status) {
        changes.push({
          field: "status",
          from: order.status ?? null,
          to: body.status as string,
        });
      }

      if (hasPayment && order.paymentStatus !== body.paymentStatus) {
        changes.push({
          field: "paymentStatus",
          from: order.paymentStatus ?? null,
          to: body.paymentStatus as string,
        });
      }

      if (changes.length > 0) {
        const now = FieldValue.serverTimestamp();
        // serverTimestamp() нельзя класть внутрь массива — берём время сервера.
        const at = Timestamp.now();
        const update: Record<string, unknown> = {
          updatedAt: now,
          statusHistory: FieldValue.arrayUnion(
            ...changes.map((change) => ({
              ...change,
              by: admin.email || admin.uid,
              at,
            }))
          ),
        };

        for (const change of changes) {
          update[change.field] = change.to;
          update[
            change.field === "status"
              ? "statusUpdatedAt"
              : "paymentStatusUpdatedAt"
          ] = now;
        }

        transaction.update(orderRef, update);
      }

      return { order, changes };
    });

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Заказ не найден" },
        { status: 404 }
      );
    }

    const { order, changes } = result;

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, changed: false, notified: false });
    }

    // Уведомление клиента. Сумма берётся из базы, а не из запроса.
    const total = Number(order.total || 0);
    const texts = changes
      .map((change) =>
        buildStatusNotification(
          change.field,
          change.to,
          orderId,
          total,
          order.deliveryPrice
        )
      )
      .filter((text): text is string => !!text);

    if (texts.length === 0) {
      return NextResponse.json({ ok: true, changed: true, notified: false });
    }

    const chatId = String(order.telegramUserId ?? "").trim();

    if (!/^\d+$/.test(chatId)) {
      return NextResponse.json({
        ok: true,
        changed: true,
        notified: false,
        notifyError: "в заказе нет Telegram ID клиента",
      });
    }

    try {
      await sendTelegramMessage(chatId, texts.join("\n\n"));
    } catch (error) {
      console.error(
        `Telegram status notification for order ${orderId} failed:`,
        error
      );

      return NextResponse.json({
        ok: true,
        changed: true,
        notified: false,
        notifyError: describeTelegramError(error),
      });
    }

    return NextResponse.json({ ok: true, changed: true, notified: true });
  } catch (error) {
    console.error("Order status update failed:", error);

    return NextResponse.json(
      { ok: false, error: "Не удалось изменить статус" },
      { status: 500 }
    );
  }
}

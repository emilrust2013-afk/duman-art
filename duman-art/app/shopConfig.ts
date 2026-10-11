// Общие настройки магазина: используются и в браузере, и на сервере.
// Здесь нет секретов — только списки и тексты.

// Администраторы (email аккаунтов Firebase Auth).
export const ADMIN_EMAILS = [
  "emil@dumanart.local",
  "mama@dumanart.local",
];

export function isAdminEmail(email: string | null | undefined) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export const SHOP_PHONE = "+998 87 907 01 07";

// Статусы заказа, которые может выставить администратор.
// Старые значения в базе (например, «В обработке») продолжают
// отображаться как есть, но выставить их через админку нельзя.
export const ORDER_STATUSES = [
  "Новый",
  "Подтверждён",
  "В доставке",
  "Завершён",
] as const;

export const INITIAL_ORDER_STATUS = "Новый";

// Статусы оплаты.
export const PAYMENT_STATUSES = [
  "Чек ожидает проверки",
  "Не подтверждена",
  "Подтверждена",
] as const;

export const INITIAL_PAYMENT_STATUS = "Чек ожидает проверки";

// Кнопки оплаты в админке (начальный статус выставляет сам клиент).
export const ADMIN_PAYMENT_BUTTONS = [
  "Не подтверждена",
  "Подтверждена",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus);
}

export function formatOrderNumber(orderId: string) {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

// Текст сообщения клиенту в Telegram (HTML) при смене статуса.
// null — для этого значения клиента не уведомляем.
export function buildStatusNotification(
  field: "status" | "paymentStatus",
  value: string,
  orderId: string,
  total: number
): string | null {
  const number = formatOrderNumber(orderId);
  const sum = `💰 Сумма: <b>${new Intl.NumberFormat("ru-RU").format(total)} сум</b>`;

  if (field === "status") {
    switch (value) {
      case "Подтверждён":
        return (
          `✅ <b>Заказ ${number} подтверждён</b>\n\n` +
          `Мы уже готовим его к отправке.\n${sum}`
        );
      case "В доставке":
        return (
          `🚚 <b>Заказ ${number} передан в доставку</b>\n\n` +
          `Курьер уже в пути — скоро заказ будет у вас.\n${sum}`
        );
      case "Завершён":
        return (
          `🎉 <b>Заказ ${number} завершён</b>\n\n` +
          `Спасибо за покупку в Duman Art! 💎\n${sum}`
        );
      default:
        return null;
    }
  }

  switch (value) {
    case "Подтверждена":
      return (
        `💳 <b>Оплата заказа ${number} подтверждена</b>\n\n` +
        `Спасибо! Мы получили ваш платёж.\n${sum}`
      );
    case "Не подтверждена":
      return (
        `⚠️ <b>Мы не смогли подтвердить оплату заказа ${number}</b>\n\n` +
        `Пожалуйста, проверьте чек или свяжитесь с нами: ${SHOP_PHONE}\n${sum}`
      );
    default:
      return null;
  }
}

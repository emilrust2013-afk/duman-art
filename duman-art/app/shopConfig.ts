// Общие настройки магазина: используются и в браузере, и на сервере.
// Здесь нет секретов — только списки и тексты.

// Администраторы определяются custom claim admin: true в Firebase Auth
// (scripts/set-admin-claims.mjs), а не по email.

export const SHOP_PHONE = "+998 87 907 01 07";

// =========================
// ТЕЛЕФОН (Узбекистан)
// =========================

export const PHONE_FORMAT_ERROR = {
  ru: "Введите номер в формате +998 XX XXX XX XX",
  uz: "Raqamni +998 XX XXX XX XX formatida kiriting",
};

// Приводит номер к виду 998XXXXXXXXX. 9 цифр — добавляет 998.
// Возвращает null, если номер не узбекский / неполный.
export function normalizeUzPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 9) {
    return `998${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("998")) {
    return digits;
  }

  return null;
}

// +998 XX XXX XX XX. Если номер не распознан — возвращает как есть.
export function formatUzPhone(value: unknown): string {
  const normalized = normalizeUzPhone(value);

  if (!normalized) {
    return String(value ?? "");
  }

  const local = normalized.slice(3);

  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

// Для поля ввода: хранит только 9 «местных» цифр (без 998).
// Вставленный номер +998... обрезается до местной части.
export function toLocalPhoneDigits(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length > 9 && digits.startsWith("998")) {
    digits = digits.slice(3);
  }

  return digits.slice(0, 9);
}

// Отображение местных цифр в поле: XX XXX XX XX (по мере ввода).
export function formatLocalPhoneInput(local: string): string {
  const digits = local.replace(/\D/g, "").slice(0, 9);

  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}

// Цвет сердечек «Избранное»: фирменный синий; в тёмной теме — светлее,
// чтобы читался на тёмном фоне.
export const FAVORITE_COLOR = {
  light: "#1E4FA8",
  dark: "#6E9BEF",
};

// =========================
// ДОСТАВКА
// =========================

// Настройки доставки хранятся в settings/shop: freeDelivery, deliveryText.
// По умолчанию доставка бесплатная.
export function isFreeDelivery(settings: { freeDelivery?: unknown } | undefined) {
  return settings?.freeDelivery !== false;
}

export const DELIVERY_TEXTS = {
  ru: {
    label: "Доставка",
    free: "Бесплатно",
    byManager: "Стоимость доставки уточнит менеджер",
    cardNote: "Бесплатная доставка по Ташкенту",
  },
  uz: {
    label: "Yetkazib berish",
    free: "Bepul",
    byManager: "Yetkazib berish narxini menejer aniqlaydi",
    cardNote: "Toshkent bo‘ylab bepul yetkazib berish",
  },
};

// Строка для уведомлений в Telegram по полю заказа deliveryPrice.
// undefined — старый заказ без сведений о доставке.
export function deliveryLine(deliveryPrice: unknown): string | null {
  if (deliveryPrice === undefined) {
    return null;
  }

  return deliveryPrice === 0
    ? "🚚 Доставка: бесплатно"
    : "🚚 Доставка: стоимость уточнит менеджер";
}

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
  total: number,
  deliveryPrice?: unknown
): string | null {
  const number = formatOrderNumber(orderId);
  const sum = `💰 Сумма: <b>${new Intl.NumberFormat("ru-RU").format(total)} сум</b>`;
  const delivery = deliveryLine(deliveryPrice);

  if (field === "status") {
    switch (value) {
      case "Подтверждён":
        return (
          `✅ <b>Заказ ${number} подтверждён</b>\n\n` +
          `Мы уже готовим его к отправке.\n${sum}` +
          (delivery ? `\n${delivery}` : "")
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

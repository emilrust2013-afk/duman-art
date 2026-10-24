// Типы Telegram Mini App SDK (telegram-web-app.js) — только то, что использует магазин.

type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
  ready?: () => void;
  expand?: () => void;
};

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}

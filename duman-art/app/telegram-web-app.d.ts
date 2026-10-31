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
  version?: string;
  isVersionAtLeast?: (version: string) => boolean;
  // Bot API 7.7+
  isVerticalSwipesEnabled?: boolean;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  // Bot API 6.1+
  BackButton?: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
};

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}

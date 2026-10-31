"use client";

import { useEffect, useMemo, useRef } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";

import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

// Полноэкранный просмотр фото товара, как в галерее телефона:
// pinch-zoom, двойной тап, перетаскивание при зуме, свайп между фото,
// свайп вниз — закрыть. В браузере: колесо/двойной клик — зум,
// стрелки — листать, Esc — закрыть.

type Props = {
  open: boolean;
  images: string[];
  index: number;
  alt?: string;
  ru: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

// Пока просмотр открыт: в Telegram отключаем вертикальные свайпы мини-приложения
// (иначе свайп вниз сворачивает его) и показываем системную кнопку «Назад».
function useTelegramViewerMode(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    const supports = (version: string) =>
      typeof webApp.isVersionAtLeast === "function"
        ? webApp.isVersionAtLeast(version)
        : false;

    // disableVerticalSwipes появился в Bot API 7.7, BackButton — в 6.1.
    const canToggleSwipes =
      supports("7.7") &&
      typeof webApp.disableVerticalSwipes === "function" &&
      typeof webApp.enableVerticalSwipes === "function";
    // Возвращаем свайпы, только если они были включены до открытия.
    const swipesWereEnabled = webApp.isVerticalSwipesEnabled !== false;
    if (canToggleSwipes) webApp.disableVerticalSwipes?.();

    const backButton = supports("6.1") ? webApp.BackButton : undefined;
    const backWasVisible = backButton?.isVisible === true;
    const handleBack = () => onCloseRef.current();
    backButton?.onClick(handleBack);
    backButton?.show();

    return () => {
      if (canToggleSwipes && swipesWereEnabled) webApp.enableVerticalSwipes?.();
      backButton?.offClick(handleBack);
      if (!backWasVisible) backButton?.hide();
    };
  }, [open]);
}

export default function PhotoViewer({
  open,
  images,
  index,
  alt,
  ru,
  onClose,
  onIndexChange,
}: Props) {
  useTelegramViewerMode(open, onClose);

  const slides = useMemo(
    () => images.filter(Boolean).map((src) => ({ src, alt })),
    [images, alt]
  );
  const single = slides.length <= 1;

  if (slides.length === 0) return null;

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={Math.min(index, slides.length - 1)}
      slides={slides}
      plugins={single ? [Zoom] : [Zoom, Counter, Thumbnails]}
      on={{ view: ({ index: current }) => onIndexChange(current) }}
      carousel={{ finite: true, padding: 0, spacing: "12%", preload: 2 }}
      animation={{ fade: 220, swipe: 280, zoom: 260 }}
      controller={{
        closeOnPullDown: true,
        closeOnBackdropClick: true,
      }}
      zoom={{
        maxZoomPixelRatio: 3,
        zoomInMultiplier: 2,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
        doubleClickMaxStops: 2,
        scrollToZoom: true,
      }}
      counter={{ separator: " / " }}
      thumbnails={{
        position: "bottom",
        width: 56,
        height: 56,
        border: 1.5,
        borderRadius: 12,
        padding: 0,
        gap: 8,
        imageFit: "cover",
        vignette: false,
        showToggle: false,
      }}
      labels={
        ru
          ? {
              Close: "Закрыть",
              Previous: "Предыдущее фото",
              Next: "Следующее фото",
              "Zoom in": "Приблизить",
              "Zoom out": "Отдалить",
              Lightbox: "Просмотр фото",
              Carousel: "Фото товара",
              Slide: "Фото",
              Thumbnails: "Миниатюры",
            }
          : {
              Close: "Yopish",
              Previous: "Oldingi rasm",
              Next: "Keyingi rasm",
              "Zoom in": "Kattalashtirish",
              "Zoom out": "Kichiklashtirish",
              Lightbox: "Rasmni ko‘rish",
              Carousel: "Mahsulot rasmlari",
              Slide: "Rasm",
              Thumbnails: "Kichik rasmlar",
            }
      }
      render={{
        // Кнопки лупы не нужны: зум жестами, двойным тапом и колесом.
        buttonZoom: () => null,
        ...(single ? { buttonPrev: () => null, buttonNext: () => null } : {}),
      }}
      className="duman-viewer"
      styles={{
        root: {
          "--yarl__color_backdrop": "rgba(14, 12, 10, 0.97)",
          "--yarl__color_button": "rgba(244, 240, 233, 0.82)",
          "--yarl__color_button_active": "#f4f0e9",
          "--yarl__color_button_disabled": "rgba(244, 240, 233, 0.25)",
          "--yarl__button_filter": "none",
          "--yarl__fade_animation_timing_function": "cubic-bezier(0.22, 1, 0.36, 1)",
          "--yarl__counter_filter": "none",
          "--yarl__counter_color": "rgba(244, 240, 233, 0.82)",
          "--yarl__thumbnails_container_padding": "12px 16px calc(14px + env(safe-area-inset-bottom))",
          "--yarl__thumbnails_thumbnail_background": "#2b2723",
          "--yarl__thumbnails_thumbnail_border_color": "transparent",
          "--yarl__thumbnails_thumbnail_active_border_color": "#cfb28c",
        },
        toolbar: { paddingTop: "calc(8px + env(safe-area-inset-top))" },
      }}
    />
  );
}

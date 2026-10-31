"use client";

import { useEffect, useMemo, useState, type TouchEvent } from "react";
import { collection, getDocs, type DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { FAVORITE_COLOR } from "./shopConfig";
import PhotoViewer from "./PhotoViewer";

type Language = "ru" | "uz";

type Product = {
  id: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
  price: number;
  collection?: string;
  description?: string;
  descriptionRu?: string;
  descriptionUz?: string;
  available?: boolean;
  imageUrls?: string[];
  imageUrl?: string;

  // Будущие поля — показываем только если они уже есть в Firestore.
  size?: string | string[];
  sizes?: string | string[];
  color?: string;
  colors?: string | string[];
  sku?: string;
  article?: string;
};

type Props = {
  language: Language;
  // Строка о доставке под ценой в карточке товара (пусто — не показывать).
  deliveryNote?: string;
};

function getName(product: Product, language: Language) {
  if (language === "uz") {
    return product.nameUz || product.nameRu || product.name || "Mahsulot";
  }

  return product.nameRu || product.nameUz || product.name || "Товар";
}

function getDescription(product: Product, language: Language) {
  if (language === "uz") {
    return (
      product.descriptionUz ||
      product.descriptionRu ||
      product.description ||
      ""
    );
  }

  return (
    product.descriptionRu ||
    product.descriptionUz ||
    product.description ||
    ""
  );
}

function normalizeProduct(id: string, data: DocumentData): Product {
  return {
    id,
    name: data.name || data.nameRu || data.nameUz || "Товар",
    nameRu: data.nameRu || "",
    nameUz: data.nameUz || "",
    price: Number(data.price || 0),
    collection: String(data.collection || "").trim(),
    description: data.description || "",
    descriptionRu: data.descriptionRu || "",
    descriptionUz: data.descriptionUz || "",
    available:
      typeof data.available === "boolean" ? data.available : true,
    imageUrls: Array.isArray(data.imageUrls)
      ? data.imageUrls.filter(Boolean)
      : data.imageUrl
      ? [data.imageUrl]
      : [],
    imageUrl: data.imageUrl || "",
    size: data.size,
    sizes: data.sizes,
    color: data.color,
    colors: data.colors,
    sku: data.sku,
    article: data.article,
  };
}

function normalizeList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

// Синее сердце: заполненное — товар в избранном, контур — нет.
function IconHeart({
  filled,
  color,
  className = "h-[19px] w-[19px]",
}: {
  filled: boolean;
  color: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ color }}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M20.8 8.6c0 5.4-8.8 10-8.8 10s-8.8-4.6-8.8-10A4.6 4.6 0 0 1 12 5.7a4.6 4.6 0 0 1 8.8 2.9Z" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M6.5 8.5h11l1 11h-13l1-11Z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.2 4.2" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function IconChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {direction === "left" ? (
        <path d="m14.5 5-7 7 7 7" />
      ) : (
        <path d="m9.5 5 7 7-7 7" />
      )}
    </svg>
  );
}

export default function HomeCatalog({ language, deliveryNote }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("Все");

  const [favorites, setFavorites] = useState<string[]>([]);
  const [cart, setCart] = useState<
    { productId: string; quantity: number }[]
  >([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    null
  );
  const [selectedImage, setSelectedImage] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const [isDark, setIsDark] = useState(false);

  const ru = language === "ru";

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      try {
        setLoading(true);
        const snapshot = await getDocs(collection(db, "products"));

        if (!mounted) return;

        const loaded = snapshot.docs.map((item) =>
          normalizeProduct(item.id, item.data())
        );

        loaded.sort((a, b) =>
          getName(a, language).localeCompare(getName(b, language))
        );

        setProducts(loaded);
      } catch (error) {
        console.error("Ошибка загрузки товаров:", error);
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, [language]);

  useEffect(() => {
    const readState = () => {
      try {
        const savedFavorites = JSON.parse(
          localStorage.getItem("dumanart_favorites") || "[]"
        );

        setFavorites(
          Array.isArray(savedFavorites)
            ? savedFavorites.map(String).filter(Boolean)
            : []
        );

        const savedCart = JSON.parse(
          localStorage.getItem("dumanart_cart") || "[]"
        );

        setCart(
          Array.isArray(savedCart)
            ? savedCart
                .map((item: { productId?: unknown; id?: unknown; quantity?: unknown } | null) => ({
                  productId: String(
                    item?.productId || item?.id || ""
                  ),
                  quantity: Math.max(1, Number(item?.quantity || 1)),
                }))
                .filter((item: { productId: string }) =>
                  Boolean(item.productId)
                )
            : []
        );
      } catch (error) {
        console.error("Ошибка чтения корзины/избранного:", error);
      }
    };

    readState();

    const events = [
      "cartUpdated",
      "dumanart-cart-updated",
      "favoritesUpdated",
      "dumanart-favorites-updated",
      "storage",
    ];

    events.forEach((eventName) =>
      window.addEventListener(eventName, readState)
    );

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, readState)
      );
    };
  }, []);

  // Тема хранится в localStorage как dumanart_theme.
  // Проверяем её также во время работы приложения, чтобы каталог
  // реагировал на смену темы без дополнительных правок page.tsx.
  useEffect(() => {
    const readTheme = () => {
      setIsDark(localStorage.getItem("dumanart_theme") === "dark");
    };

    readTheme();

    const handleThemeEvent = () => readTheme();
    window.addEventListener("dumanart-theme-updated", handleThemeEvent);

    const interval = window.setInterval(readTheme, 300);

    return () => {
      window.removeEventListener(
        "dumanart-theme-updated",
        handleThemeEvent
      );
      window.clearInterval(interval);
    };
  }, []);

  const collections = useMemo(() => {
    const values = products
      .map((product) => product.collection || "")
      .filter(Boolean);

    return [
      "Все",
      ...Array.from(new Set(values)).sort((a, b) =>
        a.localeCompare(b)
      ),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = queryText.trim().toLowerCase();

    return products.filter((product) => {
      const name = `${product.name} ${product.nameRu || ""} ${
        product.nameUz || ""
      }`.toLowerCase();

      const description = `${product.description || ""} ${
        product.descriptionRu || ""
      } ${product.descriptionUz || ""}`.toLowerCase();

      const collectionName = (product.collection || "").toLowerCase();

      const matchesQuery =
        !normalizedQuery ||
        name.includes(normalizedQuery) ||
        description.includes(normalizedQuery) ||
        collectionName.includes(normalizedQuery);

      const matchesCollection =
        selectedCollection === "Все" ||
        (product.collection || "") === selectedCollection;

      return matchesQuery && matchesCollection;
    });
  }, [products, queryText, selectedCollection]);

  function saveFavorites(next: string[]) {
    setFavorites(next);
    localStorage.setItem("dumanart_favorites", JSON.stringify(next));
    window.dispatchEvent(new Event("favoritesUpdated"));
    window.dispatchEvent(new Event("dumanart-favorites-updated"));
  }

  function toggleFavorite(id: string) {
    if (favorites.includes(id)) {
      saveFavorites(favorites.filter((item) => item !== id));
      return;
    }

    saveFavorites([...favorites, id]);
  }

  function getCartQuantity(id: string) {
    return cart.find((item) => item.productId === id)?.quantity || 0;
  }

  function saveCart(next: { productId: string; quantity: number }[]) {
    const cleaned = next.filter((item) => item.quantity > 0);

    setCart(cleaned);
    localStorage.setItem("dumanart_cart", JSON.stringify(cleaned));
    window.dispatchEvent(new Event("cartUpdated"));
    window.dispatchEvent(new Event("dumanart-cart-updated"));
  }

  function addToCart(id: string) {
    const existing = cart.find((item) => item.productId === id);

    if (existing) {
      saveCart(
        cart.map((item) =>
          item.productId === id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      return;
    }

    saveCart([...cart, { productId: id, quantity: 1 }]);
  }

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedImage(0);
    setViewerOpen(false);
    setTouchStartX(null);
  }

  function closeProduct() {
    setSelectedProduct(null);
    setSelectedImage(0);
    setViewerOpen(false);
    setTouchStartX(null);
  }

  function goToImage(nextIndex: number) {
    if (!selectedProduct) return;

    const images =
      selectedProduct.imageUrls && selectedProduct.imageUrls.length > 0
        ? selectedProduct.imageUrls
        : [""];

    const safeIndex =
      (nextIndex + images.length) % images.length;

    setSelectedImage(safeIndex);
  }

  function handleTouchStart(
    event: TouchEvent<HTMLDivElement>
  ) {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  }

  function handleTouchEnd(
    event: TouchEvent<HTMLDivElement>
  ) {
    if (touchStartX === null || !selectedProduct) return;

    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const delta = endX - touchStartX;

    setTouchStartX(null);

    if (Math.abs(delta) < 45) return;

    const images =
      selectedProduct.imageUrls && selectedProduct.imageUrls.length > 0
        ? selectedProduct.imageUrls
        : [""];

    if (images.length <= 1) return;

    if (delta < 0) {
      goToImage(selectedImage + 1);
    } else {
      goToImage(selectedImage - 1);
    }
  }

  const favoriteColor = isDark ? FAVORITE_COLOR.dark : FAVORITE_COLOR.light;

  const page = {
    bg: isDark ? "bg-[#151311]" : "bg-[#f4f0e9]",
    text: isDark ? "text-[#f4f0e9]" : "text-[#171717]",
    subtext: isDark ? "text-[#a9a198]" : "text-[#81796f]",
    muted: isDark ? "text-[#c1b8ae]" : "text-[#756d64]",
    card: isDark ? "bg-[#211f1d]" : "bg-white",
    soft: isDark ? "bg-[#2b2723]" : "bg-[#f9f6f1]",
    imageBg: isDark ? "bg-[#302a24]" : "bg-[#ece5db]",
    border: isDark ? "border-[#3a3530]" : "border-[#e4dbcf]",
    accent: isDark ? "text-[#cfb28c]" : "text-[#a28b6c]",
    button: isDark ? "bg-[#f4f0e9] text-[#171717]" : "bg-[#171717] text-white",
    ghostButton: isDark
      ? "bg-[#2a2622] text-[#f4f0e9]"
      : "bg-[#f4f0e9] text-[#6f675e]",
    overlay: "bg-black/65",
  };

  const selectedImages =
    selectedProduct?.imageUrls && selectedProduct.imageUrls.length > 0
      ? selectedProduct.imageUrls
      : [""];

  const selectedName = selectedProduct
    ? getName(selectedProduct, language)
    : "";

  return (
    <div className={page.text}>
      <style jsx>{`
        @keyframes dumanModalIn {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes dumanImageFade {
          from { opacity: 0.55; }
          to { opacity: 1; }
        }

        .duman-product-modal {
          animation: dumanModalIn 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .duman-product-image {
          animation: dumanImageFade 0.2s ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .duman-product-modal,
          .duman-product-image {
            animation: none;
          }
        }
      `}</style>
      <div
        className={`sticky top-0 z-30 -mx-0 pb-3 pt-1 backdrop-blur-xl ${
          isDark ? "bg-[#151311]/95" : "bg-[#f4f0e9]/95"
        }`}
      >
        <div className="relative">
          <span
            className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
              isDark ? "text-[#b8aea3]" : "text-[#9b8b78]"
            }`}
          >
            <IconSearch />
          </span>

          <input
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder={
              ru
                ? "Найти украшение..."
                : "Zargarlik buyumini qidiring..."
            }
            className={`w-full rounded-[18px] border px-4 py-3.5 pl-11 pr-4 text-sm outline-none transition focus:ring-2 ${
              isDark
                ? "border-[#3a3530] bg-[#211f1d] text-[#f4f0e9] placeholder:text-[#8f887f] focus:ring-[#6d5b47]/40"
                : "border-[#e4dbcf] bg-white text-[#171717] placeholder:text-[#a69c90] focus:ring-[#b79a77]/25"
            }`}
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {collections.map((item) => {
            const active = selectedCollection === item;
            const label =
              item === "Все" ? (ru ? "Все" : "Barchasi") : item;

            return (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedCollection(item)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs transition active:scale-[0.97] ${
                  active
                    ? page.button
                    : isDark
                    ? "bg-[#211f1d] text-[#b7afa6] border border-[#3a3530]"
                    : "bg-white text-[#756d64] shadow-sm"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <p
            className={`text-[9px] uppercase tracking-[0.28em] ${page.accent}`}
          >
            Duman Art
          </p>
          <h2 className="mt-1 font-serif text-[25px]">
            {ru ? "Украшения" : "Zargarlik buyumlari"}
          </h2>
        </div>

        <span className={`text-xs ${page.subtext}`}>
          {filteredProducts.length} {ru ? "товаров" : "mahsulot"}
        </span>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className={`overflow-hidden rounded-[23px] ${page.card} border ${page.border}`}
            >
              <div
                className={`aspect-square animate-pulse ${page.imageBg}`}
              />
              <div className="space-y-2 p-3.5">
                <div
                  className={`h-3 animate-pulse rounded ${page.imageBg}`}
                />
                <div
                  className={`h-4 w-3/4 animate-pulse rounded ${page.imageBg}`}
                />
                <div
                  className={`h-4 w-1/2 animate-pulse rounded ${page.imageBg}`}
                />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div
          className={`mt-6 rounded-[26px] border ${page.border} ${page.card} p-8 text-center`}
        >
          <div className={`mx-auto w-fit rounded-full p-3 ${page.soft}`}>
            <IconSearch />
          </div>

          <h3 className="mt-4 font-serif text-xl">
            {ru ? "Ничего не найдено" : "Hech narsa topilmadi"}
          </h3>

          <p className={`mt-2 text-sm leading-6 ${page.subtext}`}>
            {ru
              ? "Попробуйте изменить запрос или выбрать другую коллекцию."
              : "Qidiruvni yoki kolleksiyani o‘zgartirib ko‘ring."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => {
            const name = getName(product, language);
            const image =
              product.imageUrls?.[0] || product.imageUrl || "";
            const favorite = favorites.includes(product.id);
            const quantity = getCartQuantity(product.id);
            const imageCount = product.imageUrls?.length || 0;

            return (
              <article
                key={product.id}
                className={`group overflow-hidden rounded-[23px] border ${page.border} ${page.card} shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
              >
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openProduct(product)}
                    className="block w-full text-left"
                    aria-label={ru ? `Открыть ${name}` : `Ochish: ${name}`}
                  >
                    <div
                      className={`relative aspect-square overflow-hidden ${page.imageBg}`}
                    >
                      {image ? (
                        <img
                          src={image}
                          alt={name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                        />
                      ) : (
                        <div
                          className={`flex h-full items-center justify-center ${page.subtext}`}
                        >
                          <span className="font-serif text-5xl">
                            D
                          </span>
                        </div>
                      )}

                      {imageCount > 1 && (
                        <span
                          className={`absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[9px] backdrop-blur ${
                            isDark
                              ? "bg-black/45 text-white"
                              : "bg-white/85 text-[#514a43]"
                          }`}
                        >
                          {imageCount} {ru ? "фото" : "rasm"}
                        </span>
                      )}

                      {product.available === false && (
                        <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[9px] text-white backdrop-blur">
                          {ru ? "Нет в наличии" : "Mavjud emas"}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label={
                      favorite
                        ? ru
                          ? "Убрать из избранного"
                          : "Sevimlilardan olib tashlash"
                        : ru
                        ? "Добавить в избранное"
                        : "Sevimlilarga qo‘shish"
                    }
                    onClick={() => toggleFavorite(product.id)}
                    className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full shadow-sm backdrop-blur transition active:scale-90 ${
                      isDark ? "bg-[#211f1d]/92" : "bg-white/95"
                    }`}
                  >
                    <IconHeart filled={favorite} color={favoriteColor} />
                  </button>
                </div>

                <div className="p-3.5">
                  {product.collection && (
                    <p
                      className={`text-[9px] uppercase tracking-[0.13em] ${page.accent}`}
                    >
                      {product.collection}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => openProduct(product)}
                    className="mt-1 block w-full text-left font-serif text-[17px] leading-5"
                  >
                    {name}
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold leading-5">
                      {formatPrice(product.price)}{" "}
                      <span
                        className={`text-[11px] font-normal ${page.subtext}`}
                      >
                        сум
                      </span>
                    </p>

                    <button
                      type="button"
                      disabled={product.available === false}
                      onClick={() => addToCart(product.id)}
                      aria-label={
                        ru ? "Добавить в корзину" : "Savatga qo‘shish"
                      }
                      className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-45 ${
                        quantity > 0
                          ? isDark
                            ? "bg-[#f4f0e9] text-[#171717]"
                            : "bg-[#171717] text-white"
                          : page.button
                      }`}
                    >
                      <IconBag />
                      {quantity > 0 && (
                        <span className="ml-1 text-[10px] font-medium">
                          {quantity}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <div
          className={`fixed inset-0 z-[90] flex items-end justify-center ${page.overlay} p-2 backdrop-blur-sm`}
          onClick={closeProduct}
        >
          <div
            className={`duman-product-modal w-full max-w-[520px] overflow-hidden rounded-[30px] border ${page.border} ${page.card} shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`relative ${page.imageBg}`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="aspect-square overflow-hidden">
                {selectedImages[selectedImage] ? (
                  <img
                    key={`${selectedImages[selectedImage]}-${selectedImage}`}
                    src={selectedImages[selectedImage]}
                    alt={selectedName}
                    onClick={() => setViewerOpen(true)}
                    className="duman-product-image h-full w-full cursor-zoom-in object-contain select-none"
                    draggable={false}
                  />
                ) : (
                  <div
                    className={`flex h-full items-center justify-center font-serif text-7xl ${page.subtext}`}
                  >
                    D
                  </div>
                )}
              </div>

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
                <span
                  className={`rounded-full px-3 py-1.5 text-[10px] backdrop-blur ${
                    isDark
                      ? "bg-black/40 text-white"
                      : "bg-white/85 text-[#514a43]"
                  }`}
                >
                  {selectedImages.length > 1
                    ? `${selectedImage + 1} / ${selectedImages.length}`
                    : ru
                    ? "Фото товара"
                    : "Mahsulot rasmi"}
                </span>

                <button
                  type="button"
                  onClick={closeProduct}
                  className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full backdrop-blur ${
                    isDark
                      ? "bg-black/45 text-white"
                      : "bg-white/90 text-[#3f3a35]"
                  }`}
                  aria-label={ru ? "Закрыть" : "Yopish"}
                >
                  <IconClose />
                </button>
              </div>

              {selectedImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => goToImage(selectedImage - 1)}
                    className={`absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full shadow backdrop-blur ${
                      isDark
                        ? "bg-black/45 text-white"
                        : "bg-white/90 text-[#3f3a35]"
                    }`}
                    aria-label={ru ? "Предыдущее фото" : "Oldingi rasm"}
                  >
                    <IconChevron direction="left" />
                  </button>

                  <button
                    type="button"
                    onClick={() => goToImage(selectedImage + 1)}
                    className={`absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full shadow backdrop-blur ${
                      isDark
                        ? "bg-black/45 text-white"
                        : "bg-white/90 text-[#3f3a35]"
                    }`}
                    aria-label={ru ? "Следующее фото" : "Keyingi rasm"}
                  >
                    <IconChevron direction="right" />
                  </button>
                </>
              )}

              {selectedImages.length > 1 && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-2 backdrop-blur bg-black/20">
                  {selectedImages.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        goToImage(index);
                      }}
                      aria-label={
                        ru
                          ? `Фото ${index + 1}`
                          : `Rasm ${index + 1}`
                      }
                      className={`h-1.5 rounded-full transition-all ${
                        index === selectedImage
                          ? "w-5 bg-white"
                          : "w-1.5 bg-white/55"
                      }`}
                    />
                  ))}
                </div>
              )}

            </div>

            {selectedImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-b px-4 py-3 [scrollbar-width:none]">
                {selectedImages.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => goToImage(index)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border-2 transition ${
                      index === selectedImage
                        ? isDark
                          ? "border-[#c8aa80]"
                          : "border-[#171717]"
                        : page.border
                    } ${page.imageBg}`}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[46vh] overflow-y-auto px-5 pb-6 pt-5">
              {selectedProduct.collection && (
                <p className={`text-[9px] uppercase tracking-[0.16em] ${page.accent}`}>
                  {selectedProduct.collection}
                </p>
              )}

              <h3 className="mt-1 font-serif text-[26px] leading-8">
                {selectedName}
              </h3>

              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-xl font-semibold">
                  {formatPrice(selectedProduct.price)}
                </p>
                <span className={`text-xs ${page.subtext}`}>сум</span>
              </div>

              {deliveryNote && (
                <p className={`mt-1.5 text-xs ${page.subtext}`}>
                  🚚 {deliveryNote}
                </p>
              )}

              {getDescription(selectedProduct, language) && (
                <p className={`mt-4 text-sm leading-6 ${page.subtext}`}>
                  {getDescription(selectedProduct, language)}
                </p>
              )}

              {(normalizeList(selectedProduct.size || selectedProduct.sizes).length >
                0 ||
                normalizeList(
                  selectedProduct.color || selectedProduct.colors
                ).length > 0 ||
                selectedProduct.sku ||
                selectedProduct.article) && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {normalizeList(
                    selectedProduct.size || selectedProduct.sizes
                  ).length > 0 && (
                    <div className={`rounded-[16px] ${page.soft} p-3`}>
                      <p className={`text-[10px] ${page.subtext}`}>
                        {ru ? "Размер" : "O‘lcham"}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {normalizeList(
                          selectedProduct.size || selectedProduct.sizes
                        ).join(", ")}
                      </p>
                    </div>
                  )}

                  {normalizeList(
                    selectedProduct.color || selectedProduct.colors
                  ).length > 0 && (
                    <div className={`rounded-[16px] ${page.soft} p-3`}>
                      <p className={`text-[10px] ${page.subtext}`}>
                        {ru ? "Цвет" : "Rang"}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {normalizeList(
                          selectedProduct.color || selectedProduct.colors
                        ).join(", ")}
                      </p>
                    </div>
                  )}

                  {(selectedProduct.sku || selectedProduct.article) && (
                    <div
                      className={`col-span-2 rounded-[16px] ${page.soft} p-3`}
                    >
                      <p className={`text-[10px] ${page.subtext}`}>
                        {ru ? "Артикул" : "Artikul"}
                      </p>
                      <p className="mt-1 text-sm font-medium tracking-wide">
                        {selectedProduct.sku || selectedProduct.article}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => toggleFavorite(selectedProduct.id)}
                  className={`flex items-center justify-center gap-2 rounded-full border ${page.border} py-3.5 text-sm font-medium transition active:scale-[0.98] ${page.ghostButton}`}
                >
                  <IconHeart
                    filled={favorites.includes(selectedProduct.id)}
                    color={favoriteColor}
                    className="h-[17px] w-[17px]"
                  />
                  {favorites.includes(selectedProduct.id)
                    ? ru
                      ? "В избранном"
                      : "Sevimlilarda"
                    : ru
                    ? "В избранное"
                    : "Sevimlilarga"}
                </button>

                <button
                  type="button"
                  disabled={selectedProduct.available === false}
                  onClick={() => addToCart(selectedProduct.id)}
                  className={`flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-45 ${page.button}`}
                >
                  <IconBag />
                  {selectedProduct.available === false
                    ? ru
                      ? "Нет в наличии"
                      : "Mavjud emas"
                    : ru
                    ? "В корзину"
                    : "Savatga"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <PhotoViewer
          open={viewerOpen}
          images={selectedImages}
          index={selectedImage}
          alt={selectedName}
          ru={ru}
          onClose={() => setViewerOpen(false)}
          onIndexChange={setSelectedImage}
        />
      )}
    </div>
  );
}

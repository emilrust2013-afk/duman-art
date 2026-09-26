"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";

type Language = "ru" | "uz";

type Product = {
  id: string;

  nameRu?: string;
  nameUz?: string;
  descriptionRu?: string;
  descriptionUz?: string;

  // Старые поля для совместимости
  name?: string;
  description?: string;

  price: number;
  collection?: string;
  available?: boolean;

  imageUrls?: string[];
  imageUrl?: string;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type ProductsProps = {
  language?: Language;
};

const CART_KEY = "dumanart_cart";
const FAVORITES_KEY = "dumanart_favorites";

function getName(product: Product, language: Language) {
  if (language === "uz") {
    return (
      product.nameUz ||
      product.nameRu ||
      product.name ||
      "Mahsulot"
    );
  }

  return (
    product.nameRu ||
    product.nameUz ||
    product.name ||
    "Товар"
  );
}

function getDescription(
  product: Product,
  language: Language
) {
  if (language === "uz") {
    return (
      product.descriptionUz ||
      product.descriptionRu ||
      product.description ||
      "Tavsif mavjud emas."
    );
  }

  return (
    product.descriptionRu ||
    product.descriptionUz ||
    product.description ||
    "Описание отсутствует."
  );
}

function getImages(product: Product) {
  if (
    Array.isArray(product.imageUrls) &&
    product.imageUrls.length > 0
  ) {
    return product.imageUrls;
  }

  if (product.imageUrl) {
    return [product.imageUrl];
  }

  return [];
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("ru-RU").format(price);
}

export default function Products({
  language = "ru",
}: ProductsProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [storageReady, setStorageReady] = useState(false);

  const [selectedProduct, setSelectedProduct] =
    useState<Product | null>(null);

  const [selectedImage, setSelectedImage] = useState(0);

  // =========================
  // LOAD LOCAL STORAGE
  // =========================

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(CART_KEY);
      const savedFavorites =
        localStorage.getItem(FAVORITES_KEY);

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);

        if (Array.isArray(parsedCart)) {
          setCart(parsedCart);
        }
      }

      if (savedFavorites) {
        const parsedFavorites =
          JSON.parse(savedFavorites);

        if (Array.isArray(parsedFavorites)) {
          setFavorites(parsedFavorites);
        }
      }
    } catch (error) {
      console.error(
        "Ошибка загрузки корзины/избранного:",
        error
      );
    } finally {
      setStorageReady(true);
    }
  }, []);

  // =========================
  // SAVE CART
  // =========================

  useEffect(() => {
    if (!storageReady) return;

    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify(cart)
      );

      window.dispatchEvent(
        new CustomEvent("dumanart-cart-updated", {
          detail: cart,
        })
      );
    } catch (error) {
      console.error(
        "Ошибка сохранения корзины:",
        error
      );
    }
  }, [cart, storageReady]);

  // =========================
  // SAVE FAVORITES
  // =========================

  useEffect(() => {
    if (!storageReady) return;

    try {
      localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favorites)
      );

      window.dispatchEvent(
        new CustomEvent("dumanart-favorites-updated", {
          detail: favorites,
        })
      );
    } catch (error) {
      console.error(
        "Ошибка сохранения избранного:",
        error
      );
    }
  }, [favorites, storageReady]);

  // =========================
  // LOAD PRODUCTS
  // =========================

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);

        const snapshot = await getDocs(
          collection(db, "products")
        );

        const loaded: Product[] =
          snapshot.docs.map(
            (
              document:
                QueryDocumentSnapshot<DocumentData>
            ) => {
              const data = document.data();

              return {
                id: document.id,

                nameRu: data.nameRu,
                nameUz: data.nameUz,

                descriptionRu: data.descriptionRu,
                descriptionUz: data.descriptionUz,

                name: data.name,
                description: data.description,

                price: Number(data.price || 0),

                collection:
                  data.collection || "",

                available:
                  typeof data.available ===
                  "boolean"
                    ? data.available
                    : true,

                imageUrls:
                  Array.isArray(data.imageUrls)
                    ? data.imageUrls
                    : [],

                imageUrl:
                  data.imageUrl || "",
              };
            }
          );

        setProducts(loaded);
      } catch (error) {
        console.error(
          "Ошибка загрузки товаров:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  // =========================
  // CART
  // =========================

  function getQuantity(productId: string) {
    const item = cart.find(
      (cartItem) =>
        cartItem.productId === productId
    );

    return item?.quantity || 0;
  }

  function addToCart(productId: string) {
    setCart((current) => {
      const existing = current.find(
        (item) =>
          item.productId === productId
      );

      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId,
          quantity: 1,
        },
      ];
    });
  }

  function decreaseQuantity(
    productId: string
  ) {
    setCart((current) => {
      const existing = current.find(
        (item) =>
          item.productId === productId
      );

      if (!existing) return current;

      if (existing.quantity <= 1) {
        return current.filter(
          (item) =>
            item.productId !== productId
        );
      }

      return current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: item.quantity - 1,
            }
          : item
      );
    });
  }

  function increaseQuantity(
    productId: string
  ) {
    addToCart(productId);
  }

  // =========================
  // FAVORITES
  // =========================

  function isFavorite(productId: string) {
    return favorites.includes(productId);
  }

  function toggleFavorite(
    productId: string
  ) {
    setFavorites((current) => {
      if (current.includes(productId)) {
        return current.filter(
          (id) => id !== productId
        );
      }

      return [...current, productId];
    });
  }

  // =========================
  // PRODUCT MODAL
  // =========================

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedImage(0);
  }

  function closeProduct() {
    setSelectedProduct(null);
    setSelectedImage(0);
  }

  const cartCount = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total + item.quantity,
      0
    );
  }, [cart]);

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <section className="px-5 py-10">
        <div className="rounded-[28px] bg-white p-8 text-center shadow-sm">
          <div className="animate-pulse text-4xl">
            💎
          </div>

          <p className="mt-4 text-sm text-[#777066]">
            {language === "uz"
              ? "Mahsulotlar yuklanmoqda..."
              : "Загружаем украшения..."}
          </p>
        </div>
      </section>
    );
  }

  // =========================
  // EMPTY
  // =========================

  if (products.length === 0) {
    return (
      <section className="px-5 py-10">
        <div className="rounded-[28px] bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">
            💎
          </div>

          <h2 className="mt-4 font-serif text-xl">
            {language === "uz"
              ? "Mahsulotlar hozircha yo‘q"
              : "Пока товаров нет"}
          </h2>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* =========================
          CATALOG
      ========================= */}

      <section className="px-5 pb-32 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-[#a28b6c]">
              Duman Art
            </p>

            <h2 className="mt-2 font-serif text-3xl">
              {language === "uz"
                ? "Mahsulotlarimiz"
                : "Наши украшения"}
            </h2>

            <p className="mt-2 text-sm text-[#777066]">
              {language === "uz"
                ? "O‘zingizga mos taqinchoqni toping."
                : "Найдите украшение для себя."}
            </p>
          </div>

          <div className="rounded-full bg-white px-3 py-2 text-xs text-[#806c53] shadow-sm">
            🛍 {cartCount}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {products.map((product) => {
            const images =
              getImages(product);

            const name = getName(
              product,
              language
            );

            const quantity =
              getQuantity(product.id);

            const favorite =
              isFavorite(product.id);

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-[22px] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                {/* IMAGE */}
                <div
                  onClick={() =>
                    openProduct(product)
                  }
                  className="relative aspect-square cursor-pointer overflow-hidden bg-[#eee7de]"
                >
                  {images.length > 0 ? (
                    <img
                      src={images[0]}
                      alt={name}
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      💎
                    </div>
                  )}

                  {/* FAVORITE */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();

                      toggleFavorite(
                        product.id
                      );
                    }}
                    className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-xl shadow-sm transition-transform active:scale-90"
                    aria-label="Избранное"
                  >
                    {favorite
                      ? "♥"
                      : "♡"}
                  </button>

                  {!product.available && (
                    <div className="absolute bottom-2 left-2 rounded-full bg-white/90 px-3 py-1 text-[10px] shadow-sm">
                      {language === "uz"
                        ? "Mavjud emas"
                        : "Нет в наличии"}
                    </div>
                  )}
                </div>

                {/* INFO */}
                <div
                  onClick={() =>
                    openProduct(product)
                  }
                  className="cursor-pointer p-3"
                >
                  <h3 className="line-clamp-2 min-h-[42px] font-serif text-[16px] leading-5">
                    {name}
                  </h3>

                  {product.collection && (
                    <p className="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-[#a28b6c]">
                      {product.collection}
                    </p>
                  )}

                  <p className="mt-2 text-sm font-medium">
                    {formatPrice(product.price)}{" "}
                    сум
                  </p>
                </div>

                {/* CART BUTTON */}
                <div className="px-3 pb-3">
                  {quantity > 0 ? (
                    <div className="flex items-center justify-between rounded-full bg-[#f1ece5] px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          decreaseQuantity(
                            product.id
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg shadow-sm transition-transform active:scale-90"
                      >
                        −
                      </button>

                      <span className="text-sm font-semibold">
                        {quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          increaseQuantity(
                            product.id
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#171717] text-lg text-white transition-transform active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        product.available ===
                        false
                      }
                      onClick={() =>
                        addToCart(
                          product.id
                        )
                      }
                      className="w-full rounded-full bg-[#171717] px-3 py-3 text-xs text-white transition-all hover:bg-[#333] active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-[#c8c1b8]"
                    >
                      {product.available ===
                      false
                        ? language === "uz"
                          ? "Mavjud emas"
                          : "Нет в наличии"
                        : language === "uz"
                        ? "Savatga qo‘shish"
                        : "Добавить в корзину"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* =========================
          PRODUCT MODAL
      ========================= */}

      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4"
          onClick={closeProduct}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[30px] bg-[#f7f3ee] sm:max-w-[520px] sm:rounded-[30px]"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={closeProduct}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pb-8">
              {(() => {
                const images =
                  getImages(
                    selectedProduct
                  );

                const name = getName(
                  selectedProduct,
                  language
                );

                const description =
                  getDescription(
                    selectedProduct,
                    language
                  );

                const quantity =
                  getQuantity(
                    selectedProduct.id
                  );

                const favorite =
                  isFavorite(
                    selectedProduct.id
                  );

                return (
                  <>
                    {/* MAIN IMAGE */}
                    <div className="overflow-hidden rounded-[26px] bg-[#e8e0d5]">
                      {images.length > 0 ? (
                        <img
                          src={
                            images[
                              selectedImage
                            ] ||
                            images[0]
                          }
                          alt={name}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-6xl">
                          💎
                        </div>
                      )}
                    </div>

                    {/* THUMBNAILS */}
                    {images.length > 1 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {images.map(
                          (
                            image,
                            index
                          ) => (
                            <button
                              key={`${image}-${index}`}
                              type="button"
                              onClick={() =>
                                setSelectedImage(
                                  index
                                )
                              }
                              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${
                                selectedImage ===
                                index
                                  ? "border-[#171717]"
                                  : "border-transparent"
                              }`}
                            >
                              <img
                                src={image}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* DETAILS */}
                    <div className="mt-6">
                      {selectedProduct.collection && (
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#a28b6c]">
                          {
                            selectedProduct.collection
                          }
                        </p>
                      )}

                      <h2 className="mt-2 font-serif text-3xl">
                        {name}
                      </h2>

                      <p className="mt-2 text-xl font-medium">
                        {formatPrice(
                          selectedProduct.price
                        )}{" "}
                        сум
                      </p>

                      <p className="mt-5 whitespace-pre-line text-sm leading-7 text-[#6f675e]">
                        {description}
                      </p>
                    </div>

                    {/* ACTIONS */}
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          toggleFavorite(
                            selectedProduct.id
                          )
                        }
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm transition-transform active:scale-90"
                      >
                        {favorite
                          ? "♥"
                          : "♡"}
                      </button>

                      {quantity > 0 ? (
                        <div className="flex h-14 flex-1 items-center justify-between rounded-full bg-[#171717] px-3 text-white">
                          <button
                            type="button"
                            onClick={() =>
                              decreaseQuantity(
                                selectedProduct.id
                              )
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl"
                          >
                            −
                          </button>

                          <span className="font-medium">
                            {quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              increaseQuantity(
                                selectedProduct.id
                              )
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            selectedProduct.available ===
                            false
                          }
                          onClick={() =>
                            addToCart(
                              selectedProduct.id
                            )
                          }
                          className="h-14 flex-1 rounded-full bg-[#171717] px-5 text-sm text-white transition-transform active:scale-[0.98] disabled:bg-[#c8c1b8]"
                        >
                          {selectedProduct.available ===
                          false
                            ? language === "uz"
                              ? "Mavjud emas"
                              : "Нет в наличии"
                            : language ===
                              "uz"
                            ? "Savatga qo‘shish"
                            : "Добавить в корзину"}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { auth, db, storage } from "../firebase";
import CollectionManager from "./CollectionManager";
import CollectionPicker from "./CollectionPicker";

type Product = {
  id: string;

  nameRu?: string;
  nameUz?: string;
  descriptionRu?: string;
  descriptionUz?: string;

  // Старые поля — оставляем для совместимости
  name?: string;
  description?: string;

  price: number;
  collection?: string;
  available?: boolean;

  imageUrls?: string[];
  imageUrl?: string;
};

type OrderItem = {
  productId?: string;
  name?: string;
  price?: number;
  quantity?: number;
  imageUrl?: string;
};

type Order = {
  id: string;
  userId?: string;

  customerName?: string;
  phone?: string;
  address?: string;
  comment?: string;

  items?: OrderItem[];
  total?: number;

  status?: string;
  paymentStatus?: string;

  receiptUrl?: string;

  createdAt?: {
    seconds?: number;
  };
};

const ADMINS = [
  "emil@dumanart.local",
  "mama@dumanart.local",
];

function formatPrice(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function getProductName(product: Product) {
  return (
    product.nameRu ||
    product.nameUz ||
    product.name ||
    "Без названия"
  );
}

function getProductDescription(product: Product) {
  return (
    product.descriptionRu ||
    product.descriptionUz ||
    product.description ||
    ""
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [activeSection, setActiveSection] = useState<
    "add" | "products" | "collections" | "orders" | "settings"
  >("add");

  const [message, setMessage] = useState("");

  // =========================
  // ADD PRODUCT
  // =========================

  const [nameRu, setNameRu] = useState("");
  const [nameUz, setNameUz] = useState("");

  const [descriptionRu, setDescriptionRu] = useState("");
  const [descriptionUz, setDescriptionUz] = useState("");

  const [price, setPrice] = useState("");
  const [productCollection, setProductCollection] = useState("");

  const [available, setAvailable] = useState(true);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);

  // =========================
  // PRODUCTS
  // =========================

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [editingProduct, setEditingProduct] = useState<Product | null>(
    null
  );

  const [editNameRu, setEditNameRu] = useState("");
  const [editNameUz, setEditNameUz] = useState("");

  const [editDescriptionRu, setEditDescriptionRu] = useState("");
  const [editDescriptionUz, setEditDescriptionUz] = useState("");

  const [editPrice, setEditPrice] = useState("");
  const [editCollection, setEditCollection] = useState("Elvi");
  const [editAvailable, setEditAvailable] = useState(true);

  const [editImages, setEditImages] = useState<File[]>([]);
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);

  const [savingEdit, setSavingEdit] = useState(false);

  // =========================
  // ORDERS
  // =========================

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [openedOrderId, setOpenedOrderId] = useState<string | null>(null);

  // =========================
  // SETTINGS
  // =========================

  const [cardNumber, setCardNumber] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // =========================
  // AUTH
  // =========================

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    return !!email && ADMINS.includes(email);
  }, [user]);

  // =========================
  // LOAD PRODUCTS
  // =========================

  async function loadProducts() {
    if (!isAdmin) return;

    try {
      setProductsLoading(true);

      const snapshot = await getDocs(collection(db, "products"));

      const list: Product[] = snapshot.docs.map((item) => {
        const data = item.data();

        return {
          id: item.id,

          nameRu: data.nameRu,
          nameUz: data.nameUz,
          descriptionRu: data.descriptionRu,
          descriptionUz: data.descriptionUz,

          name: data.name,
          description: data.description,

          price: Number(data.price || 0),
          collection: data.collection || "",
          available:
            typeof data.available === "boolean"
              ? data.available
              : true,

          imageUrls: Array.isArray(data.imageUrls)
            ? data.imageUrls
            : [],
          imageUrl: data.imageUrl || "",
        };
      });

      setProducts(list);
    } catch (error) {
      console.error(error);
      setMessage("Не удалось загрузить товары");
    } finally {
      setProductsLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin && activeSection === "products") {
      loadProducts();
    }
  }, [isAdmin, activeSection]);

  // =========================
  // LOAD ORDERS
  // =========================

  async function loadOrders() {
    if (!isAdmin) return;

    try {
      setOrdersLoading(true);

      const q = query(
        collection(db, "orders"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const list: Order[] = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Order, "id">),
      }));

      setOrders(list);
    } catch (error) {
      console.error(error);

      // Если в старых заказах нет createdAt
      try {
        const snapshot = await getDocs(collection(db, "orders"));

        const list: Order[] = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Order, "id">),
          }))
          .sort((a, b) => {
            return (
              (b.createdAt?.seconds || 0) -
              (a.createdAt?.seconds || 0)
            );
          });

        setOrders(list);
      } catch (fallbackError) {
        console.error(fallbackError);
        setMessage("Не удалось загрузить заказы");
      }
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin && activeSection === "orders") {
      loadOrders();
    }
  }, [isAdmin, activeSection]);

  // =========================
  // LOAD SETTINGS
  // =========================

  async function loadSettings() {
    if (!isAdmin) return;

    try {
      setSettingsLoading(true);

      const snapshot = await getDoc(doc(db, "settings", "shop"));

      if (snapshot.exists()) {
        const data = snapshot.data();
        setCardNumber(data.cardNumber || "");
      }
    } catch (error) {
      console.error(error);
      setMessage("Не удалось загрузить настройки");
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin && activeSection === "settings") {
      loadSettings();
    }
  }, [isAdmin, activeSection]);

  // =========================
  // LOGIN
  // =========================

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    setLoginError("");

    try {
      const result = await signInWithEmailAndPassword(
        auth,
        loginEmail.trim(),
        loginPassword
      );

      const email = result.user.email?.toLowerCase();

      if (!email || !ADMINS.includes(email)) {
        await signOut(auth);
        setLoginError("Нет доступа к админ-панели");
        return;
      }

      setLoginEmail("");
      setLoginPassword("");
    } catch (error) {
      console.error(error);
      setLoginError("Неверный email или пароль");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setActiveSection("add");
  }

  // =========================
  // IMAGE UPLOAD
  // =========================

  async function uploadProductImages(
    files: File[],
    productId: string
  ) {
    const urls: string[] = [];

    for (const file of files) {
      const safeName = `${Date.now()}-${file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      )}`;

      const storageRef = ref(
        storage,
        `products/${productId}/${safeName}`
      );

      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      urls.push(url);
    }

    return urls;
  }

  // =========================
  // ADD PRODUCT
  // =========================

  function handleImageSelect(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    setNewImages(files);
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault();

    if (!isAdmin) return;

    setMessage("");

    if (!nameRu.trim()) {
      setMessage("Заполни название на русском");
      return;
    }

    if (!nameUz.trim()) {
      setMessage("Заполни название на узбекском");
      return;
    }

    if (!descriptionRu.trim()) {
      setMessage("Заполни описание на русском");
      return;
    }

    if (!descriptionUz.trim()) {
      setMessage("Заполни описание на узбекском");
      return;
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setMessage("Введите правильную цену");
      return;
    }

    if (newImages.length === 0) {
      setMessage("Добавь хотя бы одну фотографию");
      return;
    }

    try {
      setAddingProduct(true);

      // Сначала создаём документ
      const productRef = await addDoc(collection(db, "products"), {
        nameRu: nameRu.trim(),
        nameUz: nameUz.trim(),

        descriptionRu: descriptionRu.trim(),
        descriptionUz: descriptionUz.trim(),

        // Старые поля для совместимости
        name: nameRu.trim(),
        description: descriptionRu.trim(),

        price: numericPrice,
        collection: productCollection,
        available,

        imageUrls: [],
        createdAt: serverTimestamp(),
      });

      // Потом загружаем фото
      const imageUrls = await uploadProductImages(
        newImages,
        productRef.id
      );

      await updateDoc(productRef, {
        imageUrls,
        imageUrl: imageUrls[0] || "",
      });

      setNameRu("");
      setNameUz("");

      setDescriptionRu("");
      setDescriptionUz("");

      setPrice("");
      setProductCollection("");
      setAvailable(true);
      setNewImages([]);

      setMessage("✅ Товар успешно добавлен");
    } catch (error) {
      console.error(error);
      setMessage("Ошибка при добавлении товара");
    } finally {
      setAddingProduct(false);
    }
  }

  // =========================
  // EDIT PRODUCT
  // =========================

  function openEditProduct(product: Product) {
    setEditingProduct(product);

    setEditNameRu(
      product.nameRu || product.name || ""
    );

    setEditNameUz(
      product.nameUz || product.nameRu || product.name || ""
    );

    setEditDescriptionRu(
      product.descriptionRu ||
        product.description ||
        ""
    );

    setEditDescriptionUz(
      product.descriptionUz ||
        product.descriptionRu ||
        product.description ||
        ""
    );

    setEditPrice(String(product.price || ""));
    setEditCollection(product.collection || "Elvi");
    setEditAvailable(product.available !== false);

    setEditImages([]);
    setEditImageUrls(
      product.imageUrls && product.imageUrls.length > 0
        ? product.imageUrls
        : product.imageUrl
        ? [product.imageUrl]
        : []
    );
  }

  function handleEditImageSelect(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files || []);
    setEditImages(files);
  }

  function removeEditImage(index: number) {
    setEditImageUrls((current) =>
      current.filter((_, i) => i !== index)
    );
  }

  async function saveEditedProduct() {
    if (!isAdmin || !editingProduct) return;

    if (!editNameRu.trim()) {
      setMessage("Заполни название на русском");
      return;
    }

    if (!editNameUz.trim()) {
      setMessage("Заполни название на узбекском");
      return;
    }

    if (!editDescriptionRu.trim()) {
      setMessage("Заполни описание на русском");
      return;
    }

    if (!editDescriptionUz.trim()) {
      setMessage("Заполни описание на узбекском");
      return;
    }

    const numericPrice = Number(editPrice);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setMessage("Введите правильную цену");
      return;
    }

    try {
      setSavingEdit(true);
      setMessage("");

      let finalImageUrls = [...editImageUrls];

      if (editImages.length > 0) {
        const uploaded = await uploadProductImages(
          editImages,
          editingProduct.id
        );

        finalImageUrls = [
          ...finalImageUrls,
          ...uploaded,
        ];
      }

      await updateDoc(
        doc(db, "products", editingProduct.id),
        {
          nameRu: editNameRu.trim(),
          nameUz: editNameUz.trim(),

          descriptionRu: editDescriptionRu.trim(),
          descriptionUz: editDescriptionUz.trim(),

          // Совместимость
          name: editNameRu.trim(),
          description: editDescriptionRu.trim(),

          price: numericPrice,
          collection: editCollection,
          available: editAvailable,

          imageUrls: finalImageUrls,
          imageUrl: finalImageUrls[0] || "",
          updatedAt: serverTimestamp(),
        }
      );

      setEditingProduct(null);
      setEditImages([]);
      setMessage("✅ Товар обновлён");

      await loadProducts();
    } catch (error) {
      console.error(error);
      setMessage("Ошибка при сохранении товара");
    } finally {
      setSavingEdit(false);
    }
  }

  // =========================
  // DELETE PRODUCT
  // =========================

  async function deleteProduct(productId: string) {
    if (!isAdmin) return;

    const ok = window.confirm(
      "Удалить этот товар?"
    );

    if (!ok) return;

    try {
      await deleteDoc(doc(db, "products", productId));

      setProducts((current) =>
        current.filter((item) => item.id !== productId)
      );

      setMessage("✅ Товар удалён");
    } catch (error) {
      console.error(error);
      setMessage("Ошибка удаления товара");
    }
  }

  // =========================
  // AVAILABILITY
  // =========================

  async function toggleAvailability(product: Product) {
    if (!isAdmin) return;

    try {
      const nextValue = product.available === false;

      await updateDoc(
        doc(db, "products", product.id),
        {
          available: nextValue,
        }
      );

      setProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? {
                ...item,
                available: nextValue,
              }
            : item
        )
      );
    } catch (error) {
      console.error(error);
      setMessage("Не удалось изменить наличие");
    }
  }

  // =========================
  // ORDER STATUS
  // =========================

  async function changeOrderStatus(
    orderId: string,
    status: string
  ) {
    if (!isAdmin) return;

    try {
      await updateDoc(
        doc(db, "orders", orderId),
        {
          status,
        }
      );

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status,
              }
            : order
        )
      );
    } catch (error) {
      console.error(error);
      setMessage("Не удалось изменить статус");
    }
  }

  async function changePaymentStatus(
    orderId: string,
    paymentStatus: string
  ) {
    if (!isAdmin) return;

    try {
      await updateDoc(
        doc(db, "orders", orderId),
        {
          paymentStatus,
        }
      );

      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                paymentStatus,
              }
            : order
        )
      );
    } catch (error) {
      console.error(error);
      setMessage("Не удалось изменить оплату");
    }
  }

  async function deleteOrder(orderId: string) {
    if (!isAdmin) return;

    const ok = window.confirm(
      "Удалить заказ?"
    );

    if (!ok) return;

    try {
      await deleteDoc(doc(db, "orders", orderId));

      setOrders((current) =>
        current.filter((order) => order.id !== orderId)
      );

      setMessage("✅ Заказ удалён");
    } catch (error) {
      console.error(error);
      setMessage("Не удалось удалить заказ");
    }
  }

  // =========================
  // SAVE SETTINGS
  // =========================

  async function saveSettings() {
    if (!isAdmin) return;

    try {
      setSavingSettings(true);

      await updateDoc(
        doc(db, "settings", "shop"),
        {
          cardNumber: cardNumber.trim(),
          updatedAt: serverTimestamp(),
        }
      );

      setMessage("✅ Номер карты сохранён");
    } catch (error) {
      console.error(error);

      // Если документа ещё нет
      try {
        await addDoc(collection(db, "settings"), {
          cardNumber: cardNumber.trim(),
        });

        setMessage(
          "✅ Настройки сохранены, но проверь документ settings"
        );
      } catch (fallbackError) {
        console.error(fallbackError);
        setMessage("Ошибка сохранения настроек");
      }
    } finally {
      setSavingSettings(false);
    }
  }

  // =========================
  // SEARCH
  // =========================

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return products;

    return products.filter((product) => {
      const text = [
        product.nameRu,
        product.nameUz,
        product.descriptionRu,
        product.descriptionUz,
        product.name,
        product.description,
        product.collection,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [products, search]);

  // =========================
  // LOADING
  // =========================

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec]">
        <div className="rounded-3xl bg-white px-8 py-7 text-center shadow-sm">
          <div className="text-4xl animate-pulse">
            💎
          </div>

          <p className="mt-3 text-sm text-[#6f675e]">
            Загрузка админ-панели...
          </p>
        </div>
      </main>
    );
  }

  // =========================
  // LOGIN
  // =========================

  if (!user || !isAdmin) {
    return (
      <main className="min-h-screen bg-[#171717] px-5 py-10">
        <div className="mx-auto flex min-h-[90vh] max-w-md items-center justify-center">
          <div className="w-full rounded-[32px] bg-[#f6f2ec] p-6 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-sm">
                💎
              </div>

              <p className="mt-5 text-[10px] uppercase tracking-[0.3em] text-[#a28b6c]">
                DUMAN ART
              </p>

              <h1 className="mt-2 font-serif text-3xl">
                Админ-панель
              </h1>

              <p className="mt-2 text-sm text-[#777066]">
                Доступ только для сотрудников Duman Art
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              className="mt-8 space-y-4"
            >
              <input
                type="email"
                value={loginEmail}
                onChange={(e) =>
                  setLoginEmail(e.target.value)
                }
                placeholder="Email"
                className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 text-sm outline-none focus:border-[#171717]"
              />

              <div className="relative">
                <input
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) =>
                    setLoginPassword(e.target.value)
                  }
                  placeholder="Пароль"
                  className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 pr-12 text-sm outline-none focus:border-[#171717]"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                  aria-label={showLoginPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showLoginPassword ? "🙈" : "👁️"}
                </button>
              </div>

              {loginError && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-full bg-[#171717] px-5 py-4 text-sm font-medium text-white transition-transform active:scale-[0.98]"
              >
                Войти
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // =========================
  // ADMIN
  // =========================

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#171717]">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8">
        {/* HEADER */}
        <header className="mb-6 rounded-[28px] bg-[#171717] p-5 text-white shadow-lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.35em] text-[#c8ae8d]">
                DUMAN ART
              </p>

              <h1 className="mt-1 font-serif text-3xl">
                Админ-панель
              </h1>

              <p className="mt-1 text-xs text-white/60">
                {user.email}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/15 px-5 py-3 text-sm transition hover:bg-white/10"
            >
              Выйти
            </button>
          </div>
        </header>

        {/* MENU */}
        <nav className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["add", "➕ Добавить"],
            ["products", "💎 Товары"],
            ["collections", "🏷 Коллекции"],
            ["orders", "📦 Заказы"],
            ["settings", "💳 Настройки"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setActiveSection(
                  key as
                    | "add"
                    | "products"
                    | "orders"
                    | "settings"
                )
              }
              className={`rounded-2xl px-4 py-4 text-sm font-medium transition ${
                activeSection === key
                  ? "bg-[#171717] text-white shadow-sm"
                  : "bg-white text-[#5f584f]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {message && (
          <div className="mb-5 rounded-2xl bg-white px-5 py-4 text-sm shadow-sm">
            {message}
          </div>
        )}

        {/* =========================
            ADD
        ========================= */}

        {activeSection === "add" && (
          <section className="rounded-[30px] bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[#a28b6c]">
                Новый товар
              </p>

              <h2 className="mt-2 font-serif text-3xl">
                Добавить украшение
              </h2>

              <p className="mt-2 text-sm text-[#777066]">
                Русское и узбекское название и описание обязательны. Коллекцию можно выбрать или создать прямо здесь.
              </p>
            </div>

            <form
              onSubmit={addProduct}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Название 🇷🇺
                  </label>

                  <input
                    value={nameRu}
                    onChange={(e) =>
                      setNameRu(e.target.value)
                    }
                    placeholder="Например: Серьги Elvi"
                    className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Название 🇺🇿
                  </label>

                  <input
                    value={nameUz}
                    onChange={(e) =>
                      setNameUz(e.target.value)
                    }
                    placeholder="Masalan: Elvi sirg‘alari"
                    className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none focus:border-[#171717]"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Описание 🇷🇺
                  </label>

                  <textarea
                    value={descriptionRu}
                    onChange={(e) =>
                      setDescriptionRu(e.target.value)
                    }
                    rows={5}
                    placeholder="Описание украшения..."
                    className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none focus:border-[#171717]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Описание 🇺🇿
                  </label>

                  <textarea
                    value={descriptionUz}
                    onChange={(e) =>
                      setDescriptionUz(e.target.value)
                    }
                    rows={5}
                    placeholder="Taqinchoq tavsifi..."
                    className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none focus:border-[#171717]"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Цена
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={price}
                    onChange={(e) =>
                      setPrice(e.target.value)
                    }
                    placeholder="850000"
                    className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none focus:border-[#171717]"
                  />
                </div>

                <CollectionPicker
                  value={productCollection}
                  onChange={setProductCollection}
                />

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#ddd4c8] px-4 py-4">
                  <input
                    type="checkbox"
                    checked={available}
                    onChange={(e) =>
                      setAvailable(e.target.checked)
                    }
                    className="h-5 w-5"
                  />

                  <span className="text-sm">
                    Товар в наличии
                  </span>
                </label>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Фотографии
                </label>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="block w-full rounded-2xl border border-dashed border-[#cfc5b9] bg-[#faf8f5] px-4 py-5 text-sm"
                />

                {newImages.length > 0 && (
                  <p className="mt-2 text-xs text-[#777066]">
                    Выбрано фотографий:{" "}
                    {newImages.length}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={addingProduct}
                className="w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingProduct
                  ? "Добавляем товар..."
                  : "Добавить товар"}
              </button>
            </form>
          </section>
        )}

        {/* =========================
            PRODUCTS
        ========================= */}

        {activeSection === "products" && (
          <section>
            <div className="mb-5 rounded-[28px] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.28em] text-[#a28b6c]">
                    Каталог
                  </p>

                  <h2 className="mt-2 font-serif text-3xl">
                    Товары
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={loadProducts}
                  className="rounded-full bg-[#171717] px-5 py-3 text-sm text-white"
                >
                  Обновить
                </button>
              </div>

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Поиск товара..."
                className="mt-5 w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none"
              />
            </div>

            {productsLoading ? (
              <div className="rounded-[28px] bg-white p-10 text-center">
                Загружаем товары...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-[28px] bg-white p-10 text-center">
                Товаров не найдено.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const image =
                    product.imageUrls?.[0] ||
                    product.imageUrl ||
                    "";

                  return (
                    <article
                      key={product.id}
                      className="overflow-hidden rounded-[28px] bg-white shadow-sm"
                    >
                      <div className="aspect-square bg-[#eee7de]">
                        {image ? (
                          <img
                            src={image}
                            alt={getProductName(product)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-5xl">
                            💎
                          </div>
                        )}
                      </div>

                      <div className="p-5">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[#a28b6c]">
                          {product.collection || "Без коллекции"}
                        </p>

                        <h3 className="mt-2 font-serif text-xl">
                          {getProductName(product)}
                        </h3>

                        <p className="mt-1 text-sm text-[#777066]">
                          {product.nameUz || "UZ не заполнен"}
                        </p>

                        <p className="mt-4 text-lg font-medium">
                          {formatPrice(product.price)} сум
                        </p>

                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditProduct(product)
                            }
                            className="flex-1 rounded-full bg-[#171717] px-4 py-3 text-sm text-white"
                          >
                            Изменить
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleAvailability(product)
                            }
                            className="rounded-full bg-[#f1ece5] px-4 py-3 text-sm"
                          >
                            {product.available === false
                              ? "Вернуть"
                              : "Скрыть"}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            deleteProduct(product.id)
                          }
                          className="mt-2 w-full rounded-full border border-red-200 px-4 py-3 text-sm text-red-600"
                        >
                          Удалить
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================
            COLLECTIONS
        ========================= */}

        {activeSection === "collections" && (
          <CollectionManager
            onChanged={() => {
              setMessage("✅ Список коллекций обновлён");
            }}
          />
        )}

        {/* =========================
            ORDERS
        ========================= */}

        {activeSection === "orders" && (
          <section>
            <div className="mb-5 flex items-center justify-between rounded-[28px] bg-white p-5 shadow-sm">
              <div>
                <p className="text-[9px] uppercase tracking-[0.28em] text-[#a28b6c]">
                  Продажи
                </p>

                <h2 className="mt-2 font-serif text-3xl">
                  Заказы
                </h2>
              </div>

              <button
                type="button"
                onClick={loadOrders}
                className="rounded-full bg-[#171717] px-5 py-3 text-sm text-white"
              >
                Обновить
              </button>
            </div>

            {ordersLoading ? (
              <div className="rounded-[28px] bg-white p-10 text-center">
                Загружаем заказы...
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-[28px] bg-white p-10 text-center">
                Заказов пока нет.
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const opened =
                    openedOrderId === order.id;

                  return (
                    <article
                      key={order.id}
                      className="rounded-[28px] bg-white p-5 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenedOrderId(
                            opened ? null : order.id
                          )
                        }
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-[#a28b6c]">
                              Заказ
                            </p>

                            <h3 className="mt-1 font-serif text-2xl">
                              #{order.id.slice(0, 8)}
                            </h3>

                            <p className="mt-1 text-sm text-[#777066]">
                              {order.customerName ||
                                "Без имени"}
                            </p>

                            <p className="mt-2 text-lg font-medium">
                              {formatPrice(
                                Number(order.total || 0)
                              )}{" "}
                              сум
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="rounded-full bg-[#f1ece5] px-3 py-2 text-xs">
                              {order.status ||
                                "Новый"}
                            </span>

                            <p className="mt-3 text-xs text-[#777066]">
                              {opened
                                ? "Скрыть"
                                : "Подробнее"}
                            </p>
                          </div>
                        </div>
                      </button>

                      {opened && (
                        <div className="mt-5 border-t border-[#eee7de] pt-5">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl bg-[#faf8f5] p-4">
                              <p className="text-xs text-[#999084]">
                                Имя
                              </p>

                              <p className="mt-1 font-medium">
                                {order.customerName ||
                                  "—"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#faf8f5] p-4">
                              <p className="text-xs text-[#999084]">
                                Телефон
                              </p>

                              <p className="mt-1 font-medium">
                                {order.phone || "—"}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#faf8f5] p-4 md:col-span-2">
                              <p className="text-xs text-[#999084]">
                                Адрес
                              </p>

                              <p className="mt-1 font-medium">
                                {order.address || "—"}
                              </p>
                            </div>

                            {order.comment && (
                              <div className="rounded-2xl bg-[#faf8f5] p-4 md:col-span-2">
                                <p className="text-xs text-[#999084]">
                                  Комментарий
                                </p>

                                <p className="mt-1 font-medium">
                                  {order.comment}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="mt-5">
                            <h4 className="font-serif text-xl">
                              Товары
                            </h4>

                            <div className="mt-3 space-y-2">
                              {(order.items || []).map(
                                (item, index) => (
                                  <div
                                    key={`${order.id}-${index}`}
                                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#faf8f5] p-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">
                                        {item.name ||
                                          "Товар"}
                                      </p>

                                      <p className="mt-1 text-xs text-[#777066]">
                                        {item.quantity || 1} шт.
                                      </p>
                                    </div>

                                    <p className="shrink-0 text-sm font-medium">
                                      {formatPrice(
                                        Number(
                                          item.price || 0
                                        ) *
                                          Number(
                                            item.quantity || 1
                                          )
                                      )}{" "}
                                      сум
                                    </p>
                                  </div>
                                )
                              )}
                            </div>
                          </div>

                          <div className="mt-5">
                            <p className="mb-2 text-sm font-medium">
                              Статус заказа
                            </p>

                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                              {[
                                "Новый",
                                "В обработке",
                                "В доставке",
                                "Завершён",
                              ].map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() =>
                                    changeOrderStatus(
                                      order.id,
                                      status
                                    )
                                  }
                                  className={`rounded-2xl px-3 py-3 text-xs ${
                                    order.status === status
                                      ? "bg-[#171717] text-white"
                                      : "bg-[#f1ece5]"
                                  }`}
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-5">
                            <p className="mb-2 text-sm font-medium">
                              Оплата
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {[
                                "Не подтверждена",
                                "Подтверждена",
                              ].map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() =>
                                    changePaymentStatus(
                                      order.id,
                                      status
                                    )
                                  }
                                  className={`rounded-full px-4 py-3 text-xs ${
                                    order.paymentStatus ===
                                    status
                                      ? "bg-[#171717] text-white"
                                      : "bg-[#f1ece5]"
                                  }`}
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          </div>

                          {order.receiptUrl && (
                            <a
                              href={order.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-5 block rounded-2xl bg-[#171717] px-4 py-4 text-center text-sm text-white"
                            >
                              📎 Открыть чек
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              deleteOrder(order.id)
                            }
                            className="mt-3 w-full rounded-2xl border border-red-200 px-4 py-4 text-sm text-red-600"
                          >
                            Удалить заказ
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================
            SETTINGS
        ========================= */}

        {activeSection === "settings" && (
          <section className="rounded-[30px] bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[#a28b6c]">
                Магазин
              </p>

              <h2 className="mt-2 font-serif text-3xl">
                Настройки оплаты
              </h2>

              <p className="mt-2 text-sm text-[#777066]">
                Здесь можно изменить карту, на которую
                клиент переводит оплату.
              </p>
            </div>

            {settingsLoading ? (
              <div className="rounded-2xl bg-[#faf8f5] p-5">
                Загружаем настройки...
              </div>
            ) : (
              <>
                <label className="mb-2 block text-sm font-medium">
                  Номер карты
                </label>

                <input
                  value={cardNumber}
                  onChange={(e) =>
                    setCardNumber(e.target.value)
                  }
                  placeholder="Введите номер карты"
                  className="w-full rounded-2xl border border-[#ddd4c8] px-4 py-4 outline-none"
                />

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={savingSettings}
                  className="mt-4 w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:opacity-50"
                >
                  {savingSettings
                    ? "Сохраняем..."
                    : "Сохранить карту"}
                </button>
              </>
            )}
          </section>
        )}
      </div>

      {/* =========================
          EDIT MODAL
      ========================= */}

      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 md:items-center md:justify-center md:p-5"
          onClick={() => setEditingProduct(null)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[30px] bg-[#f6f2ec] p-5 md:max-w-3xl md:rounded-[30px]"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.28em] text-[#a28b6c]">
                  Редактирование
                </p>

                <h2 className="mt-1 font-serif text-2xl">
                  Изменить товар
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingProduct(null)
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Название 🇷🇺
                  </label>

                  <input
                    value={editNameRu}
                    onChange={(e) =>
                      setEditNameRu(e.target.value)
                    }
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Название 🇺🇿
                  </label>

                  <input
                    value={editNameUz}
                    onChange={(e) =>
                      setEditNameUz(e.target.value)
                    }
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Описание 🇷🇺
                  </label>

                  <textarea
                    value={editDescriptionRu}
                    onChange={(e) =>
                      setEditDescriptionRu(
                        e.target.value
                      )
                    }
                    rows={5}
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Описание 🇺🇿
                  </label>

                  <textarea
                    value={editDescriptionUz}
                    onChange={(e) =>
                      setEditDescriptionUz(
                        e.target.value
                      )
                    }
                    rows={5}
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Цена
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={editPrice}
                    onChange={(e) =>
                      setEditPrice(e.target.value)
                    }
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  />
                </div>

                <CollectionPicker
                  value={editCollection}
                  onChange={setEditCollection}
                />

                <label className="flex items-center gap-3 rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4">
                  <input
                    type="checkbox"
                    checked={editAvailable}
                    onChange={(e) =>
                      setEditAvailable(e.target.checked)
                    }
                    className="h-5 w-5"
                  />

                  <span className="text-sm">
                    В наличии
                  </span>
                </label>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium">
                  Фотографии
                </p>

                <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                  {editImageUrls.map(
                    (image, index) => (
                      <div
                        key={`${image}-${index}`}
                        className="relative aspect-square overflow-hidden rounded-2xl bg-white"
                      >
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            removeEditImage(index)
                          }
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm shadow"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleEditImageSelect}
                  className="mt-3 block w-full rounded-2xl border border-dashed border-[#cfc5b9] bg-white px-4 py-5 text-sm"
                />

                {editImages.length > 0 && (
                  <p className="mt-2 text-xs text-[#777066]">
                    Новых фото: {editImages.length}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={saveEditedProduct}
                disabled={savingEdit}
                className="w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:opacity-50"
              >
                {savingEdit
                  ? "Сохраняем..."
                  : "Сохранить изменения"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
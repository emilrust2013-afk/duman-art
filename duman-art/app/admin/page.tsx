"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import PhotoPicker, {
  PhotoItem,
  revokePhotos,
  savedPhotos,
  uploadPhotos,
} from "./PhotoPicker";
import {
  ADMIN_PAYMENT_BUTTONS,
  INITIAL_ORDER_STATUS,
  ORDER_STATUSES,
  formatUzPhone,
  isFreeDelivery,
} from "../shopConfig";

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
  telegramUserId?: number | string | null;
  telegramUsername?: string | null;

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

const COLLECTIONS = [
  "Elvi",
  "Aiden",
  "Gumly Gelin",
  "Gra",
  "Exclusive",
  "Zion",
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
  const [isAdmin, setIsAdmin] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [activeSection, setActiveSection] = useState<
    "add" | "products" | "orders" | "settings"
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
  const [productCollection, setProductCollection] = useState("Elvi");

  const [available, setAvailable] = useState(true);
  const [newPhotos, setNewPhotos] = useState<PhotoItem[]>([]);
  const [addingProduct, setAddingProduct] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

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

  const [editPhotos, setEditPhotos] = useState<PhotoItem[]>([]);

  const [savingEdit, setSavingEdit] = useState(false);

  // =========================
  // ORDERS
  // =========================

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [openedOrderId, setOpenedOrderId] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    orderId: string;
    text: string;
  } | null>(null);

  // =========================
  // SETTINGS
  // =========================

  const [cardNumber, setCardNumber] = useState("");
  const [freeDelivery, setFreeDelivery] = useState(true);
  const [deliveryText, setDeliveryText] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // =========================
  // AUTH
  // =========================

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Права админа — custom claim admin: true. Токен обновляем
      // принудительно, чтобы новые права применились без повторного входа.
      let admin = false;

      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          admin = tokenResult.claims.admin === true;
        } catch (error) {
          console.error(error);
        }
      }

      setUser(currentUser);
      setIsAdmin(admin);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка товаров при открытии раздела
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

      const list: Order[] = snapshot.docs.map((item) => {
        const data = item.data();
        const customer = data.customer || {};

        return {
          id: item.id,
          ...data,
          customerName: data.customerName || customer.name || "",
          phone: data.phone || customer.phone || "",
          address: data.address || customer.address || "",
          comment: data.comment || customer.comment || "",
          telegramUserId: data.telegramUserId ?? null,
          telegramUsername: data.telegramUsername ?? null,
        };
      });

      setOrders(list);
    } catch (error) {
      console.error(error);

      // Если в старых заказах нет createdAt
      try {
        const snapshot = await getDocs(collection(db, "orders"));

        const list: Order[] = snapshot.docs
          .map((item): Order => {
            const data = item.data();
            const customer = data.customer || {};

            return {
              id: item.id,
              ...data,
              customerName: data.customerName || customer.name || "",
              phone: data.phone || customer.phone || "",
              address: data.address || customer.address || "",
              comment: data.comment || customer.comment || "",
              telegramUserId: data.telegramUserId ?? null,
              telegramUsername: data.telegramUsername ?? null,
            };
          })
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка заказов при открытии раздела
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
        setFreeDelivery(isFreeDelivery(data));
        setDeliveryText(data.deliveryText || "");
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка настроек при открытии раздела
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

      const tokenResult = await result.user.getIdTokenResult(true);

      if (tokenResult.claims.admin !== true) {
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

  function showUploadProgress(done: number, total: number) {
    setUploadProgress(`Загружаем фото ${done} из ${total}…`);
  }

  // Последние списки фото — чтобы освободить превью при уходе со страницы.
  const photosRef = useRef<PhotoItem[]>([]);
  useEffect(() => {
    photosRef.current = [...newPhotos, ...editPhotos];
  }, [newPhotos, editPhotos]);
  useEffect(() => () => revokePhotos(photosRef.current), []);

  // =========================
  // ADD PRODUCT
  // =========================

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

    if (photosBusy) {
      setMessage("Подождите, фото ещё обрабатываются");
      return;
    }

    if (newPhotos.length === 0) {
      setMessage("Добавь хотя бы одну фотографию");
      return;
    }

    try {
      setAddingProduct(true);

      // Сначала загружаем фото (id документа берём заранее), потом создаём
      // товар — так в магазине не появится товар без фотографий.
      const productRef = doc(collection(db, "products"));

      const imageUrls = await uploadPhotos(
        newPhotos,
        productRef.id,
        showUploadProgress
      );
      setUploadProgress("Сохраняем товар…");

      await setDoc(productRef, {
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

        imageUrls,
        imageUrl: imageUrls[0] || "",
        createdAt: serverTimestamp(),
      });

      setNameRu("");
      setNameUz("");

      setDescriptionRu("");
      setDescriptionUz("");

      setPrice("");
      setProductCollection("Elvi");
      setAvailable(true);
      revokePhotos(newPhotos);
      setNewPhotos([]);

      setMessage("✅ Товар успешно добавлен");
    } catch (error) {
      console.error(error);
      setMessage(
        "Ошибка при добавлении товара. Фото остались выбранными — попробуйте ещё раз."
      );
    } finally {
      setAddingProduct(false);
      setUploadProgress("");
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

    revokePhotos(editPhotos);
    setEditPhotos(
      savedPhotos(
        product.imageUrls && product.imageUrls.length > 0
          ? product.imageUrls
          : product.imageUrl
          ? [product.imageUrl]
          : []
      )
    );
  }

  function closeEditProduct() {
    if (savingEdit) return;
    revokePhotos(editPhotos);
    setEditPhotos([]);
    setEditingProduct(null);
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

    if (photosBusy) {
      setMessage("Подождите, фото ещё обрабатываются");
      return;
    }

    if (editPhotos.length === 0) {
      setMessage("Добавь хотя бы одну фотографию");
      return;
    }

    try {
      setSavingEdit(true);
      setMessage("");

      const finalImageUrls = await uploadPhotos(
        editPhotos,
        editingProduct.id,
        showUploadProgress
      );
      setUploadProgress("Сохраняем товар…");

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
      revokePhotos(editPhotos);
      setEditPhotos([]);
      setMessage("✅ Товар обновлён");

      await loadProducts();
    } catch (error) {
      console.error(error);
      setMessage(
        "Ошибка при сохранении товара. Изменения не сохранены — попробуйте ещё раз."
      );
    } finally {
      setSavingEdit(false);
      setUploadProgress("");
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

  // Статус меняет сервер (/api/admin/order-status): он проверяет права,
  // обновляет заказ и отправляет клиенту сообщение в Telegram.
  async function updateOrderStatus(
    orderId: string,
    change: { status: string } | { paymentStatus: string }
  ) {
    if (!isAdmin || !user) return;

    // Показываем результат и вверху страницы, и прямо под кнопками заказа.
    const notify = (text: string) => {
      setMessage(text);
      setStatusNotice({ orderId, text });
    };

    try {
      setStatusSavingId(orderId);
      setStatusNotice(null);

      const idToken = await user.getIdToken();

      const response = await fetch("/api/admin/order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orderId, ...change }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        console.error("Order status update failed:", data);
        notify(
          `❌ Не удалось изменить статус${data?.error ? `: ${data.error}` : ""}`
        );
        return;
      }

      setOrders((current) =>
        current.map((item) =>
          item.id === orderId ? { ...item, ...change } : item
        )
      );

      if (data.changed === false) {
        notify("Статус уже такой — ничего не изменено");
      } else if (data.notified) {
        notify("✅ Статус изменён, клиент уведомлён");
      } else if (data.notifyError) {
        notify(
          `✅ Статус изменён. ⚠️ Клиенту сообщение не доставлено: ${data.notifyError}`
        );
      } else {
        notify("✅ Статус изменён");
      }
    } catch (error) {
      console.error(error);
      notify("❌ Не удалось изменить статус");
    } finally {
      setStatusSavingId(null);
    }
  }

  function changeOrderStatus(orderId: string, status: string) {
    return updateOrderStatus(orderId, { status });
  }

  function changePaymentStatus(orderId: string, paymentStatus: string) {
    return updateOrderStatus(orderId, { paymentStatus });
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

      // merge: создаёт settings/shop, если его нет, и не трогает другие поля.
      await setDoc(
        doc(db, "settings", "shop"),
        {
          cardNumber: cardNumber.trim(),
          freeDelivery,
          deliveryText: deliveryText.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("✅ Настройки сохранены");
    } catch (error) {
      console.error(error);
      setMessage("Ошибка сохранения настроек");
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
      <main className="min-h-screen bg-[#171717] px-4 py-6 text-[#171717]">
        <div className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-[430px] items-center justify-center">
          <div className="w-full overflow-hidden rounded-[34px] bg-[#f7f3ed] shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="relative px-6 pb-7 pt-8 sm:px-8 sm:pt-10">
              <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-[#e8dece]/70 blur-2xl" />
              <div className="absolute -left-8 bottom-0 h-20 w-20 rounded-full bg-[#ddd1c0]/50 blur-2xl" />

              <div className="relative text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[#e4dbcf] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
                  <img
                    src="/logo.png"
                    alt="Duman Art"
                    className="h-14 w-14 object-contain"
                  />
                </div>

                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.38em] text-[#9b8465]">
                  DUMAN ART
                </p>

                <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#191817]">
                  Вход для сотрудников
                </h1>

                <p className="mx-auto mt-2 max-w-[290px] text-[13px] leading-5 text-[#777066]">
                  Управление товарами, заказами и настройками магазина
                </p>
              </div>

              <form onSubmit={handleLogin} className="relative mt-7 space-y-3.5">
                <div>
                  <label className="mb-2 block px-1 text-[12px] font-medium text-[#5e574f]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Введите рабочий email"
                    autoComplete="username"
                    className="w-full rounded-[20px] border border-[#ded4c7] bg-white px-4 py-4 text-[15px] text-[#171717] outline-none transition placeholder:text-[#b8afa5] focus:border-[#8f7759] focus:ring-4 focus:ring-[#b79b77]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block px-1 text-[12px] font-medium text-[#5e574f]">
                    Пароль
                  </label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Введите пароль"
                    autoComplete="current-password"
                    className="w-full rounded-[20px] border border-[#ded4c7] bg-white px-4 py-4 text-[15px] text-[#171717] outline-none transition placeholder:text-[#b8afa5] focus:border-[#8f7759] focus:ring-4 focus:ring-[#b79b77]/10"
                  />
                </div>

                {loginError && (
                  <div className="rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="mt-1 w-full rounded-[20px] bg-[#171717] px-5 py-4 text-[15px] font-semibold text-white shadow-[0_12px_25px_rgba(23,23,23,0.18)] transition hover:bg-[#252525] active:scale-[0.99]"
                >
                  Войти в админ-панель
                </button>

                <p className="pt-1 text-center text-[11px] text-[#9a9187]">
                  Доступ только для авторизованных сотрудников Duman Art
                </p>
              </form>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =========================
  // ADMIN
  // =========================

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js?63"
        strategy="afterInteractive"
        onLoad={() => {
          try {
            window.Telegram?.WebApp?.ready?.();
            window.Telegram?.WebApp?.expand?.();
          } catch {}
        }}
      />

      <main className="min-h-screen bg-[#f6f2ec] text-[#171717] pb-24">
      <div className="mx-auto w-full max-w-3xl px-3 py-3 pb-8 md:px-8">
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

              <p className="mt-2 text-[11px] text-white/45">
                📱 Duman Art · управление с телефона
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
        <nav className="sticky top-2 z-30 mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["add", "➕ Добавить"],
            ["products", "💎 Товары"],
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
                Русское и узбекское название и описание
                обязательны.
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

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Коллекция
                  </label>

                  <select
                    value={productCollection}
                    onChange={(e) =>
                      setProductCollection(e.target.value)
                    }
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4 outline-none"
                  >
                    {COLLECTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

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

                <PhotoPicker
                  items={newPhotos}
                  onChange={setNewPhotos}
                  disabled={addingProduct}
                  onBusyChange={setPhotosBusy}
                />
              </div>

              <button
                type="submit"
                disabled={addingProduct || photosBusy}
                className="w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingProduct
                  ? uploadProgress || "Добавляем товар..."
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
                                INITIAL_ORDER_STATUS}
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
                                {order.phone
                                  ? formatUzPhone(order.phone)
                                  : "—"}
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
                              {ORDER_STATUSES.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() =>
                                    changeOrderStatus(
                                      order.id,
                                      status
                                    )
                                  }
                                  disabled={statusSavingId === order.id}
                                  className={`rounded-2xl px-3 py-3 text-xs transition disabled:cursor-wait disabled:opacity-60 ${
                                    order.status === status
                                      ? "bg-[#171717] text-white"
                                      : "bg-[#f1ece5]"
                                  }`}
                                >
                                  {statusSavingId === order.id ? "Сохраняем..." : status}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="mt-5">
                            <p className="mb-2 text-sm font-medium">
                              Оплата
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {ADMIN_PAYMENT_BUTTONS.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() =>
                                    changePaymentStatus(
                                      order.id,
                                      status
                                    )
                                  }
                                  disabled={statusSavingId === order.id}
                                  className={`rounded-full px-4 py-3 text-xs transition disabled:cursor-wait disabled:opacity-60 ${
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

                            <p className="mt-2 text-xs text-[#777066]">
                              Сейчас: {order.paymentStatus || "—"}
                            </p>
                          </div>

                          {statusNotice?.orderId === order.id && (
                            <p className="mt-4 rounded-2xl bg-[#faf8f5] px-4 py-3 text-sm">
                              {statusNotice.text}
                            </p>
                          )}

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
                Оплата и доставка
              </h2>

              <p className="mt-2 text-sm text-[#777066]">
                Карта, на которую клиент переводит оплату,
                и условия доставки.
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

                <div className="mt-6 rounded-2xl bg-[#faf8f5] p-4">
                  <label className="flex cursor-pointer items-center justify-between gap-4">
                    <span>
                      <span className="block text-sm font-medium">
                        🚚 Бесплатная доставка
                      </span>
                      <span className="mt-1 block text-xs text-[#777066]">
                        {freeDelivery
                          ? "Клиенты видят «Доставка: Бесплатно»"
                          : "Клиенты видят «Стоимость доставки уточнит менеджер»"}
                      </span>
                    </span>

                    <input
                      type="checkbox"
                      checked={freeDelivery}
                      onChange={(e) =>
                        setFreeDelivery(e.target.checked)
                      }
                      className="h-6 w-6 shrink-0 accent-[#171717]"
                    />
                  </label>

                  {freeDelivery && (
                    <>
                      <label className="mb-2 mt-4 block text-sm font-medium">
                        Текст в карточке товара
                      </label>

                      <input
                        value={deliveryText}
                        onChange={(e) =>
                          setDeliveryText(e.target.value)
                        }
                        placeholder="Бесплатная доставка по Ташкенту"
                        className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-3 outline-none"
                      />

                      <p className="mt-2 text-xs text-[#777066]">
                        Пусто — стандартный текст на русском и узбекском.
                      </p>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={savingSettings}
                  className="mt-4 w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:opacity-50"
                >
                  {savingSettings
                    ? "Сохраняем..."
                    : "Сохранить настройки"}
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
          onClick={closeEditProduct}
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
                onClick={closeEditProduct}
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

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Коллекция
                  </label>

                  <select
                    value={editCollection}
                    onChange={(e) =>
                      setEditCollection(e.target.value)
                    }
                    className="w-full rounded-2xl border border-[#ddd4c8] bg-white px-4 py-4"
                  >
                    {COLLECTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

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

                <PhotoPicker
                  items={editPhotos}
                  onChange={setEditPhotos}
                  disabled={savingEdit}
                  onBusyChange={setPhotosBusy}
                />
              </div>

              <button
                type="button"
                onClick={saveEditedProduct}
                disabled={savingEdit || photosBusy}
                className="w-full rounded-full bg-[#171717] px-5 py-4 text-sm text-white disabled:opacity-50"
              >
                {savingEdit
                  ? uploadProgress || "Сохраняем..."
                  : "Сохранить изменения"}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </>
  );
}

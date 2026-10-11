"use client";

import Image from "next/image";
import Script from "next/script";
import { useEffect, useState } from "react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
  updatePassword,
} from "firebase/auth";

import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { auth, db, storage } from "./firebase";
import HomeCatalog from "./HomeCatalog";
import {
  INITIAL_ORDER_STATUS,
  INITIAL_PAYMENT_STATUS,
  isAdminEmail,
} from "./shopConfig";

type Language = "ru" | "uz";

type Tab =
  | "home"
  | "favorites"
  | "cart"
  | "settings";

type CartProduct = {
  id: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
  price: number;
  collection: string;
  description: string;
  descriptionRu?: string;
  descriptionUz?: string;
  available: boolean;
  imageUrls?: string[];
  quantity: number;
};

type SavedAddress = {
  id: string;
  label: string;
  address: string;
};

type UserProfile = {
  name: string;
  phone: string;
  address?: string;
  addresses?: SavedAddress[];
  passwordChangedOnce?: boolean;
};

type Order = {
  id: string;
  total: number;
  totalItems?: number;
  status: string;
  paymentStatus: string;
  createdAt?: any;
  items?: {
    name: string;
    price: number;
    quantity: number;
    collection?: string;
  }[];
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
    comment?: string;
  };
  telegramUserId?: number | string | null;
  telegramUsername?: string | null;
};

const t = {
  ru: {
    home: "Главная",
    favorites: "Избранное",
    cart: "Корзина",
    settings: "Настройки",
    elegance: "Элегантность",
    inEveryDetail: "в каждой детали",
    heroText:
      "Украшения, которые становятся частью особенных моментов.",
    allJewelry: "Все украшения Duman Art",
    favorite: "Избранное",
    emptyFavorite: "Пока здесь пусто",
    favoriteText:
      "Добавляйте понравившиеся украшения в избранное.",
    openJewelry: "Открыть украшения",
    emptyCart: "Корзина пуста",
    chooseJewelry: "Выберите украшения из списка.",
    watchJewelry: "Смотреть украшения",
    products: "Товаров",
    total: "Итого",
    checkout: "Оформление заказа",
    allRequired:
      "Имя, пароль, телефон и адрес обязательны. Комментарий необязателен.",
    name: "Имя",
    password: "Пароль",
    phone: "Телефон",
    address: "Адрес доставки",
    comment: "Комментарий (необязательно)",
    payment: "Оплата",
    transfer: "Перевод на карту",
    paymentText:
      "Переведите сумму заказа на карту магазина и загрузите чек.",
    cardNumber: "Номер карты",
    cardNotSet: "Карта не настроена",
    uploadReceipt: "Загрузить чек",
    receiptText: "Только изображение, до 10 МБ",
    order: "Оформить заказ",
    sending: "Отправляем...",
    accepted: "Заказ принят",
    sentReceipt:
      "Заказ оформлен. Данные и чек отправлены магазину.",
    notificationSent:
      "Магазин получил данные заказа.",
    notificationNotSent:
      "Заказ сохранён, но уведомление магазину пока не отправилось.",
    backHome: "Вернуться на главную",
    myAccount: "Мой аккаунт",
    loginText:
      "Войдите, чтобы видеть свои данные и заказы.",
    enter: "Войти",
    myData: "Мои данные",
    save: "Сохранить",
    myOrders: "Мои заказы",
    noOrders: "Здесь пока нет заказов.",
    logout: "Выйти из аккаунта",
    language: "Язык",
    russian: "Русский",
    uzbek: "O‘zbekcha",
    theme: "Тема оформления",
    dayTheme: "Дневная",
    nightTheme: "Ночная",
    themeDayDescription: "Светлая и спокойная",
    themeNightDescription: "Тёмная и мягкая для вечера",
    saveData: "Данные сохранены",
    invalidLogin: "Неверный телефон или пароль",
    enterPhonePassword: "Введите телефон и пароль",
    passwordChangedTitle: "Смена пароля",
    passwordChangedOnce: "Пароль уже был изменён. Повторная смена недоступна.",
    currentPassword: "Текущий пароль",
    newPassword: "Новый пароль",
    confirmPassword: "Повторите новый пароль",
    changePassword: "Изменить пароль",
    changingPassword: "Меняем пароль...",
    passwordChangedSuccess: "Пароль изменён. Это была ваша единственная смена.",
    passwordMismatch: "Новые пароли не совпадают",
    wrongCurrentPassword: "Неверный текущий пароль",
    deliveryAddresses: "Адреса доставки",
    addAddress: "Добавить адрес",
    addressLabel: "Название адреса",
    addressSaved: "Адрес сохранён",
    addressDeleted: "Адрес удалён",
    noAddresses: "Пока нет сохранённых адресов",
    chooseAddress: "Выберите адрес доставки",
    selectAddressFromSettings: "Добавьте адрес в настройках, чтобы выбирать его здесь",
    usedAddress: "Выбран",
    deleteAddress: "Удалить",
    adminPanel: "Админ-панель",
    adminPanelText: "Управление товарами и заказами",
  },
  uz: {
    home: "Bosh sahifa",
    favorites: "Sevimlilar",
    cart: "Savat",
    settings: "Sozlamalar",
    elegance: "Har bir",
    inEveryDetail: "tafsilotda nafislik",
    heroText:
      "Maxsus lahzalarning bir qismiga aylanadigan zargarlik buyumlari.",
    allJewelry: "Duman Art zargarlik buyumlari",
    favorite: "Sevimlilar",
    emptyFavorite: "Hozircha bo‘sh",
    favoriteText:
      "Yoqtirgan zargarlik buyumlaringizni sevimlilarga qo‘shing.",
    openJewelry: "Zargarlik buyumlarini ochish",
    emptyCart: "Savat bo‘sh",
    chooseJewelry: "Ro‘yxatdan zargarlik buyumlarini tanlang.",
    watchJewelry: "Zargarlik buyumlarini ko‘rish",
    products: "Mahsulotlar",
    total: "Jami",
    checkout: "Buyurtmani rasmiylashtirish",
    allRequired:
      "Ism, parol, telefon va manzil majburiy. Izoh ixtiyoriy.",
    name: "Ism",
    password: "Parol",
    phone: "Telefon",
    address: "Yetkazib berish manzili",
    comment: "Izoh (ixtiyoriy)",
    payment: "To‘lov",
    transfer: "Karta orqali to‘lov",
    paymentText:
      "Buyurtma summasini do‘kon kartasiga o‘tkazing va chekni yuklang.",
    cardNumber: "Karta raqami",
    cardNotSet: "Karta sozlanmagan",
    uploadReceipt: "Chekni yuklash",
    receiptText: "Faqat rasm, 10 MB gacha",
    order: "Buyurtma berish",
    sending: "Yuborilmoqda...",
    accepted: "Buyurtma qabul qilindi",
    sentReceipt:
      "Buyurtma rasmiylashtirildi. Ma’lumotlar va chek do‘konga yuborildi.",
    notificationSent:
      "Do‘kon buyurtma ma’lumotlarini oldi.",
    notificationNotSent:
      "Buyurtma saqlandi, lekin do‘konga bildirishnoma hali yuborilmadi.",
    backHome: "Bosh sahifaga",
    myAccount: "Mening akkauntim",
    loginText:
      "Ma’lumotlar va buyurtmalarni ko‘rish uchun kiring.",
    enter: "Kirish",
    myData: "Mening ma’lumotlarim",
    save: "Saqlash",
    myOrders: "Mening buyurtmalarim",
    noOrders: "Hozircha buyurtmalar yo‘q.",
    logout: "Akkauntdan chiqish",
    language: "Til",
    russian: "Русский",
    uzbek: "O‘zbekcha",
    theme: "Ko‘rinish mavzusi",
    dayTheme: "Kunduzgi",
    nightTheme: "Tungi",
    themeDayDescription: "Yorqin va sokin",
    themeNightDescription: "Kechqurun uchun quyuq va yumshoq",
    saveData: "Ma’lumotlar saqlandi",
    invalidLogin: "Telefon yoki parol noto‘g‘ri",
    enterPhonePassword: "Telefon va parolni kiriting",
    passwordChangedTitle: "Parolni almashtirish",
    passwordChangedOnce: "Parol allaqachon bir marta o‘zgartirilgan. Qayta almashtirib bo‘lmaydi.",
    currentPassword: "Joriy parol",
    newPassword: "Yangi parol",
    confirmPassword: "Yangi parolni qaytaring",
    changePassword: "Parolni almashtirish",
    changingPassword: "Parol almashtirilmoqda...",
    passwordChangedSuccess: "Parol almashtirildi. Bu sizning yagona almashtirishingiz edi.",
    passwordMismatch: "Yangi parollar mos kelmadi",
    wrongCurrentPassword: "Joriy parol noto‘g‘ri",
    deliveryAddresses: "Yetkazib berish manzillari",
    addAddress: "Manzil qo‘shish",
    addressLabel: "Manzil nomi",
    addressSaved: "Manzil saqlandi",
    addressDeleted: "Manzil o‘chirildi",
    noAddresses: "Hozircha saqlangan manzillar yo‘q",
    chooseAddress: "Yetkazib berish manzilini tanlang",
    selectAddressFromSettings: "Bu yerda tanlash uchun sozlamalarda manzil qo‘shing",
    usedAddress: "Tanlangan",
    deleteAddress: "O‘chirish",
    adminPanel: "Admin paneli",
    adminPanelText: "Mahsulotlar va buyurtmalarni boshqarish",
  },
};

function createAuthEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@dumanart.local`;
}

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export default function Home() {
  const [language, setLanguage] =
    useState<Language>("ru");

  const [themeMode, setThemeMode] =
    useState<"light" | "dark">("light");

  const [tab, setTab] =
    useState<Tab>("home");

  const [cart, setCart] =
    useState<CartProduct[]>([]);

  const [favorites, setFavorites] =
    useState<string[]>([]);

  const [favoriteProducts, setFavoriteProducts] =
    useState<CartProduct[]>([]);

  const [name, setName] = useState("");
  const [password, setPassword] =
    useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] =
    useState("");
  const [comment, setComment] =
    useState("");

  const [receiptFile, setReceiptFile] =
    useState<File | null>(null);

  const [cardNumber, setCardNumber] =
    useState("");

  const [user, setUser] =
    useState<User | null>(null);

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [editName, setEditName] =
    useState("");
  const [editPhone, setEditPhone] =
    useState("");
  const [editAddress, setEditAddress] =
    useState("");

  const [savedAddresses, setSavedAddresses] =
    useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] =
    useState("");
  const [newAddressLabel, setNewAddressLabel] =
    useState("");
  const [newAddressText, setNewAddressText] =
    useState("");
  const [addressMessage, setAddressMessage] =
    useState("");

  const [loginPhone, setLoginPhone] =
    useState("");
  const [loginPassword, setLoginPassword] =
    useState("");
  const [loginMessage, setLoginMessage] =
    useState("");

  const [saveMessage, setSaveMessage] =
    useState("");

  const [passwordChangedOnce, setPasswordChangedOnce] =
    useState(false);
  const [currentPassword, setCurrentPassword] =
    useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [confirmNewPassword, setConfirmNewPassword] =
    useState("");
  const [passwordChangeMessage, setPasswordChangeMessage] =
    useState("");
  const [changingPassword, setChangingPassword] =
    useState(false);

  const [showCheckoutPassword, setShowCheckoutPassword] =
    useState(false);
  const [showLoginPassword, setShowLoginPassword] =
    useState(false);
  const [showCurrentPassword, setShowCurrentPassword] =
    useState(false);
  const [showNewPassword, setShowNewPassword] =
    useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] =
    useState(false);

  const [ordering, setOrdering] =
    useState(false);

  const [success, setSuccess] =
    useState(false);

  const [orderNotificationSent, setOrderNotificationSent] =
    useState(false);

  useEffect(() => {
    const savedLanguage =
      localStorage.getItem(
        "dumanart_language"
      ) as Language | null;

    if (
      savedLanguage === "ru" ||
      savedLanguage === "uz"
    ) {
      setLanguage(savedLanguage);
    }

    const savedTheme =
      localStorage.getItem("dumanart_theme");

    if (savedTheme === "dark" || savedTheme === "light") {
      setThemeMode(savedTheme);
    }

    loadCart();
    loadFavorites();
    loadShopSettings();

    const updateCart = () => {
      loadCart();
    };

    const updateFavorites = () => {
      loadFavorites();
    };

    // Поддерживаем оба названия событий, чтобы
    // экран украшений и основной экран всегда синхронизировались.
    window.addEventListener(
      "cartUpdated",
      updateCart
    );

    window.addEventListener(
      "dumanart-cart-updated",
      updateCart
    );

    window.addEventListener(
      "favoritesUpdated",
      updateFavorites
    );

    window.addEventListener(
      "dumanart-favorites-updated",
      updateFavorites
    );

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (currentUser) => {
          setUser(currentUser);

          if (currentUser) {
            await loadProfile(
              currentUser.uid
            );
          }
        }
      );

    return () => {
      window.removeEventListener(
        "cartUpdated",
        updateCart
      );

      window.removeEventListener(
        "dumanart-cart-updated",
        updateCart
      );

      window.removeEventListener(
        "favoritesUpdated",
        updateFavorites
      );

      window.removeEventListener(
        "dumanart-favorites-updated",
        updateFavorites
      );

      unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.body.style.backgroundColor =
      themeMode === "dark" ? "#11100f" : "#f4f0e9";
    document.body.style.color =
      themeMode === "dark" ? "#f4f0e9" : "#171717";

    return () => {
      document.body.style.backgroundColor = "";
      document.body.style.color = "";
    };
  }, [themeMode]);

  // История заказов с живым обновлением: статус, изменённый админом,
  // появляется у клиента сразу. Сортировка по createdAt — на клиенте,
  // поэтому составной индекс Firestore не нужен.
  const userId = user?.uid;

  useEffect(() => {
    if (!userId) {
      setOrders([]);
      return;
    }

    const unsubscribe = onSnapshot(
      query(
        collection(db, "orders"),
        where("userId", "==", userId)
      ),
      (snapshot) => {
        const data: Order[] =
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              Order,
              "id"
            >),
          }));

        data.sort((a, b) => {
          const aTime =
            a.createdAt?.seconds || 0;
          const bTime =
            b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setOrders(data);
      },
      (error) => {
        console.error(
          "Orders subscription failed:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const text = t[language];

  function changeTheme(
    nextTheme: "light" | "dark"
  ) {
    setThemeMode(nextTheme);
    localStorage.setItem("dumanart_theme", nextTheme);
  }

  function changeLanguage(
    nextLanguage: Language
  ) {
    setLanguage(nextLanguage);

    localStorage.setItem(
      "dumanart_language",
      nextLanguage
    );
  }

  async function loadShopSettings() {
    try {
      const snapshot = await getDoc(
        doc(db, "settings", "shop")
      );

      if (snapshot.exists()) {
        setCardNumber(
          snapshot.data().cardNumber || ""
        );
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function loadCart() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          "dumanart_cart"
        ) || "[]"
      );

      if (!Array.isArray(saved)) {
        setCart([]);
        return;
      }

      const normalized = await Promise.all(
        saved.map(async (item: any) => {
          const quantity =
            Number(item?.quantity) > 0
              ? Number(item.quantity)
              : 1;

          // Новый полный формат корзины.
          if (
            item?.id &&
            item?.name &&
            typeof item?.price !== "undefined"
          ) {
            return {
              ...item,
              id: String(item.id),
              quantity,
            } as CartProduct;
          }

          // Формат из Products.tsx:
          // { productId, quantity }
          const productId = String(
            item?.productId || item?.id || ""
          );

          if (!productId) {
            return null;
          }

          try {
            const snapshot = await getDoc(
              doc(db, "products", productId)
            );

            if (!snapshot.exists()) {
              return null;
            }

            const data = snapshot.data();

            return {
              id: productId,
              name:
                data.nameRu ||
                data.nameUz ||
                data.name ||
                "Товар",
              nameRu: data.nameRu || "",
              nameUz: data.nameUz || "",
              price: Number(data.price || 0),
              collection:
                data.collection || "",
              description:
                data.descriptionRu ||
                data.descriptionUz ||
                data.description ||
                "",
              descriptionRu:
                data.descriptionRu || "",
              descriptionUz:
                data.descriptionUz || "",
              available:
                typeof data.available ===
                "boolean"
                  ? data.available
                  : true,
              imageUrls:
                Array.isArray(data.imageUrls)
                  ? data.imageUrls
                  : data.imageUrl
                  ? [data.imageUrl]
                  : [],
              quantity,
            } as CartProduct;
          } catch (error) {
            console.error(
              "Ошибка загрузки товара корзины:",
              error
            );
            return null;
          }
        })
      );

      const cleaned = normalized.filter(
        (
          item
        ): item is CartProduct =>
          item !== null
      );

      setCart(cleaned);

      // Приводим localStorage к полному формату,
      // чтобы следующий экран открывался мгновенно.
      localStorage.setItem(
        "dumanart_cart",
        JSON.stringify(cleaned)
      );
    } catch (error) {
      console.error(
        "Ошибка загрузки корзины:",
        error
      );

      setCart([]);
    }
  }

  function loadFavorites() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          "dumanart_favorites"
        ) || "[]"
      );

      const cleaned = Array.isArray(saved)
        ? saved
            .map((id) => String(id))
            .filter(Boolean)
        : [];

      setFavorites(cleaned);
    } catch (error) {
      console.error(
        "Ошибка загрузки избранного:",
        error
      );

      setFavorites([]);
    }
  }

  async function loadFavoriteProducts(
    ids: string[]
  ) {
    if (!ids.length) {
      setFavoriteProducts([]);
      return;
    }

    try {
      const loaded =
        await Promise.all(
          ids.map(async (id) => {
            try {
              const snapshot =
                await getDoc(
                  doc(db, "products", id)
                );

              if (!snapshot.exists()) {
                return null;
              }

              const data =
                snapshot.data();

              return {
                id,
                name:
                  data.nameRu ||
                  data.nameUz ||
                  data.name ||
                  "Товар",
                nameRu:
                  data.nameRu || "",
                nameUz:
                  data.nameUz || "",
                price: Number(
                  data.price || 0
                ),
                collection:
                  data.collection || "",
                description:
                  data.descriptionRu ||
                  data.descriptionUz ||
                  data.description ||
                  "",
                descriptionRu:
                  data.descriptionRu ||
                  "",
                descriptionUz:
                  data.descriptionUz ||
                  "",
                available:
                  typeof data.available ===
                  "boolean"
                    ? data.available
                    : true,
                imageUrls:
                  Array.isArray(
                    data.imageUrls
                  )
                    ? data.imageUrls
                    : data.imageUrl
                    ? [data.imageUrl]
                    : [],
                quantity: 1,
              } as CartProduct;
            } catch (error) {
              console.error(
                "Ошибка загрузки избранного:",
                error
              );
              return null;
            }
          })
        );

      setFavoriteProducts(
        loaded.filter(
          (
            item
          ): item is CartProduct =>
            item !== null
        )
      );
    } catch (error) {
      console.error(
        "Ошибка загрузки избранного:",
        error
      );

      setFavoriteProducts([]);
    }
  }

  useEffect(() => {
    loadFavoriteProducts(favorites);
  }, [favorites]);

  async function loadProfile(
    uid: string
  ) {
    try {
      const snapshot = await getDoc(
        doc(db, "users", uid)
      );

      if (!snapshot.exists()) return;

      const data =
        snapshot.data() as UserProfile;

      setName(data.name || "");
      setPhone(data.phone || "");
      setPasswordChangedOnce(data.passwordChangedOnce === true);

      setEditName(data.name || "");
      setEditPhone(data.phone || "");
      setEditAddress(data.address || "");

      const loadedAddresses = Array.isArray(data.addresses)
        ? data.addresses
            .filter((item: any) => item && item.address)
            .map((item: any, index: number) => ({
              id: String(item.id || `address-${index}`),
              label: String(
                item.label ||
                (language === "ru"
                  ? `Адрес ${index + 1}`
                  : `Manzil ${index + 1}`)
              ),
              address: String(item.address || "").trim(),
            }))
            .filter((item: SavedAddress) => item.address)
        : [];

      const finalAddresses =
        loadedAddresses.length > 0
          ? loadedAddresses
          : data.address
          ? [{
              id: "legacy-main",
              label: language === "ru" ? "Основной" : "Asosiy",
              address: String(data.address).trim(),
            }]
          : [];

      setSavedAddresses(finalAddresses);

      if (finalAddresses.length > 0) {
        const first = finalAddresses[0];
        setSelectedAddressId(first.id);
        setAddress(first.address);
      } else {
        setSelectedAddressId("");
        setAddress("");
      }
    } catch (error) {
      console.error(error);
    }
  }

  function saveCart(
    updated: CartProduct[]
  ) {
    setCart(updated);

    localStorage.setItem(
      "dumanart_cart",
      JSON.stringify(updated)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );

    window.dispatchEvent(
      new Event("dumanart-cart-updated")
    );
  }

  function increaseQuantity(
    id: string
  ) {
    saveCart(
      cart.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity:
                item.quantity + 1,
            }
          : item
      )
    );
  }

  function decreaseQuantity(
    id: string
  ) {
    const item = cart.find(
      (x) => x.id === id
    );

    if (!item) return;

    if (item.quantity <= 1) {
      saveCart(
        cart.filter(
          (x) => x.id !== id
        )
      );
      return;
    }

    saveCart(
      cart.map((x) =>
        x.id === id
          ? {
              ...x,
              quantity:
                x.quantity - 1,
            }
          : x
      )
    );
  }

  function removeFavorite(
    productId: string
  ) {
    const updated = favorites.filter(
      (id) => id !== productId
    );

    setFavorites(updated);

    localStorage.setItem(
      "dumanart_favorites",
      JSON.stringify(updated)
    );

    window.dispatchEvent(
      new Event("favoritesUpdated")
    );

    window.dispatchEvent(
      new Event("dumanart-favorites-updated")
    );
  }

  function addFavoriteToCart(
    product: CartProduct
  ) {
    const existing = cart.find(
      (item) => item.id === product.id
    );

    if (existing) {
      saveCart(
        cart.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity:
                  item.quantity + 1,
              }
            : item
        )
      );
      return;
    }

    saveCart([
      ...cart,
      {
        ...product,
        quantity: 1,
      },
    ]);
  }

  function getDisplayName(
    product: CartProduct
  ) {
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

  const totalItems = cart.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

  const total = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price) *
        item.quantity,
    0
  );

  const isStoreAdmin = isAdminEmail(user?.email);

  function changeTab(
    newTab: Tab
  ) {
    setTab(newTab);
    setSuccess(false);
  }

  async function loginClient() {
    if (
      !loginPhone ||
      !loginPassword
    ) {
      setLoginMessage(
        text.enterPhonePassword
      );
      return;
    }

    try {
      setLoginMessage("");

      await signInWithEmailAndPassword(
        auth,
        createAuthEmail(loginPhone),
        loginPassword
      );

      setLoginPhone("");
      setLoginPassword("");
    } catch (error) {
      console.error(error);

      setLoginMessage(
        text.invalidLogin
      );
    }
  }

  async function logoutClient() {
    await signOut(auth);

    setUser(null);
    setOrders([]);
    setSavedAddresses([]);
    setSelectedAddressId("");
    setAddress("");
    setAddressMessage("");
    setPasswordChangedOnce(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordChangeMessage("");
  }

  async function changePasswordOnce() {
    if (!user || passwordChangedOnce) return;

    if (!user.email) {
      setPasswordChangeMessage(
        language === "ru"
          ? "Не удалось определить аккаунт"
          : "Akkauntni aniqlab bo‘lmadi"
      );
      return;
    }

    if (currentPassword.length < 6 || newPassword.length < 6) {
      setPasswordChangeMessage(
        language === "ru"
          ? "Пароли должны содержать минимум 6 символов"
          : "Parollar kamida 6 ta belgidan iborat bo‘lishi kerak"
      );
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeMessage(text.passwordMismatch);
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordChangeMessage("");

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      await updateDoc(doc(db, "users", user.uid), {
        passwordChangedOnce: true,
        passwordChangedAt: serverTimestamp(),
      });

      setPasswordChangedOnce(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeMessage(text.passwordChangedSuccess);
    } catch (error: any) {
      console.error(error);

      const code = error?.code || "";
      setPasswordChangeMessage(
        code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? text.wrongCurrentPassword
          : language === "ru"
          ? "Не удалось изменить пароль"
          : "Parolni almashtirib bo‘lmadi"
      );
    } finally {
      setChangingPassword(false);
    }
  }

  async function saveProfile() {
    if (!user) return;

    if (!editName.trim() || !editPhone.trim()) {
      setSaveMessage(
        language === "ru"
          ? "Заполни имя и телефон"
          : "Ism va telefonni to‘ldiring"
      );
      return;
    }

    try {
      const selectedSavedAddress =
        savedAddresses.find(
          (item) => item.id === selectedAddressId
        )?.address ||
        savedAddresses[0]?.address ||
        editAddress.trim();

      const profileData: Record<string, any> = {
        name: editName.trim(),
        phone: editPhone.trim(),
        updatedAt: serverTimestamp(),
      };

      if (selectedSavedAddress) {
        profileData.address = selectedSavedAddress;
      }

      if (savedAddresses.length > 0) {
        profileData.addresses = savedAddresses;
      }

      await setDoc(
        doc(db, "users", user.uid),
        profileData,
        { merge: true }
      );

      setName(editName.trim());
      setPhone(editPhone.trim());
      setAddress(selectedSavedAddress);

      setSaveMessage(text.saveData);
    } catch (error) {
      console.error(error);

      setSaveMessage(
        language === "ru"
          ? "Ошибка сохранения"
          : "Saqlashda xatolik"
      );
    }
  }

  async function addSavedAddress() {
    if (!user) {
      setAddressMessage(
        language === "ru"
          ? "Сначала войдите в аккаунт"
          : "Avval akkauntga kiring"
      );
      return;
    }

    const addressValue = newAddressText.trim();
    const labelValue =
      newAddressLabel.trim() ||
      (language === "ru" ? "Мой адрес" : "Mening manzilim");

    if (!addressValue) {
      setAddressMessage(text.address);
      return;
    }

    const newItem: SavedAddress = {
      id: `address-${Date.now()}`,
      label: labelValue,
      address: addressValue,
    };

    const updated = [...savedAddresses, newItem];

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          addresses: updated,
          address: addressValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSavedAddresses(updated);
      setSelectedAddressId(newItem.id);
      setAddress(addressValue);
      setNewAddressLabel("");
      setNewAddressText("");
      setAddressMessage(text.addressSaved);
    } catch (error) {
      console.error(error);
      setAddressMessage(
        language === "ru"
          ? "Не удалось сохранить адрес"
          : "Manzilni saqlab bo‘lmadi"
      );
    }
  }

  async function removeSavedAddress(id: string) {
    if (!user) return;

    const updated = savedAddresses.filter(
      (item) => item.id !== id
    );

    const nextSelectedId =
      selectedAddressId === id
        ? updated[0]?.id || ""
        : selectedAddressId;

    const nextAddress =
      updated.find(
        (item) => item.id === nextSelectedId
      )?.address || "";

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          addresses: updated,
          address: nextAddress,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSavedAddresses(updated);
      setSelectedAddressId(nextSelectedId);
      setAddress(nextAddress);
      setAddressMessage(text.addressDeleted);
    } catch (error) {
      console.error(error);
      setAddressMessage(
        language === "ru"
          ? "Не удалось удалить адрес"
          : "Manzilni o‘chirib bo‘lmadi"
      );
    }
  }

  function selectSavedAddress(id: string) {
    setSelectedAddressId(id);

    const item = savedAddresses.find(
      (addressItem) => addressItem.id === id
    );

    if (item) {
      setAddress(item.address);
    }
  }

  function getTelegramContext() {
    if (typeof window === "undefined") {
      return { initData: "", user: null as any };
    }

    const telegram = (window as any).Telegram?.WebApp;

    return {
      initData: String(telegram?.initData || ""),
      user: telegram?.initDataUnsafe?.user || null,
    };
  }

  async function createOrder() {
    if (!name.trim()) {
      alert(text.name);
      return;
    }

    if (password.length < 6) {
      alert(
        language === "ru"
          ? "Пароль должен содержать минимум 6 символов"
          : "Parol kamida 6 ta belgidan iborat bo‘lishi kerak"
      );
      return;
    }

    if (!phone.trim()) {
      alert(text.phone);
      return;
    }

    if (!address.trim()) {
      alert(text.address);
      return;
    }

    if (!receiptFile) {
      alert(text.uploadReceipt);
      return;
    }

    if (
      receiptFile.size >
      10 * 1024 * 1024
    ) {
      alert(
        language === "ru"
          ? "Размер чека не должен превышать 10 МБ"
          : "Chek hajmi 10 MB dan oshmasligi kerak"
      );
      return;
    }

    if (!cardNumber) {
      alert(
        language === "ru"
          ? "Номер карты пока не настроен магазином"
          : "Do‘kon kartasi hali sozlanmagan"
      );
      return;
    }

    if (cart.length === 0) {
      alert(text.emptyCart);
      return;
    }

    try {
      setOrdering(true);

      const email =
        createAuthEmail(phone);

      let currentUser =
        auth.currentUser;

      if (!currentUser) {
        try {
          const credential =
            await createUserWithEmailAndPassword(
              auth,
              email,
              password
            );

          currentUser =
            credential.user;
        } catch (error: any) {
          if (
            error?.code ===
            "auth/email-already-in-use"
          ) {
            const credential =
              await signInWithEmailAndPassword(
                auth,
                email,
                password
              );

            currentUser =
              credential.user;
          } else {
            throw error;
          }
        }
      }

      const telegramContext =
        getTelegramContext();

      const userRef = doc(
        db,
        "users",
        currentUser.uid
      );

      const userDoc =
        await getDoc(userRef);

      if (userDoc.exists()) {
        await updateDoc(
          userRef,
          {
            name: name.trim(),
            phone: phone.trim(),
            address:
              address.trim(),
          }
        );
      } else {
        const { setDoc } =
          await import(
            "firebase/firestore"
          );

        await setDoc(
          userRef,
          {
            name: name.trim(),
            phone: phone.trim(),
            address:
              address.trim(),
            createdAt:
              serverTimestamp(),
          }
        );
      }

      const orderRef =
        await addDoc(
          collection(db, "orders"),
          {
            userId:
              currentUser.uid,

            customer: {
              name: name.trim(),
              phone: phone.trim(),
              address:
                address.trim(),
              comment:
                comment.trim(),
            },

            items: cart.map(
              (item) => ({
                id: item.id,
                name: getDisplayName(item),
                price: item.price,
                collection:
                  item.collection,
                quantity:
                  item.quantity,
              })
            ),

            total,
            totalItems,

            telegramUserId:
              telegramContext.user?.id || null,
            telegramUsername:
              telegramContext.user?.username || null,

            status: INITIAL_ORDER_STATUS,
            paymentStatus:
              INITIAL_PAYMENT_STATUS,

            receiptUrl: "",

            createdAt:
              serverTimestamp(),
          }
        );

      const receiptRef = ref(
        storage,
        `receipts/${currentUser.uid}/${orderRef.id}/${Date.now()}-${receiptFile.name}`
      );

      await uploadBytes(
        receiptRef,
        receiptFile
      );

      const receiptUrl =
        await getDownloadURL(
          receiptRef
        );

      await updateDoc(
        doc(
          db,
          "orders",
          orderRef.id
        ),
        {
          receiptUrl,
          receiptFileName:
            receiptFile.name,
        }
      );

      let notificationSent = false;

      try {
        const notificationResponse =
          await fetch("/api/telegram/order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // По токену сервер проверит владельца заказа и запишет
              // проверенный Telegram ID клиента (из подписанного initData).
              Authorization: `Bearer ${await currentUser.getIdToken()}`,
            },
            body: JSON.stringify({
              initData:
                telegramContext.initData,
              orderId: orderRef.id,
              customer: {
                name: name.trim(),
                phone: phone.trim(),
                address: address.trim(),
                comment: comment.trim(),
              },
              items: cart.map((item) => ({
                name: getDisplayName(item),
                price: Number(item.price || 0),
                quantity: Number(item.quantity || 1),
                collection: item.collection || "",
              })),
              total,
              receiptUrl,
            }),
          });

        notificationSent =
          notificationResponse.ok;

        if (!notificationResponse.ok) {
          console.error(
            "Telegram notification failed:",
            await notificationResponse.text()
          );
        }
      } catch (notificationError) {
        console.error(
          "Telegram notification error:",
          notificationError
        );
      }

      setOrderNotificationSent(
        notificationSent
      );

      localStorage.removeItem(
        "dumanart_cart"
      );

      setCart([]);
      setPassword("");
      setComment("");
      setReceiptFile(null);

      // Историю заказов обновляет подписка onSnapshot.
      setSuccess(true);
    } catch (error) {
      console.error(error);

      alert(
        language === "ru"
          ? "Не удалось оформить заказ"
          : "Buyurtmani rasmiylashtirib bo‘lmadi"
      );
    } finally {
      setOrdering(false);
    }
  }

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js?63"
        strategy="afterInteractive"
        onLoad={() => {
          try {
            (window as any).Telegram?.WebApp?.ready?.();
            (window as any).Telegram?.WebApp?.expand?.();
          } catch {}
        }}
      />

      <style jsx global>{`
        .dumanart-theme-dark {
          color-scheme: dark;
          background: #11100f;
          color: #f4f0e9;
          transition: background-color 220ms ease, color 220ms ease;
        }

        .dumanart-theme-light {
          color-scheme: light;
          background: #f4f0e9;
          color: #171717;
          transition: background-color 220ms ease, color 220ms ease;
        }

        .dumanart-theme-dark .bg-white {
          background-color: #211f1d !important;
        }

        .dumanart-theme-dark .bg-\[\#f4f0e9\] {
          background-color: #26231f !important;
        }

        .dumanart-theme-dark .bg-\[\#e7dfd3\] {
          background-color: #312c26 !important;
        }

        .dumanart-theme-dark .bg-\[\#f8f5f0\] {
          background-color: #181614 !important;
        }

        .dumanart-theme-dark .text-\[\#171717\] {
          color: #f4f0e9 !important;
        }

        .dumanart-theme-dark .text-\[\#777066\],
        .dumanart-theme-dark .text-\[\#81796f\],
        .dumanart-theme-dark .text-\[\#6f675e\],
        .dumanart-theme-dark .text-\[\#918a81\],
        .dumanart-theme-dark .text-\[\#8b8175\] {
          color: #b7b0a7 !important;
        }

        .dumanart-theme-dark .text-\[\#a28b6c\],
        .dumanart-theme-dark .text-\[\#8d775b\],
        .dumanart-theme-dark .text-\[\#806c53\] {
          color: #c7a97f !important;
        }

        .dumanart-theme-dark .border-\[\#ddd5ca\],
        .dumanart-theme-dark .border-\[\#eee8df\],
        .dumanart-theme-dark .border-\[\#e7e0d7\] {
          border-color: #3b3732 !important;
        }

        .dumanart-theme-dark input,
        .dumanart-theme-dark textarea,
        .dumanart-theme-dark select {
          color: #f4f0e9 !important;
          caret-color: #f4f0e9;
        }

        .dumanart-theme-dark input::placeholder,
        .dumanart-theme-dark textarea::placeholder {
          color: #8f887f !important;
        }

        .dumanart-theme-dark .shadow-sm {
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.16) !important;
        }

        .dumanart-theme-dark .dumanart-setting-card {
          background: #211f1d !important;
          border-color: #35312d !important;
        }

        .dumanart-theme-dark .dumanart-setting-row + .dumanart-setting-row {
          border-color: #35312d !important;
        }

        .dumanart-theme-dark .dumanart-theme-option {
          background: #181614 !important;
          border-color: #35312d !important;
        }

        .dumanart-theme-dark .dumanart-theme-option-active {
          background: #302b25 !important;
          border-color: #c7a97f !important;
        }

        .dumanart-theme-dark .dumanart-subtle {
          color: #a9a198 !important;
        }

        .dumanart-settings-shell {
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid #e7e0d7;
          backdrop-filter: blur(12px);
        }

        .dumanart-settings-group + .dumanart-settings-group,
        .dumanart-settings-group + .dumanart-settings-row,
        .dumanart-settings-row + .dumanart-settings-group,
        .dumanart-settings-row + .dumanart-settings-row {
          border-top: 1px solid #e7e0d7;
        }

        .dumanart-settings-summary {
          transition: background-color 180ms ease;
        }

        .dumanart-settings-summary:hover {
          background: rgba(244, 240, 233, 0.55);
        }

        .dumanart-settings-summary::-webkit-details-marker {
          display: none;
        }

        .dumanart-settings-content {
          animation: dumanart-settings-open 180ms ease-out;
        }

        .dumanart-settings-icon {
          display: flex;
          height: 40px;
          width: 40px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: #f4f0e9;
          font-size: 17px;
        }

        .dumanart-settings-row {
          background: transparent;
        }

        .dumanart-settings-select {
          background: #f4f0e9;
        }

        .dumanart-settings-profile-chip {
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid #e7e0d7;
        }

        .dumanart-settings-login,
        .dumanart-empty-settings,
        .dumanart-order-row {
          background: rgba(255, 255, 255, 0.9);
        }

        .dumanart-admin-mini {
          background: #171717;
          color: white;
        }

        .dumanart-chevron {
          display: inline-flex;
          height: 28px;
          width: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: #f4f0e9;
          color: #81796f;
          font-size: 14px;
          transition: transform 180ms ease;
        }

        details[open] > summary .dumanart-chevron {
          transform: rotate(180deg);
        }

        @keyframes dumanart-settings-open {
          from {
            opacity: 0;
            transform: translateY(-3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dumanart-theme-dark .dumanart-settings-shell {
          background: rgba(33, 31, 29, 0.96) !important;
          border-color: #35312d !important;
        }

        .dumanart-theme-dark .dumanart-settings-summary:hover {
          background: rgba(48, 43, 37, 0.6);
        }

        .dumanart-theme-dark .dumanart-settings-icon,
        .dumanart-theme-dark .dumanart-settings-select,
        .dumanart-theme-dark .dumanart-chevron {
          background: #26231f !important;
        }

        .dumanart-theme-dark .dumanart-settings-profile-chip {
          background: rgba(38, 35, 31, 0.9) !important;
          border-color: #35312d !important;
        }

        .dumanart-theme-dark .dumanart-settings-login,
        .dumanart-theme-dark .dumanart-empty-settings,
        .dumanart-theme-dark .dumanart-order-row {
          background: #211f1d !important;
        }

        .dumanart-theme-dark .dumanart-settings-group + .dumanart-settings-group,
        .dumanart-theme-dark .dumanart-settings-group + .dumanart-settings-row,
        .dumanart-theme-dark .dumanart-settings-row + .dumanart-settings-group,
        .dumanart-theme-dark .dumanart-settings-row + .dumanart-settings-row {
          border-color: #35312d !important;
        }

        .dumanart-nav-button {
          color: #918a81;
        }

        .dumanart-nav-button.active {
          color: #171717;
        }

        .dumanart-theme-dark .dumanart-nav-button {
          color: #aaa39a !important;
        }

        .dumanart-theme-dark .dumanart-nav-button.active {
          color: #f4f0e9 !important;
        }
      `}</style>

      <main
        className={`min-h-screen ${
          themeMode === "dark"
            ? "dumanart-theme-dark bg-[#11100f] text-[#f4f0e9]"
            : "dumanart-theme-light bg-[#f4f0e9] text-[#171717]"
        }`}
      >

      {/* HEADER */}
      <header className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">

          <Image
            src="/logo.png"
            alt="DUMAN ART"
            width={48}
            height={48}
            className="object-contain"
          />

          <div>
            <div className="font-serif text-[19px] tracking-[0.25em]">
              DUMAN ART
            </div>

            <div className="mt-1 text-[8px] tracking-[0.35em] text-[#8d775b]">
              JEWELRY • TASHKENT
            </div>
          </div>

        </div>

        <button
          onClick={() =>
            changeTab("settings")
          }
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm active:scale-90"
        >
          ⚙
        </button>
      </header>

      {/* CONTENT */}
      <div>

        {/* HOME = CATALOG */}
        {tab === "home" && (
          <section className="px-5 pb-28 pt-6">

            <p className="text-[9px] uppercase tracking-[0.3em] text-[#a28b6c]">
              Duman Art
            </p>

            <h1 className="mt-2 font-serif text-3xl">
              {text.home}
            </h1>

            <div className="mt-6">
              <HomeCatalog language={language} />
            </div>

          </section>
        )}

        {/* FAVORITES */}
        {tab === "favorites" && (
          <section className="px-5 pb-28 pt-8">

            <p className="text-[9px] uppercase tracking-[0.3em] text-[#a28b6c]">
              Duman Art
            </p>

            <h1 className="mt-2 font-serif text-3xl">
              {text.favorite}
            </h1>

            {favoriteProducts.length === 0 ? (
              <div className="mt-8 rounded-[24px] bg-white p-8 text-center shadow-sm">

                <div className="text-4xl">
                  ♡
                </div>

                <h2 className="mt-4 font-serif text-xl">
                  {text.emptyFavorite}
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#81796f]">
                  {text.favoriteText}
                </p>

                <button
                  onClick={() =>
                    changeTab("home")
                  }
                  className="mt-6 rounded-full bg-[#171717] px-6 py-3 text-sm text-white"
                >
                  {text.openJewelry}
                </button>

              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {favoriteProducts.map(
                  (item) => {
                    const displayName =
                      getDisplayName(item);

                    return (
                      <div
                        key={item.id}
                        className="rounded-[22px] bg-white p-4 shadow-sm"
                      >
                        <div className="flex gap-3">

                          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[18px] bg-[#e7dfd3]">
                            {item.imageUrls?.[0] ? (
                              <img
                                src={
                                  item.imageUrls[0]
                                }
                                alt={displayName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-3xl">
                                💎
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#a28b6c]">
                              {item.collection}
                            </p>

                            <h3 className="mt-1 font-serif text-xl">
                              {displayName}
                            </h3>

                            <p className="mt-1 font-semibold">
                              {Number(
                                item.price
                              ).toLocaleString(
                                "ru-RU"
                              )}{" "}
                              сум
                            </p>

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  addFavoriteToCart(
                                    item
                                  )
                                }
                                disabled={
                                  item.available ===
                                  false
                                }
                                className="rounded-full bg-[#171717] px-4 py-2 text-xs text-white disabled:bg-[#c8c1b8]"
                              >
                                {item.available ===
                                false
                                  ? language ===
                                    "uz"
                                    ? "Mavjud emas"
                                    : "Нет в наличии"
                                  : language ===
                                    "uz"
                                  ? "Savatga"
                                  : "В корзину"}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  removeFavorite(
                                    item.id
                                  )
                                }
                                className="rounded-full bg-[#f4f0e9] px-4 py-2 text-xs text-[#6f675e]"
                              >
                                {language ===
                                "uz"
                                  ? "O‘chirish"
                                  : "Убрать"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}

          </section>
        )}

        {/* CART */}
        {tab === "cart" && (
          <section className="px-5 pb-28 pt-8">

            <p className="text-[9px] uppercase tracking-[0.3em] text-[#a28b6c]">
              Duman Art
            </p>

            <h1 className="mt-2 font-serif text-3xl">
              {text.cart}
            </h1>

            {success ? (
              <div className="mt-8 rounded-[24px] bg-white p-8 text-center shadow-sm">

                <div className="text-5xl">
                  ✓
                </div>

                <h2 className="mt-4 font-serif text-2xl">
                  {text.accepted}
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#777066]">
                  {text.sentReceipt}
                </p>

                <div
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                    orderNotificationSent
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {orderNotificationSent
                    ? text.notificationSent
                    : text.notificationNotSent}
                </div>

                <button
                  onClick={() => {
                    setSuccess(false);
                    changeTab("home");
                  }}
                  className="mt-6 rounded-full bg-[#171717] px-6 py-3 text-sm text-white"
                >
                  {text.backHome}
                </button>

              </div>
            ) : cart.length === 0 ? (
              <div className="mt-8 rounded-[24px] bg-white p-8 text-center shadow-sm">

                <div className="text-4xl">
                  🛍
                </div>

                <h2 className="mt-4 font-serif text-xl">
                  {text.emptyCart}
                </h2>

                <p className="mt-2 text-sm text-[#777066]">
                  {text.chooseJewelry}
                </p>

                <button
                  onClick={() =>
                    changeTab("home")
                  }
                  className="mt-6 rounded-full bg-[#171717] px-6 py-3 text-sm text-white"
                >
                  {text.watchJewelry}
                </button>

              </div>
            ) : (
              <>
                <div className="mt-6 space-y-3">

                  {cart.map(
                    (item) => (
                      <div
                        key={item.id}
                        className="rounded-[22px] bg-white p-4 shadow-sm"
                      >

                        <div className="flex gap-3">

                          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#e7dfd3]">

                            {item.imageUrls?.[0] ? (
                              <img
                                src={
                                  item.imageUrls[0]
                                }
                                alt={
                                  getDisplayName(item)
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-3xl">
                                💎
                              </span>
                            )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <p className="text-[10px] text-[#a28b6c]">
                              {
                                item.collection
                              }
                            </p>

                            <h3 className="mt-1 font-serif text-lg">
                              {getDisplayName(item)}
                            </h3>

                            <p className="mt-1 font-semibold">
                              {Number(
                                item.price
                              ).toLocaleString(
                                "ru-RU"
                              )}{" "}
                              сум
                            </p>

                          </div>

                        </div>

                        <div className="mt-4 flex items-center justify-between rounded-full bg-[#f4f0e9] p-1">

                          <button
                            onClick={() =>
                              decreaseQuantity(
                                item.id
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl shadow-sm active:scale-90"
                          >
                            −
                          </button>

                          <span>
                            {item.quantity}
                          </span>

                          <button
                            onClick={() =>
                              increaseQuantity(
                                item.id
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl shadow-sm active:scale-90"
                          >
                            +
                          </button>

                        </div>

                      </div>
                    )
                  )}

                </div>

                <div className="mt-5 rounded-[22px] bg-white p-5 shadow-sm">

                  <div className="flex justify-between text-sm text-[#777066]">
                    <span>
                      {text.products}
                    </span>

                    <span>
                      {totalItems}
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between">

                    <span className="font-medium">
                      {text.total}
                    </span>

                    <strong className="text-lg">
                      {total.toLocaleString(
                        "ru-RU"
                      )}{" "}
                      сум
                    </strong>

                  </div>

                </div>

                <div className="mt-5 rounded-[24px] bg-white p-5 shadow-sm">

                  <h2 className="font-serif text-xl">
                    {text.checkout}
                  </h2>

                  <p className="mt-2 text-xs text-[#81796f]">
                    {text.allRequired}
                  </p>

                  <div className="mt-4 space-y-3">

                    <input
                      value={name}
                      onChange={(e) =>
                        setName(
                          e.target.value
                        )
                      }
                      placeholder={`${text.name} *`}
                      className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
                    />

                    <div className="relative">
                      <input
                        value={password}
                        onChange={(e) =>
                          setPassword(
                            e.target.value
                          )
                        }
                        placeholder={`${text.password} *`}
                        type={showCheckoutPassword ? "text" : "password"}
                        className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 pr-12 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCheckoutPassword((value) => !value)}
                        className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg"
                        aria-label={showCheckoutPassword ? "Скрыть пароль" : "Показать пароль"}
                      >
                        {showCheckoutPassword ? "🙈" : "👁️"}
                      </button>
                    </div>

                    <input
                      value={phone}
                      onChange={(e) =>
                        setPhone(
                          e.target.value.replace(
                            /\D/g,
                            ""
                          )
                        )
                      }
                      placeholder={`${text.phone} *`}
                      type="text"
                      inputMode="numeric"
                      className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
                    />

                    {savedAddresses.length > 0 ? (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium">
                          {text.chooseAddress}
                        </label>
                        <select
                          value={selectedAddressId}
                          onChange={(e) =>
                            selectSavedAddress(e.target.value)
                          }
                          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
                        >
                          {savedAddresses.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <div className="rounded-2xl bg-white px-4 py-3.5 text-sm text-[#6f675e]">
                          {address}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          value={address}
                          onChange={(e) =>
                            setAddress(e.target.value)
                          }
                          placeholder={`${text.address} *`}
                          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
                        />
                        <p className="text-xs text-[#8b8175]">
                          {text.selectAddressFromSettings}
                        </p>
                      </div>
                    )}

                    <textarea
                      value={comment}
                      onChange={(e) =>
                        setComment(
                          e.target.value
                        )
                      }
                      placeholder={
                        text.comment
                      }
                      rows={3}
                      className="w-full resize-none rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
                    />

                    <div className="rounded-[22px] bg-[#f4f0e9] p-5">

                      <p className="text-[10px] uppercase tracking-[0.15em] text-[#a28b6c]">
                        {text.payment}
                      </p>

                      <h3 className="mt-2 font-serif text-xl">
                        {text.transfer}
                      </h3>

                      <p className="mt-2 text-xs leading-5 text-[#81796f]">
                        {text.paymentText}
                      </p>

                      <div className="mt-4 rounded-2xl bg-white p-4">

                        <p className="text-xs text-[#81796f]">
                          {text.cardNumber}
                        </p>

                        <p className="mt-2 break-all text-lg font-semibold tracking-wide">
                          {cardNumber
                            ? formatCardNumber(
                                cardNumber
                              )
                            : text.cardNotSet}
                        </p>

                      </div>

                      <label className="mt-4 block cursor-pointer rounded-2xl bg-white p-4">

                        <p className="text-sm font-medium">
                          📸{" "}
                          {text.uploadReceipt}
                        </p>

                        <p className="mt-1 text-xs text-[#81796f]">
                          {text.receiptText}
                        </p>

                        <input
                          type="file"
                          accept="image/*"
                          className="mt-3 block w-full text-sm"
                          onChange={(e) =>
                            setReceiptFile(
                              e.target.files?.[0] ||
                                null
                            )
                          }
                        />

                        {receiptFile && (
                          <p className="mt-3 text-xs text-[#806c53]">
                            ✓{" "}
                            {receiptFile.name}
                          </p>
                        )}

                      </label>

                    </div>

                    <button
                      onClick={
                        createOrder
                      }
                      disabled={
                        ordering
                      }
                      className="w-full rounded-full bg-[#171717] py-4 text-sm text-white active:scale-95 disabled:opacity-50"
                    >
                      {ordering
                        ? text.sending
                        : `${text.order} • ${total.toLocaleString(
                            "ru-RU"
                          )} сум`}
                    </button>

                  </div>

                </div>
              </>
            )}

          </section>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <section className="px-5 pb-28 pt-7">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-[#a28b6c]">
                  Duman Art
                </p>
                <h1 className="mt-2 font-serif text-[32px] leading-none tracking-[-0.02em]">
                  {text.settings}
                </h1>
              </div>
              {user && (
                <div className="dumanart-settings-profile-chip flex items-center gap-2 rounded-full px-3 py-2 text-xs">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8dfd2] text-[12px]">
                    {editName?.trim()?.slice(0, 1)?.toUpperCase() || "D"}
                  </span>
                  <span className="max-w-[90px] truncate">
                    {editName?.trim() || text.myData}
                  </span>
                </div>
              )}
            </div>

            {!user ? (
              <div className="dumanart-settings-login rounded-[26px] p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f4f0e9] text-lg">
                    👤
                  </div>
                  <div>
                    <h2 className="font-serif text-xl">{text.myAccount}</h2>
                    <p className="mt-1 text-sm text-[#81796f] dumanart-subtle">
                      {text.loginText}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <input
                    value={loginPhone}
                    onChange={(e) =>
                      setLoginPhone(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder={text.phone}
                    inputMode="numeric"
                    className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                  />

                  <div className="relative">
                    <input
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder={text.password}
                      type={showLoginPassword ? "text" : "password"}
                      className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((value) => !value)}
                      className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-base opacity-70 transition hover:opacity-100"
                      aria-label={showLoginPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showLoginPassword ? "🙈" : "👁️"}
                    </button>
                  </div>

                  <button
                    onClick={loginClient}
                    className="w-full rounded-full bg-[#171717] py-4 text-sm font-medium text-white transition active:scale-[0.99]"
                  >
                    {text.enter}
                  </button>

                  {loginMessage && (
                    <p className="text-center text-sm text-red-600">
                      {loginMessage}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="dumanart-settings-shell overflow-hidden rounded-[28px] shadow-sm">
                  {/* PROFILE */}
                  <details open className="dumanart-settings-group">
                    <summary className="dumanart-settings-summary list-none cursor-pointer px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="dumanart-settings-icon">👤</div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[15px] font-medium">{text.myData}</h2>
                          <p className="mt-0.5 truncate text-xs text-[#81796f] dumanart-subtle">
                            {editName?.trim() || text.phone}
                            {editPhone ? ` • ${editPhone}` : ""}
                          </p>
                        </div>
                        <span className="dumanart-chevron">⌄</span>
                      </div>
                    </summary>

                    <div className="dumanart-settings-content px-5 pb-5">
                      <div className="space-y-3">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={text.name}
                          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                        />
                        <input
                          value={editPhone}
                          onChange={(e) =>
                            setEditPhone(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder={text.phone}
                          inputMode="numeric"
                          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                        />
                        <button
                          type="button"
                          onClick={saveProfile}
                          className="w-full rounded-full bg-[#171717] py-3.5 text-sm font-medium text-white transition active:scale-[0.99]"
                        >
                          {text.save}
                        </button>
                        {saveMessage && (
                          <p className="text-center text-sm text-[#6f675e] dumanart-subtle">
                            {saveMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  </details>

                  {/* DELIVERY */}
                  <details
                    open={savedAddresses.length === 0}
                    className="dumanart-settings-group"
                  >
                    <summary className="dumanart-settings-summary list-none cursor-pointer px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="dumanart-settings-icon">📍</div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[15px] font-medium">{text.deliveryAddresses}</h2>
                          <p className="mt-0.5 truncate text-xs text-[#81796f] dumanart-subtle">
                            {savedAddresses.length === 0
                              ? text.noAddresses
                              : `${savedAddresses.length} ${language === "ru" ? "адреса сохранено" : "ta manzil saqlandi"}`}
                          </p>
                        </div>
                        <span className="dumanart-chevron">⌄</span>
                      </div>
                    </summary>

                    <div className="dumanart-settings-content px-5 pb-5">
                      <div className="space-y-3">
                        {savedAddresses.map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-2xl border p-4 transition ${
                              selectedAddressId === item.id
                                ? "border-[#c7a97f] bg-[#faf7f2]"
                                : "border-[#e7e0d7]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => selectSavedAddress(item.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{item.label}</span>
                                  {selectedAddressId === item.id && (
                                    <span className="rounded-full bg-[#171717] px-2 py-1 text-[9px] text-white">
                                      ✓
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 text-sm leading-5 text-[#777066] dumanart-subtle">
                                  {item.address}
                                </p>
                              </button>

                              <button
                                type="button"
                                onClick={() => removeSavedAddress(item.id)}
                                className="shrink-0 rounded-full px-2 py-1 text-sm text-red-600 opacity-70 transition hover:opacity-100"
                                aria-label={text.deleteAddress}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}

                        <details className="rounded-2xl bg-[#f4f0e9] p-4">
                          <summary className="list-none cursor-pointer text-sm font-medium">
                            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-base">
                              +
                            </span>
                            {text.addAddress}
                          </summary>

                          <div className="mt-4 space-y-3">
                            <input
                              value={newAddressLabel}
                              onChange={(e) => setNewAddressLabel(e.target.value)}
                              placeholder={text.addressLabel}
                              className="w-full rounded-2xl bg-white px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                            />
                            <textarea
                              value={newAddressText}
                              onChange={(e) => setNewAddressText(e.target.value)}
                              placeholder={text.address}
                              rows={3}
                              className="w-full resize-none rounded-2xl bg-white px-4 py-3.5 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                            />
                            <button
                              type="button"
                              onClick={addSavedAddress}
                              className="w-full rounded-full bg-[#171717] py-3.5 text-sm font-medium text-white"
                            >
                              {text.addAddress}
                            </button>
                            {addressMessage && (
                              <p className="text-center text-sm text-[#6f675e] dumanart-subtle">
                                {addressMessage}
                              </p>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  </details>

                  {/* LANGUAGE */}
                  <div className="dumanart-settings-row px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="dumanart-settings-icon">🌐</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{text.language}</p>
                        <p className="mt-0.5 text-xs text-[#81796f] dumanart-subtle">
                          {language === "ru" ? text.russian : text.uzbek}
                        </p>
                      </div>
                      <select
                        value={language}
                        onChange={(e) => changeLanguage(e.target.value as Language)}
                        className="dumanart-settings-select rounded-full px-3.5 py-2 text-sm outline-none"
                      >
                        <option value="ru">{text.russian}</option>
                        <option value="uz">{text.uzbek}</option>
                      </select>
                    </div>
                  </div>

                  {/* THEME */}
                  <div className="dumanart-settings-row px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="dumanart-settings-icon">
                        {themeMode === "dark" ? "🌙" : "☀️"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{text.theme}</p>
                        <p className="mt-0.5 text-xs text-[#81796f] dumanart-subtle">
                          {themeMode === "dark"
                            ? text.themeNightDescription
                            : text.themeDayDescription}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#f4f0e9] p-1">
                      <button
                        type="button"
                        onClick={() => changeTheme("light")}
                        className={`rounded-xl px-3 py-3 text-sm transition ${
                          themeMode === "light"
                            ? "bg-white font-medium shadow-sm"
                            : "text-[#777066]"
                        }`}
                      >
                        ☀️ {text.dayTheme}
                      </button>
                      <button
                        type="button"
                        onClick={() => changeTheme("dark")}
                        className={`rounded-xl px-3 py-3 text-sm transition ${
                          themeMode === "dark"
                            ? "bg-white font-medium shadow-sm"
                            : "text-[#777066]"
                        }`}
                      >
                        🌙 {text.nightTheme}
                      </button>
                    </div>
                  </div>

                  {/* PASSWORD */}
                  <details className="dumanart-settings-group">
                    <summary className="dumanart-settings-summary list-none cursor-pointer px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="dumanart-settings-icon">🔒</div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[15px] font-medium">{text.passwordChangedTitle}</h2>
                          <p className="mt-0.5 truncate text-xs text-[#81796f] dumanart-subtle">
                            {passwordChangedOnce
                              ? text.passwordChangedOnce
                              : language === "ru"
                                ? "Пароль можно изменить один раз"
                                : "Parolni bir marta almashtirish mumkin"}
                          </p>
                        </div>
                        <span className="dumanart-chevron">⌄</span>
                      </div>
                    </summary>

                    <div className="dumanart-settings-content px-5 pb-5">
                      {passwordChangedOnce ? (
                        <div className="rounded-2xl bg-[#f4f0e9] px-4 py-4 text-sm text-[#6f675e] dumanart-subtle">
                          🔒 {text.passwordChangedOnce}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="relative">
                            <input
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder={text.currentPassword}
                              type={showCurrentPassword ? "text" : "password"}
                              className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword((value) => !value)}
                              className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-base opacity-70"
                              aria-label={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}
                            >
                              {showCurrentPassword ? "🙈" : "👁️"}
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder={text.newPassword}
                              type={showNewPassword ? "text" : "password"}
                              className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword((value) => !value)}
                              className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-base opacity-70"
                              aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}
                            >
                              {showNewPassword ? "🙈" : "👁️"}
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              value={confirmNewPassword}
                              onChange={(e) => setConfirmNewPassword(e.target.value)}
                              placeholder={text.confirmPassword}
                              type={showConfirmNewPassword ? "text" : "password"}
                              className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 pr-12 outline-none transition focus:ring-2 focus:ring-[#c7a97f]/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmNewPassword((value) => !value)}
                              className="absolute right-2.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-base opacity-70"
                              aria-label={showConfirmNewPassword ? "Скрыть пароль" : "Показать пароль"}
                            >
                              {showConfirmNewPassword ? "🙈" : "👁️"}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={changePasswordOnce}
                            disabled={changingPassword}
                            className="w-full rounded-full bg-[#171717] py-3.5 text-sm font-medium text-white disabled:opacity-50"
                          >
                            {changingPassword ? text.changingPassword : text.changePassword}
                          </button>
                          {passwordChangeMessage && (
                            <p className="text-center text-sm text-[#6f675e] dumanart-subtle">
                              {passwordChangeMessage}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                </div>

                {/* ADMIN */}
                {isStoreAdmin && (
                  <div className="dumanart-admin-mini mt-4 rounded-[22px] px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base">
                        🔐
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{text.adminPanel}</p>
                        <p className="mt-0.5 text-xs text-white/55">{text.adminPanelText}</p>
                      </div>
                      <a
                        href="/admin"
                        className="rounded-full bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/15"
                      >
                        →
                      </a>
                    </div>
                  </div>
                )}

                {/* ORDERS */}
                <div className="mt-7">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-serif text-2xl">{text.myOrders}</h2>
                    <span className="text-xs text-[#81796f] dumanart-subtle">
                      {orders.length}
                    </span>
                  </div>

                  {orders.length === 0 ? (
                    <div className="dumanart-empty-settings rounded-[24px] p-6 text-center shadow-sm">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f0e9] text-xl">
                        📦
                      </div>
                      <p className="mt-3 text-sm text-[#81796f] dumanart-subtle">
                        {text.noOrders}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {orders.map((order, index) => (
                        <details
                          key={order.id}
                          className="dumanart-order-row overflow-hidden rounded-[22px] shadow-sm"
                        >
                          <summary className="list-none cursor-pointer px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f4f0e9] text-xs">
                                #{index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {order.items?.[0]?.name || `#${index + 1}`}
                                </p>
                                <p className="mt-0.5 text-xs text-[#81796f] dumanart-subtle">
                                  {Number(order.total).toLocaleString("ru-RU")} сум • {order.status}
                                </p>
                              </div>
                              <span className="dumanart-chevron">⌄</span>
                            </div>
                          </summary>

                          <div className="dumanart-settings-content px-4 pb-4">
                            <div className="space-y-2 border-t border-[#eee8df] pt-3">
                              {order.items?.map((item, itemIndex) => (
                                <div
                                  key={itemIndex}
                                  className="flex justify-between gap-4 text-sm"
                                >
                                  <span className="text-[#777066] dumanart-subtle">
                                    {item.name} × {item.quantity}
                                  </span>
                                  <span className="shrink-0">
                                    {(
                                      Number(item.price) * item.quantity
                                    ).toLocaleString("ru-RU")} сум
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t border-[#eee8df] pt-3">
                              <span className="text-xs text-[#81796f] dumanart-subtle">
                                {order.paymentStatus}
                              </span>
                              <strong className="text-sm">
                                {Number(order.total).toLocaleString("ru-RU")} сум
                              </strong>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={logoutClient}
                  className="mt-6 w-full rounded-full bg-white py-4 text-sm text-red-600 shadow-sm transition active:scale-[0.99]"
                >
                  {text.logout}
                </button>
              </>
            )}
          </section>
        )}
      </div>

      {/* BOTTOM NAV */}
      <nav
        className={`dumanart-bottom-nav fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[520px] border-t px-2 pb-4 pt-3 backdrop-blur-xl ${
          themeMode === "dark"
            ? "border-[#35312d] bg-[#211f1d]/95"
            : "border-[#ddd5ca] bg-[#f8f5f0]/95"
        }`}
      >
        <div className="grid grid-cols-4">
          <NavButton active={tab === "home"} icon="home" label={text.home} onClick={() => changeTab("home")} />
          <NavButton active={tab === "favorites"} icon="favorites" label={text.favorites} onClick={() => changeTab("favorites")} />
          <NavButton
            active={tab === "cart"}
            icon="cart"
            label={totalItems ? `${text.cart} (${totalItems})` : text.cart}
            onClick={() => changeTab("cart")}
          />
          <NavButton active={tab === "settings"} icon="settings" label={text.settings} onClick={() => changeTab("settings")} />
        </div>
      </nav>

      </main>
    </>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: "home" | "favorites" | "cart" | "settings";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`dumanart-nav-button flex min-w-0 flex-col items-center gap-1 text-[9px] transition ${
        active ? "active scale-105" : ""
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
        {icon === "home" && (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 10 9-7 9 7" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M9 20v-6h6v6" />
          </svg>
        )}
        {icon === "favorites" && (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 8.6c0 5.1-8.8 10.1-8.8 10.1S3.2 13.7 3.2 8.6A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.8 2.4Z" />
          </svg>
        )}
        {icon === "cart" && (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L20 8H6" />
            <circle cx="9" cy="20" r="1" />
            <circle cx="18" cy="20" r="1" />
          </svg>
        )}
        {icon === "settings" && (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v2" /><path d="M12 19v2" />
            <path d="m4.2 4.9 1.4 1.4" /><path d="m18.4 18.7 1.4 1.4" />
            <path d="M3 12h2" /><path d="M19 12h2" />
            <path d="m4.2 19.1 1.4-1.4" /><path d="m18.4 5.3 1.4-1.4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        )}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

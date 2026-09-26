"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

export default function AuthPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");

  async function register() {
    if (!name || !password || !phone || !address) {
      setMessage("Заполни все поля");
      return;
    }

    try {
      /*
        Firebase Auth требует email.
        Используем технический email на основе имени.
        Пользователь его не вводит.
      */
      const safeName = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ".");

      const email = `${safeName}@dumanart.local`;

      const userCredential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        name,
        phone,
        address,
        createdAt: new Date(),
      });

      setMessage("✅ Аккаунт создан!");
    } catch (error: any) {
      console.error(error);

      if (error.code === "auth/email-already-in-use") {
        setMessage("Такое имя уже используется");
      } else if (error.code === "auth/weak-password") {
        setMessage("Пароль должен быть минимум 6 символов");
      } else {
        setMessage("Ошибка регистрации");
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f0e9] px-5 py-10 text-[#171717]">
      <div className="mx-auto max-w-[520px]">

        <div className="text-center">
          <div className="font-serif text-3xl tracking-[0.2em]">
            DUMAN ART
          </div>

          <p className="mt-2 text-sm text-[#81796f]">
            Создайте аккаунт
          </p>
        </div>

        <div className="mt-8 space-y-4">

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя"
            className="w-full rounded-2xl bg-white px-5 py-4 outline-none"
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            type="password"
            className="w-full rounded-2xl bg-white px-5 py-4 outline-none"
          />

          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Телефон"
            type="tel"
            className="w-full rounded-2xl bg-white px-5 py-4 outline-none"
          />

          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Адрес"
            className="w-full rounded-2xl bg-white px-5 py-4 outline-none"
          />

          <button
            onClick={register}
            className="w-full rounded-full bg-[#171717] px-6 py-4 text-sm text-white transition active:scale-95"
          >
            Создать аккаунт
          </button>

          {message && (
            <div className="rounded-2xl bg-white p-4 text-center text-sm">
              {message}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
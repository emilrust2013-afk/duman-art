"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

type CollectionItem = {
  id: string;
  nameRu: string;
  nameUz: string;
};

type Props = {
  onChanged?: () => void;
};

export default function CollectionManager({ onChanged }: Props) {
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [nameRu, setNameRu] = useState("");
  const [nameUz, setNameUz] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const snapshot = await getDocs(collection(db, "collections"));
      const next = snapshot.docs
        .map((item) => ({
          id: item.id,
          nameRu: String(item.data().nameRu || "").trim(),
          nameUz: String(item.data().nameUz || "").trim(),
        }))
        .filter((item) => item.nameRu || item.nameUz)
        .sort((a, b) => (a.nameRu || a.nameUz).localeCompare(b.nameRu || b.nameUz));
      setItems(next);
    } catch (error) {
      console.error(error);
      setMessage("Не удалось загрузить коллекции");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCollection() {
    if (!nameRu.trim() && !nameUz.trim()) {
      setMessage("Укажи название коллекции");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      await addDoc(collection(db, "collections"), {
        nameRu: nameRu.trim(),
        nameUz: nameUz.trim() || nameRu.trim(),
        createdAt: serverTimestamp(),
      });

      setNameRu("");
      setNameUz("");
      await load();
      onChanged?.();
      setMessage("Коллекция добавлена");
    } catch (error) {
      console.error(error);
      setMessage("Не удалось добавить коллекцию");
    } finally {
      setSaving(false);
    }
  }

  async function removeCollection(item: CollectionItem) {
    const label = item.nameRu || item.nameUz;
    if (!window.confirm(`Удалить коллекцию «${label}»?`)) return;

    try {
      await deleteDoc(doc(db, "collections", item.id));
      await load();
      onChanged?.();
    } catch (error) {
      console.error(error);
      setMessage("Не удалось удалить коллекцию");
    }
  }

  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm">
      <div>
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#a28b6c]">
          DUMAN ART
        </p>
        <h2 className="mt-1 font-serif text-2xl">Коллекции</h2>
        <p className="mt-2 text-sm text-[#81796f]">
          Создавай новые коллекции, а затем выбирай их при добавлении украшения.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <input
          value={nameRu}
          onChange={(e) => setNameRu(e.target.value)}
          placeholder="Название коллекции (RU)"
          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
        />
        <input
          value={nameUz}
          onChange={(e) => setNameUz(e.target.value)}
          placeholder="Название коллекции (UZ)"
          className="w-full rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
        />
        <button
          type="button"
          onClick={createCollection}
          disabled={saving}
          className="w-full rounded-full bg-[#171717] py-4 text-sm text-white disabled:bg-[#c7c0b7]"
        >
          {saving ? "Сохраняем..." : "+ Добавить коллекцию"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-[#7f6b54]">{message}</p>}

      {items.length > 0 && (
        <div className="mt-5 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl bg-[#f4f0e9] px-4 py-3"
            >
              <div>
                <div className="font-medium">{item.nameRu || item.nameUz}</div>
                {item.nameUz && item.nameUz !== item.nameRu && (
                  <div className="text-xs text-[#8a8076]">{item.nameUz}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeCollection(item)}
                className="rounded-full bg-white px-3 py-2 text-xs text-red-600 shadow-sm"
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

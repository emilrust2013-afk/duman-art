"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

type CollectionItem = {
  id: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function CollectionPicker({ value, onChange }: Props) {
  const [collectionsList, setCollectionsList] = useState<CollectionItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  async function loadCollections() {
    try {
      const [collectionSnapshot, productSnapshot] = await Promise.all([
        getDocs(collection(db, "collections")),
        getDocs(collection(db, "products")),
      ]);

      const byName = new Map<string, CollectionItem>();

      collectionSnapshot.docs.forEach((item) => {
        const data = item.data();
        const name = String(
          data.name || data.nameRu || data.nameUz || ""
        ).trim();

        if (!name) return;

        byName.set(name.toLowerCase(), {
          id: item.id,
          name,
          nameRu: String(data.nameRu || name).trim(),
          nameUz: String(data.nameUz || name).trim(),
        });
      });

      // Старые товары уже могут содержать collection,
      // даже если отдельной записи в /collections ещё нет.
      productSnapshot.docs.forEach((item) => {
        const name = String(item.data().collection || "").trim();
        if (!name || byName.has(name.toLowerCase())) return;

        byName.set(name.toLowerCase(), {
          id: `product-${name}`,
          name,
          nameRu: name,
          nameUz: name,
        });
      });

      const loaded = Array.from(byName.values()).sort((a, b) =>
        (a.nameRu || a.name).localeCompare(b.nameRu || b.name)
      );

      setCollectionsList(loaded);
    } catch (error) {
      console.error(error);
      setMessage("Не удалось загрузить коллекции");
    }
  }

  useEffect(() => {
    loadCollections();
  }, []);

  async function createNewCollection() {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      setMessage("");
      const docRef = await addDoc(collection(db, "collections"), {
        name: trimmed,
        nameRu: trimmed,
        nameUz: trimmed,
        createdAt: serverTimestamp(),
      });

      onChange(trimmed);
      setNewName("");
      setCreating(false);
      await loadCollections();

      setCollectionsList((current) => [
        ...current,
        { id: docRef.id, name: trimmed, nameRu: trimmed, nameUz: trimmed },
      ]);
    } catch (error) {
      console.error(error);
      setMessage("Не удалось создать коллекцию");
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#5f584f]">
        Коллекция
      </label>

      <div className="flex gap-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-2xl bg-[#f4f0e9] px-4 py-3.5 outline-none"
        >
          <option value="">Без коллекции</option>
          {collectionsList.map((item) => (
            <option key={item.id} value={item.name || item.nameRu || item.nameUz}>
              {item.nameRu || item.name || item.nameUz}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="shrink-0 rounded-2xl bg-[#171717] px-4 py-3 text-sm text-white"
        >
          + Новая
        </button>
      </div>

      {creating && (
        <div className="mt-3 rounded-2xl bg-[#f4f0e9] p-3">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Название новой коллекции"
            className="w-full rounded-xl bg-white px-4 py-3 outline-none"
          />

          <button
            type="button"
            onClick={createNewCollection}
            className="mt-2 w-full rounded-full bg-white py-3 text-sm shadow-sm"
          >
            Создать и выбрать
          </button>
        </div>
      )}

      {message && <p className="mt-2 text-xs text-[#9a5e4d]">{message}</p>}
    </div>
  );
}

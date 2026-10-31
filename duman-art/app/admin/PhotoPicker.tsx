"use client";

import { ChangeEvent, Dispatch, SetStateAction, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { storage } from "../firebase";

// Фото товара в редакторе: либо уже сохранённое (url), либо новое (файл,
// уже сжатый на клиенте, с локальным превью через object URL).
export type PhotoItem =
  | { kind: "saved"; id: string; url: string }
  | { kind: "new"; id: string; file: File; preview: string };

export const MAX_PHOTOS = 10;
// Лимит правил Storage: файл строго меньше 10 МБ.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Исходники больше этого даже не пытаемся открывать — защита памяти телефона.
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `p${Date.now()}-${idCounter}`;
}

export function savedPhotos(urls: string[]): PhotoItem[] {
  return urls.filter(Boolean).map((url) => ({ kind: "saved", id: nextId(), url }));
}

// Освобождает object URL у новых фото. Вызывать, когда превью больше не нужны.
export function revokePhotos(items: PhotoItem[]) {
  for (const item of items) {
    if (item.kind === "new") URL.revokeObjectURL(item.preview);
  }
}

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  // Иногда iOS отдаёт HEIC без MIME-типа.
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
}

// Сжимает фото до ~1600px по длинной стороне в JPEG. Ориентацию из EXIF
// браузер применяет сам при отрисовке <img> на canvas.
async function compressImage(file: File): Promise<File> {
  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new Error("decode");

  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  // Белый фон, чтобы прозрачные PNG не стали чёрными в JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error("canvas");

  // Маленький JPEG без уменьшения может после пережатия стать больше — тогда оставляем исходник.
  if (scale === 1 && file.type === "image/jpeg" && file.size <= blob.size) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

// Загружает новые фото в Storage по порядку и возвращает итоговый список
// URL в том порядке, в каком фото стоят в редакторе.
export async function uploadPhotos(
  items: PhotoItem[],
  productId: string,
  onProgress: (done: number, total: number) => void
): Promise<string[]> {
  const total = items.filter((item) => item.kind === "new").length;
  const urls: string[] = [];
  let done = 0;

  for (const item of items) {
    if (item.kind === "saved") {
      urls.push(item.url);
      continue;
    }

    onProgress(done + 1, total);

    const safeName = `${Date.now()}-${done}-${item.file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )}`;
    const storageRef = ref(storage, `products/${productId}/${safeName}`);

    await uploadBytes(storageRef, item.file, {
      contentType: item.file.type || "image/jpeg",
    });
    urls.push(await getDownloadURL(storageRef));
    done += 1;
  }

  return urls;
}

type Props = {
  items: PhotoItem[];
  onChange: Dispatch<SetStateAction<PhotoItem[]>>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export default function PhotoPicker({
  items,
  onChange,
  disabled,
  onBusyChange,
}: Props) {
  const [processing, setProcessing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const remaining = MAX_PHOTOS - items.length;
  const locked = disabled || processing;

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    // Сбрасываем, чтобы можно было выбрать то же фото ещё раз.
    event.target.value = "";
    if (files.length === 0) return;

    const problems: string[] = [];
    let accepted = files;

    if (files.length > remaining) {
      accepted = files.slice(0, Math.max(0, remaining));
      problems.push(
        remaining > 0
          ? `Можно не больше ${MAX_PHOTOS} фото на товар — добавлены первые ${remaining}.`
          : `Уже ${MAX_PHOTOS} фото — это максимум. Удалите лишнее, чтобы добавить новое.`
      );
    }

    setProcessing(true);
    onBusyChange?.(true);

    const added: PhotoItem[] = [];

    for (const file of accepted) {
      const name = file.name || "фото";

      if (!isImageFile(file)) {
        problems.push(`«${name}» — это не изображение.`);
        continue;
      }

      if (file.size > MAX_SOURCE_BYTES) {
        problems.push(`«${name}» слишком большое (${Math.round(file.size / 1024 / 1024)} МБ) — выберите фото поменьше.`);
        continue;
      }

      let prepared: File;
      try {
        prepared = await compressImage(file);
      } catch {
        const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
        problems.push(
          heic
            ? `«${name}» в формате HEIC — этот браузер не может его открыть. На iPhone: Настройки → Камера → Форматы → «Наиболее совместимый», или сделайте скриншот фото.`
            : `Не удалось открыть «${name}». Попробуйте другое фото.`
        );
        continue;
      }

      if (prepared.size >= MAX_UPLOAD_BYTES) {
        problems.push(`«${name}» больше 10 МБ даже после сжатия — выберите другое фото.`);
        continue;
      }

      added.push({
        kind: "new",
        id: nextId(),
        file: prepared,
        preview: URL.createObjectURL(prepared),
      });
    }

    if (added.length > 0) {
      onChange((current) => {
        // На случай гонки: не даём превысить лимит.
        const free = MAX_PHOTOS - current.length;
        revokePhotos(added.slice(Math.max(0, free)));
        return [...current, ...added.slice(0, Math.max(0, free))];
      });
    }

    setErrors(problems);
    setProcessing(false);
    onBusyChange?.(false);
  }

  function remove(id: string) {
    onChange((current) => {
      const item = current.find((photo) => photo.id === id);
      if (item) revokePhotos([item]);
      return current.filter((photo) => photo.id !== id);
    });
    setErrors([]);
  }

  function move(index: number, delta: number) {
    onChange((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function makeMain(index: number) {
    onChange((current) => {
      if (index <= 0 || index >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      return [item, ...next];
    });
  }

  const smallButton =
    "flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-base text-[#171717] shadow disabled:opacity-30";

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-2xl bg-white ${
                index === 0 ? "ring-2 ring-[#171717]" : "ring-1 ring-[#e4dbcf]"
              }`}
            >
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.kind === "saved" ? item.url : item.preview}
                  alt={`Фото ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>

              {index === 0 ? (
                <span className="absolute left-2 top-2 rounded-full bg-[#171717] px-2.5 py-1 text-[11px] font-medium text-white">
                  Главное
                </span>
              ) : (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => makeMain(index)}
                  className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-[#171717] shadow disabled:opacity-50"
                >
                  Сделать главным
                </button>
              )}

              <button
                type="button"
                disabled={locked}
                onClick={() => remove(item.id)}
                className={`absolute right-2 top-2 ${smallButton}`}
                aria-label="Удалить фото"
              >
                ✕
              </button>

              <div className="absolute inset-x-2 bottom-2 flex justify-between">
                <button
                  type="button"
                  disabled={locked || index === 0}
                  onClick={() => move(index, -1)}
                  className={smallButton}
                  aria-label="Сдвинуть влево"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={locked || index === items.length - 1}
                  onClick={() => move(index, 1)}
                  className={smallButton}
                  aria-label="Сдвинуть вправо"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label
        className={`flex w-full items-center justify-center rounded-2xl border-2 border-dashed border-[#cfc5b9] bg-[#faf8f5] px-4 py-5 text-base font-medium text-[#171717] ${
          locked || remaining <= 0
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer active:bg-[#f0ebe4]"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={locked || remaining <= 0}
          onChange={handleSelect}
          className="sr-only"
        />
        {processing
          ? "Обрабатываем фото…"
          : remaining <= 0
          ? `Добавлено ${MAX_PHOTOS} фото — это максимум`
          : "+ Добавить фото"}
      </label>

      <p className="mt-2 text-xs text-[#777066]">
        {items.length} из {MAX_PHOTOS}. Первое фото — главное, его видно в каталоге.
      </p>

      {errors.length > 0 && (
        <div className="mt-2 space-y-1 rounded-2xl bg-[#fdecea] px-4 py-3 text-sm text-[#8a2a1f]">
          {errors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

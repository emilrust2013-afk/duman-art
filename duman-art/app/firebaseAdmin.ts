// Firebase Admin SDK — только для серверных маршрутов (app/api/**).
// Не импортируйте этот файл в клиентские компоненты.
//
// Ключ сервисного аккаунта берётся из серверной переменной окружения
// FIREBASE_SERVICE_ACCOUNT_BASE64 (весь JSON-ключ, закодированный в base64).
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const encoded = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();

  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not configured");
  }

  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };

  try {
    serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    // Текст ошибки без содержимого переменной.
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 JSON");
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is missing required fields");
  }

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

// Проверяет Firebase ID token из заголовка "Authorization: Bearer <token>".
// Возвращает расшифрованный токен или null.
export async function verifyRequestIdToken(
  request: Request
): Promise<DecodedIdToken | null> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    return null;
  }

  // Ошибка конфигурации (нет ключа) должна дойти до маршрута как 500,
  // а не превратиться в «неверный токен».
  const adminAuth = getAdminAuth();

  try {
    return await adminAuth.verifyIdToken(match[1]);
  } catch {
    return null;
  }
}

// Выдаёт аккаунтам Firebase Auth права администратора (custom claim admin: true).
// Запуск (в папке duman-art):
//   npm run admin:claims                      — аккаунты по умолчанию
//   npm run admin:claims -- a@x.local b@x.local
//   npm run admin:claims -- --remove a@x.local — снять права
// Ключ берётся из FIREBASE_SERVICE_ACCOUNT_BASE64 (.env.local). Ключ не печатается.
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const DEFAULT_ADMIN_EMAILS = ["emil@dumanart.local", "mama@dumanart.local"];

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const emails = args.filter((arg) => !arg.startsWith("--"));
const targets = emails.length > 0 ? emails : remove ? [] : DEFAULT_ADMIN_EMAILS;

if (targets.length === 0) {
  console.error("❌ Укажите email для --remove");
  process.exit(1);
}

const encoded = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();

if (!encoded) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_BASE64 не задан (duman-art/.env.local)");
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
} catch {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_BASE64 не похож на base64 JSON");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key,
  }),
});

const auth = getAuth();
let failed = false;

for (const email of targets) {
  try {
    const user = await auth.getUserByEmail(email);
    const claims = { ...(user.customClaims || {}) };

    if (remove) {
      delete claims.admin;
    } else {
      claims.admin = true;
    }

    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`✅ ${email}: admin = ${remove ? "снят" : "true"}`);
  } catch (error) {
    failed = true;
    console.error(`❌ ${email}: ${error.code || error.message}`);
  }
}

console.log(
  "\nℹ️ Админка обновляет токен при входе сама. Если права не применились — выйдите и войдите снова."
);

process.exit(failed ? 1 : 0);

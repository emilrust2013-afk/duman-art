// Общий вызов Bot API для скриптов webhook. Токен никогда не печатается.

export function requireEnv(name) {
  const value = String(process.env[name] || "").trim();

  if (!value) {
    console.error(`❌ Переменная окружения ${name} не задана`);
    process.exit(1);
  }

  return value;
}

export async function telegramRequest(method, payload = {}) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(
      `${method}: ${data?.description || `HTTP ${response.status}`}`
    );
  }

  return data.result;
}

export async function printWebhookInfo() {
  const info = await telegramRequest("getWebhookInfo");
  console.log("ℹ️ getWebhookInfo:");
  console.log(JSON.stringify(info, null, 2));
}

export function telegramBotBaseUrl() {
  const username = String(process.env.DORAEMON_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) || !/bot$/i.test(username)) return "";
  return `https://t.me/${username}`;
}

export function telegramBotStartUrl(payload = "free") {
  const base = telegramBotBaseUrl();
  const normalized = String(payload || "").trim();
  if (!base || !/^[A-Za-z0-9_-]{1,64}$/.test(normalized)) return "";
  return `${base}?start=${normalized}`;
}

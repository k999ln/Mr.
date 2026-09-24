// Public and runtime-safe configuration for a user-owned Telegram bot.
//
// A Rockstar_ibot installation owns exactly one BotFather bot in the current BYOB mode. Secret
// values never leave process.env; this module only produces public identity/URL values and validates
// the HTTPS webhook origin. A shared service hosting many independent bots needs the separate
// connection registry/vault described in project.md and must not reuse this process-global mode.
"use strict";

const BOT_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;
const START_PARAMETER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WEBHOOK_SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;
const TELEGRAM_SETUP_URL = "https://github.com/k999ln/Mr./blob/main/docs/telegram-bot-setup.ja.md";

function normalizeBotUsername(value) {
  const raw = String(value == null ? "" : value).trim().replace(/^@/, "");
  if (!BOT_USERNAME_RE.test(raw) || !/bot$/i.test(raw)) return "";
  return raw;
}

function telegramBotUrl(username, startParameter) {
  const normalized = normalizeBotUsername(username);
  if (!normalized) return "";
  if (startParameter == null || startParameter === "") return `https://t.me/${normalized}`;
  const start = String(startParameter);
  if (!START_PARAMETER_RE.test(start)) return "";
  return `https://t.me/${normalized}?start=${encodeURIComponent(start)}`;
}

function publicBaseUrl(env = process.env) {
  const explicit = String(env.LM_PUBLIC_URL || "");
  const railwayDomain = String(env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  const raw = explicit || (railwayDomain ? `https://${railwayDomain.replace(/^https?:\/\//i, "")}` : "");
  if (!raw || raw.trim() !== raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return "";
    if (parsed.pathname !== "/" && parsed.pathname !== "") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function validWebhookSecret(value) {
  return WEBHOOK_SECRET_RE.test(String(value || ""));
}

function telegramMode(env = process.env) {
  return String(env.LM_TELEGRAM_MODE || "byob_single").trim();
}

function telegramPublicConfig(env = process.env) {
  const mode = telegramMode(env);
  const username = normalizeBotUsername(env.LM_TELEGRAM_BOT_USERNAME);
  return Object.freeze({
    mode,
    configured: mode === "byob_single" && Boolean(username),
    botUsername: username || null,
    launchUrl: mode === "byob_single" && username ? telegramBotUrl(username, "lp") : null,
    setupUrl: TELEGRAM_SETUP_URL,
  });
}

module.exports = {
  BOT_USERNAME_RE,
  START_PARAMETER_RE,
  TELEGRAM_SETUP_URL,
  normalizeBotUsername,
  telegramBotUrl,
  publicBaseUrl,
  validWebhookSecret,
  telegramMode,
  telegramPublicConfig,
};

// lib/webhook-selfheal.js — INC-3's permanent fix: the runtime registers its own webhook at boot.
//
// The incident class this kills: the registered secret and the runtime secret drifting apart
// (INC-1: staged env rolled under an old registration; INC-3: registration vanished entirely, then
// a re-registration was cut to 40 of 64 chars by a truncating table display). When the SAME process
// that will compare `x-telegram-bot-api-secret-token` also sends that value to setWebhook, there is
// nothing left to drift: both sides are one process.env read.
//
// Idempotent: getWebhookInfo first; setWebhook only when url or allowed_updates differ. Telegram
// cannot echo the registered secret back, so a mismatched-secret-but-matching-url state is healed
// lazily — the /telegram handler's 401s surface in getWebhookInfo.last_error_message, which is
// treated as a mismatch signal on the next boot.
"use strict";

const {
  normalizeBotUsername,
  publicBaseUrl,
  telegramMode,
  validWebhookSecret,
} = require("./telegram-config.js");
const {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
} = require("./doraemon-bot-profile.js");

const ALLOWED_UPDATES = ["message", "edited_message", "callback_query", "pre_checkout_query"]; // U4: live location arrives as edited_message

function sameCommands(value) {
  return Array.isArray(value)
    && JSON.stringify(value.map(({ command, description }) => ({ command, description }))) === JSON.stringify(BOT_COMMANDS);
}

async function botApi(fetchImpl, token, method, body) {
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, body == null ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!payload || payload.ok !== true) return { ok: false, reason: `${method} rejected` };
    return { ok: true, result: payload.result };
  } catch {
    return { ok: false, reason: `${method} failed` };
  }
}

async function syncBotProfile(token, fetchImpl = fetch) {
  const initial = await Promise.all([
    botApi(fetchImpl, token, "getMyCommands"),
    botApi(fetchImpl, token, "getMyDescription"),
    botApi(fetchImpl, token, "getMyShortDescription"),
  ]);
  if (initial.some((item) => !item.ok)) {
    return { ok: false, changed: false, reason: "bot profile readback failed" };
  }
  const mismatches = [
    !sameCommands(initial[0].result),
    String(initial[1].result && initial[1].result.description || "") !== BOT_DESCRIPTION,
    String(initial[2].result && initial[2].result.short_description || "") !== BOT_SHORT_DESCRIPTION,
  ];
  if (!mismatches.some(Boolean)) return { ok: true, changed: false, reason: "already-current" };

  const writes = await Promise.all([
    mismatches[0] ? botApi(fetchImpl, token, "setMyCommands", { commands: BOT_COMMANDS }) : { ok: true },
    mismatches[1] ? botApi(fetchImpl, token, "setMyDescription", { description: BOT_DESCRIPTION }) : { ok: true },
    mismatches[2] ? botApi(fetchImpl, token, "setMyShortDescription", { short_description: BOT_SHORT_DESCRIPTION }) : { ok: true },
  ]);
  if (writes.some((item) => !item.ok)) {
    return { ok: false, changed: false, reason: "bot profile update failed" };
  }

  const verified = await Promise.all([
    botApi(fetchImpl, token, "getMyCommands"),
    botApi(fetchImpl, token, "getMyDescription"),
    botApi(fetchImpl, token, "getMyShortDescription"),
  ]);
  const current = verified.every((item) => item.ok)
    && sameCommands(verified[0].result)
    && String(verified[1].result && verified[1].result.description || "") === BOT_DESCRIPTION
    && String(verified[2].result && verified[2].result.short_description || "") === BOT_SHORT_DESCRIPTION;
  return current
    ? { ok: true, changed: true, reason: "updated" }
    : { ok: false, changed: false, reason: "bot profile verification failed" };
}

async function selfHealWebhook(env, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const token = String((env && env.LM_TELEGRAM_BOT_TOKEN) || "");
  const secret = String((env && env.LM_TELEGRAM_WEBHOOK_SECRET) || "");
  const configuredUsername = String((env && env.LM_TELEGRAM_BOT_USERNAME) || "").trim();
  const expectedUsername = normalizeBotUsername(configuredUsername);
  const base = publicBaseUrl(env);
  if (telegramMode(env) !== "byob_single") return { healed: false, reason: "unsupported Telegram connection mode" };
  if (!token) return { healed: false, reason: "no bot token in env" };
  if (configuredUsername && !expectedUsername) return { healed: false, reason: "configured bot username is invalid" };
  if (!validWebhookSecret(secret)) return { healed: false, reason: "webhook secret must be 32-256 Telegram-safe characters" };
  if (!base) return { healed: false, reason: "no valid HTTPS LM_PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN in env" };
  const target = `${base}/telegram`;

  // Bind the token to the public bot identity before touching its webhook. This stops a pasted token
  // for the wrong bot from silently hijacking the configured installation.
  let me;
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`);
    me = await response.json();
  } catch {
    return { healed: false, reason: "getMe failed" };
  }
  const actualUsername = normalizeBotUsername(me && me.result && me.result.username);
  if (!me || me.ok !== true || !me.result || me.result.is_bot !== true || !actualUsername) {
    return { healed: false, reason: `getMe rejected: ${(me && me.description) || "invalid bot identity"}` };
  }
  if (expectedUsername && expectedUsername.toLowerCase() !== actualUsername.toLowerCase()) {
    return { healed: false, reason: "configured bot username does not match token" };
  }

  let info;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    info = await res.json();
  } catch (e) {
    return { healed: false, reason: "getWebhookInfo failed", botUsername: actualUsername };
  }
  const current = (info && info.result) || {};
  const sameUrl = current.url === target;
  const sameUpdates = Array.isArray(current.allowed_updates)
    && ALLOWED_UPDATES.every((u) => current.allowed_updates.includes(u))
    && current.allowed_updates.length === ALLOWED_UPDATES.length;
  const authBroken = /unauthorized/i.test(String(current.last_error_message || ""));
  let healed = false;
  let reason = "already-registered";
  if (!sameUrl || !sameUpdates || authBroken) {
    const body = new URLSearchParams({
      url: target,
      secret_token: secret,
      allowed_updates: JSON.stringify(ALLOWED_UPDATES),
    }).toString();
    let set;
    try {
      const res = await fetchImpl(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      set = await res.json();
    } catch (e) {
      return { healed: false, reason: "setWebhook failed", botUsername: actualUsername };
    }
    if (!set || set.ok !== true) {
      return { healed: false, reason: `setWebhook rejected: ${(set && set.description) || "unknown"}`, botUsername: actualUsername };
    }
    healed = true;
    reason = sameUrl ? "re-registered (updates or auth drift)" : "registered";
  }

  const profile = await (deps.syncBotProfile || syncBotProfile)(token, fetchImpl);
  return {
    healed,
    reason,
    botUsername: actualUsername,
    profileSynced: profile.ok === true,
    profileChanged: profile.changed === true,
    profileReason: profile.reason,
  };
}

module.exports = { selfHealWebhook, syncBotProfile, sameCommands, ALLOWED_UPDATES };

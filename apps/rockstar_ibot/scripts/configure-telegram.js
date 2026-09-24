#!/usr/bin/env node
// Configure one installation-owned BotFather bot without putting its token in argv or stdout.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  normalizeBotUsername,
  publicBaseUrl,
  validWebhookSecret,
} = require("../lib/telegram-config.js");
const {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
} = require("../lib/doraemon-bot-profile.js");

const ALLOWED_UPDATES = Object.freeze(["message", "edited_message", "callback_query", "pre_checkout_query"]);

function envValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(content || "").match(new RegExp(`^${escaped}=(.*)$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function safeEnvValue(value, key) {
  const text = String(value == null ? "" : value);
  if (!text || /[\r\n\0]/.test(text)) throw new Error(`${key} is invalid`);
  return text;
}

function upsertEnvContent(content, values) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const remaining = new Map(Object.entries(values).map(([key, value]) => [key, safeEnvValue(value, key)]));
  const managedKeys = new Set(remaining.keys());
  const seen = new Set();
  const output = [];
  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    const key = match && match[1];
    if (!key || !managedKeys.has(key)) { output.push(line); continue; }
    if (seen.has(key)) continue;
    output.push(`${key}=${remaining.get(key)}`);
    seen.add(key);
    remaining.delete(key);
  }
  if (remaining.size > 0) {
    while (output.length > 0 && output[output.length - 1] === "") output.pop();
    output.push("", "# --- Installation-owned Telegram bot (generated locally; never commit this file) ---");
    for (const [key, value] of remaining) output.push(`${key}=${value}`);
  }
  return `${output.join("\n").replace(/\n+$/, "")}\n`;
}

async function telegramCall(token, method, body, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new Error(`${method} request failed`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok !== true) throw new Error(`${method} rejected: ${(payload && payload.description) || "unknown"}`);
  return payload.result;
}

async function inspectBot(token, fetchImpl) {
  const bot = await telegramCall(token, "getMe", {}, fetchImpl);
  const username = normalizeBotUsername(bot && bot.username);
  if (!bot || bot.is_bot !== true || !username) throw new Error("getMe returned an invalid bot identity");
  return { botId: String(bot.id), botUsername: username };
}

async function registerBot({ token, secret, publicUrl, replaceExistingWebhook = false, fetchImpl }) {
  const base = publicBaseUrl({ LM_PUBLIC_URL: publicUrl });
  if (!base) throw new Error("--public-url must be an HTTPS origin without a path, query, or fragment");
  if (!validWebhookSecret(secret)) throw new Error("webhook secret is invalid");
  const target = `${base}/telegram`;
  const current = await telegramCall(token, "getWebhookInfo", {}, fetchImpl);
  const currentUrl = String((current && current.url) || "");
  if (currentUrl && currentUrl !== target && !replaceExistingWebhook) {
    const error = new Error("bot already has a different webhook; rerun with --replace-existing-webhook after confirming takeover");
    error.code = "WEBHOOK_TAKEOVER_CONFIRMATION_REQUIRED";
    error.currentWebhookUrl = currentUrl;
    throw error;
  }
  await telegramCall(token, "setMyCommands", { commands: BOT_COMMANDS }, fetchImpl);
  await telegramCall(token, "setMyDescription", { description: BOT_DESCRIPTION }, fetchImpl);
  await telegramCall(token, "setMyShortDescription", { short_description: BOT_SHORT_DESCRIPTION }, fetchImpl);
  await telegramCall(token, "setWebhook", {
    url: target,
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
  }, fetchImpl);
  const readback = await telegramCall(token, "getWebhookInfo", {}, fetchImpl);
  const updates = Array.isArray(readback && readback.allowed_updates) ? readback.allowed_updates : [];
  if (String((readback && readback.url) || "") !== target ||
      ALLOWED_UPDATES.some((kind) => !updates.includes(kind))) {
    throw new Error("webhook readback did not match the requested configuration");
  }
  return {
    webhookUrl: target,
    pendingUpdateCount: Number.isFinite(Number(readback.pending_update_count)) ? Number(readback.pending_update_count) : null,
    lastError: Boolean(readback.last_error_date || readback.last_error_message),
  };
}

async function writePrivateEnvFile(filePath, content) {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(temporary, 0o600);
  await fs.rename(temporary, resolved);
  await fs.chmod(resolved, 0o600);
  return resolved;
}

async function readHiddenToken(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    let value = "";
    for await (const chunk of input) value += chunk.toString("utf8");
    const firstLine = value.split(/\r?\n/, 1)[0].trim();
    if (!firstLine) throw new Error("Telegram bot token was not provided on stdin");
    return firstLine;
  }
  output.write("Paste the BotFather token (input is hidden): ");
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") { finish(); reject(new Error("cancelled")); return; }
        if (character === "\r" || character === "\n") {
          finish();
          if (!value.trim()) reject(new Error("Telegram bot token is required"));
          else resolve(value.trim());
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    input.on("data", onData);
  });
}

function parseArgs(argv) {
  const options = { register: false, replaceExistingWebhook: false, reuseToken: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--register") options.register = true;
    else if (argument === "--replace-existing-webhook") options.replaceExistingWebhook = true;
    else if (argument === "--reuse-token") options.reuseToken = true;
    else if (argument === "--env-file" || argument === "--public-url") {
      if (!argv[index + 1]) throw new Error(`${argument} requires a value`);
      options[argument === "--env-file" ? "envFile" : "publicUrl"] = argv[++index];
    } else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`unknown option: ${argument}`);
  }
  if (options.replaceExistingWebhook && !options.register) throw new Error("--replace-existing-webhook requires --register");
  return options;
}

function helpText() {
  return [
    "Configure one user-owned Telegram bot for this Rockstar_ibot installation.",
    "",
    "Usage:",
    "  npm run telegram:configure -- --public-url https://your-rockstar-ibot.example --register",
    "",
    "Options:",
    "  --env-file PATH                 private env file (default: deploy/local/.env)",
    "  --public-url HTTPS_ORIGIN       public Rockstar_ibot origin",
    "  --register                      configure commands and webhook, then verify readback",
    "  --replace-existing-webhook      explicitly take over a bot already used elsewhere",
    "  --reuse-token                   use the token already stored in the private env file",
    "",
    "The token is never accepted as a command-line argument and is never printed.",
  ].join("\n");
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  if (options.help) { process.stdout.write(`${helpText()}\n`); return null; }
  const defaultEnv = path.resolve(__dirname, "../../../deploy/local/.env");
  const exampleEnv = path.resolve(__dirname, "../../../deploy/local/.env.example");
  const envFile = path.resolve(options.envFile || defaultEnv);
  let existing = "";
  try { existing = await fs.readFile(envFile, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    try { existing = await fs.readFile(exampleEnv, "utf8"); } catch { existing = ""; }
  }
  const token = options.reuseToken
    ? envValue(existing, "LM_TELEGRAM_BOT_TOKEN")
    : await readHiddenToken(dependencies.stdin || process.stdin, dependencies.stdout || process.stdout);
  if (!token) throw new Error("no stored LM_TELEGRAM_BOT_TOKEN is available to reuse");
  const identity = await inspectBot(token, dependencies.fetchImpl);
  const existingSecret = envValue(existing, "LM_TELEGRAM_WEBHOOK_SECRET");
  const webhookSecret = validWebhookSecret(existingSecret) ? existingSecret : crypto.randomBytes(32).toString("hex");
  const lateSecret = validWebhookSecret(envValue(existing, "LM_LATE_APPROVAL_CALLBACK_SECRET"))
    ? envValue(existing, "LM_LATE_APPROVAL_CALLBACK_SECRET")
    : crypto.randomBytes(32).toString("hex");
  const requestedPublicUrl = options.publicUrl || envValue(existing, "LM_PUBLIC_URL");
  const publicUrl = requestedPublicUrl ? publicBaseUrl({ LM_PUBLIC_URL: requestedPublicUrl }) : "";
  if (requestedPublicUrl && !publicUrl) throw new Error("--public-url must be an HTTPS origin without a path, query, or fragment");
  if (options.register && !publicUrl) throw new Error("--register requires --public-url or an existing LM_PUBLIC_URL");
  const values = {
    LM_TELEGRAM_MODE: "byob_single",
    LM_TELEGRAM_BOT_TOKEN: token,
    LM_TELEGRAM_BOT_USERNAME: identity.botUsername,
    LM_TELEGRAM_WEBHOOK_SECRET: webhookSecret,
    LM_LATE_APPROVAL_CALLBACK_SECRET: lateSecret,
    NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME: identity.botUsername,
    ...(publicUrl ? { LM_PUBLIC_URL: publicUrl, LM_PANEL_BASE_URL: publicUrl } : {}),
  };
  await writePrivateEnvFile(envFile, upsertEnvContent(existing, values));
  const registration = options.register
    ? await registerBot({
      token, secret: webhookSecret, publicUrl,
      replaceExistingWebhook: options.replaceExistingWebhook,
      fetchImpl: dependencies.fetchImpl,
    })
    : null;
  const receipt = {
    mode: "byob_single",
    botId: identity.botId,
    botUsername: identity.botUsername,
    envFile,
    tokenStored: true,
    webhookConfigured: Boolean(registration),
    ...(registration || {}),
  };
  (dependencies.stdout || process.stdout).write(`${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`telegram configuration failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_UPDATES,
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
  envValue,
  upsertEnvContent,
  telegramCall,
  inspectBot,
  registerBot,
  writePrivateEnvFile,
  parseArgs,
  helpText,
  main,
};

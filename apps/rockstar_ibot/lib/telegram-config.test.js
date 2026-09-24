"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TELEGRAM_SETUP_URL,
  normalizeBotUsername,
  telegramBotUrl,
  publicBaseUrl,
  validWebhookSecret,
  telegramPublicConfig,
} = require("./telegram-config.js");
const { onboardLink } = require("./telegram.js");

test("BYOB bot usernames and deep links are validated without a central fallback", () => {
  assert.equal(normalizeBotUsername("@KaiLifeBot"), "KaiLifeBot");
  assert.equal(normalizeBotUsername("OwnerManagerBot"), "OwnerManagerBot");
  for (const value of ["bot", "not-a-bot", "https://t.me/EvilBot", "name", "a".repeat(33) + "bot"]) {
    assert.equal(normalizeBotUsername(value), "", value);
  }
  assert.equal(telegramBotUrl("KaiLifeBot", "location"), "https://t.me/KaiLifeBot?start=location");
  assert.equal(telegramBotUrl("KaiLifeBot", "bad value"), "");
  assert.equal(telegramBotUrl("", "lp"), "");
});

test("public webhook base is explicit or Railway-owned and never the former central deployment", () => {
  assert.equal(publicBaseUrl({ LM_PUBLIC_URL: "https://life.example/" }), "https://life.example");
  assert.equal(publicBaseUrl({ RAILWAY_PUBLIC_DOMAIN: "custom-life.up.railway.app" }), "https://custom-life.up.railway.app");
  for (const env of [
    {},
    { LM_PUBLIC_URL: "http://localhost:8788" },
    { LM_PUBLIC_URL: "https://life.example/telegram" },
    { LM_PUBLIC_URL: " https://life.example" },
    { LM_PUBLIC_URL: "https://user:pass@life.example" },
  ]) assert.equal(publicBaseUrl(env), "");
});

test("webhook secret is strong enough and restricted to Telegram-supported characters", () => {
  assert.equal(validWebhookSecret("s".repeat(32)), true);
  assert.equal(validWebhookSecret("a_b-C9".repeat(6)), true);
  assert.equal(validWebhookSecret("short"), false);
  assert.equal(validWebhookSecret("s".repeat(31) + "+"), false);
  assert.equal(validWebhookSecret("s".repeat(257)), false);
});

test("legacy onboarding links require the installation's explicit HTTPS origin", () => {
  assert.equal(onboardLink("42", "https://kai-life.example"), "https://kai-life.example/lm?tg=42");
  assert.throws(() => onboardLink("42", ""), /public base URL is unavailable/);
  assert.throws(() => onboardLink("42", "http://localhost:8788"), /public base URL is unavailable/);
});

test("public config exposes only non-secret BYOB identity", () => {
  const config = telegramPublicConfig({
    LM_TELEGRAM_BOT_USERNAME: "@KaiLifeBot",
    LM_TELEGRAM_BOT_TOKEN: "must-not-escape",
    LM_TELEGRAM_WEBHOOK_SECRET: "must-not-escape-either",
  });
  assert.deepEqual(config, {
    mode: "byob_single",
    configured: true,
    botUsername: "KaiLifeBot",
    launchUrl: "https://t.me/KaiLifeBot?start=lp",
    setupUrl: TELEGRAM_SETUP_URL,
  });
  assert.doesNotMatch(JSON.stringify(config), /must-not-escape/);
  assert.deepEqual(telegramPublicConfig({}), {
    mode: "byob_single", configured: false, botUsername: null, launchUrl: null,
    setupUrl: TELEGRAM_SETUP_URL,
  });
  assert.deepEqual(telegramPublicConfig({ LM_TELEGRAM_MODE: "shared_registry", LM_TELEGRAM_BOT_USERNAME: "KaiLifeBot" }), {
    mode: "shared_registry", configured: false, botUsername: "KaiLifeBot", launchUrl: null,
    setupUrl: TELEGRAM_SETUP_URL,
  });
});

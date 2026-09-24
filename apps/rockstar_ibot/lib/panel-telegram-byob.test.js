"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderPanelPage } = require("./panel-ui.js");

test("panel Telegram instructions use only the installation-owned bot", () => {
  const html = renderPanelPage({ csrf: "fixture", botUsername: "KaiLifeBot" });
  for (const path of ["location", "payout", "call"]) {
    assert.match(html, new RegExp(`https://t\\.me/KaiLifeBot\\?start=${path}`));
  }
  assert.doesNotMatch(html, /LifeManagerBotbot/);
});

test("panel fails closed when no custom bot username is configured", () => {
  const html = renderPanelPage({ csrf: "fixture" });
  assert.doesNotMatch(html, /https:\/\/t\.me\//);
  assert.match(html, /installation-owned Telegram bot is not configured yet/);
});

test("server exposes only a boot-verified bot and has no owner-specific CORS fallback", () => {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const scheduler = fs.readFileSync(path.join(__dirname, "../scheduler.js"), "utf8");
  const gmail = fs.readFileSync(path.join(__dirname, "gmail-onboard.js"), "utf8");
  assert.match(source, /let VERIFIED_TG_USERNAME = ""/);
  assert.match(source, /botUsername: VERIFIED_TG_USERNAME/);
  assert.match(source, /r\.healed \|\| r\.reason === "already-registered"/);
  assert.doesNotMatch(source, /botUsername:\s*process\.env\.LM_TELEGRAM_BOT_USERNAME/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin",\s*"https:\/\/aniccaai\.com/);
  assert.match(scheduler, /const base = publicBaseUrl\(process\.env\)/);
  assert.doesNotMatch(scheduler, /PUBLIC_BASE \|\| "https:\/\/aniccaai\.com"/);
  assert.doesNotMatch(gmail, /value \|\| "https:\/\/aniccaai\.com"/);
});

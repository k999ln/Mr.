// INC-3: the prod webhook was found empty (inbound dead while outbound looked healthy), and the
// re-registration then failed on a truncated secret (INC-1's class). The permanent fix registers
// the webhook from the runtime itself at boot: the secret Telegram echoes and the secret the
// server compares are the same process.env value by construction — neither can drift.
// Run: node --test lib/webhook-selfheal.test.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { selfHealWebhook, syncBotProfile } = require("./webhook-selfheal.js");
const { BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } = require("./doraemon-bot-profile.js");

const ENV = {
  LM_TELEGRAM_BOT_TOKEN: "42:token",
  LM_TELEGRAM_BOT_USERNAME: "KaiLifeBot",
  LM_TELEGRAM_WEBHOOK_SECRET: "s".repeat(64),
  LM_PUBLIC_URL: "https://kai-life.example",
};

const ME = { ok: true, result: { id: 42, is_bot: true, username: "KaiLifeBot" } };

function fakeFetch(replies) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const reply = replies.shift() || { ok: true, result: {} };
      return { ok: true, json: async () => reply };
    },
  };
}

test("registers url + full runtime secret + U4 allowed_updates when webhook is absent", async () => {
  const f = fakeFetch([
    ME,
    { ok: true, result: { url: "" } },                    // getWebhookInfo: empty
    { ok: true, result: true, description: "Webhook was set" }, // setWebhook
  ]);
  const out = await selfHealWebhook(ENV, { fetchImpl: f.fetch });
  assert.equal(out.healed, true);
  const set = f.calls.find((c) => c.url.includes("/setWebhook"));
  assert.ok(set, "setWebhook was called");
  const body = String(set.init.body);
  assert.ok(body.includes(encodeURIComponent("https://kai-life.example/telegram")), "webhook path is /telegram");
  assert.ok(body.includes("s".repeat(64)), "the FULL runtime secret is sent, never a truncation");
  for (const kind of ["message", "edited_message", "callback_query", "pre_checkout_query"]) {
    assert.ok(body.includes(kind), `allowed_updates carries ${kind} (U4)`);
  }
});

test("does nothing when the registration already matches", async () => {
  const f = fakeFetch([
    ME,
    { ok: true, result: { url: "https://kai-life.example/telegram", allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query"] } },
  ]);
  const out = await selfHealWebhook(ENV, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.equal(out.reason, "already-registered");
  assert.ok(!f.calls.some((c) => c.url.includes("/setWebhook")), "no redundant setWebhook");
});

test("re-registers when the url points somewhere else", async () => {
  const f = fakeFetch([
    ME,
    { ok: true, result: { url: "https://old-host.example/telegram" } },
    { ok: true, result: true },
  ]);
  const out = await selfHealWebhook(ENV, { fetchImpl: f.fetch });
  assert.equal(out.healed, true);
});

test("fails closed loudly when token or secret is missing — never registers a blank secret", async () => {
  const f = fakeFetch([]);
  const out = await selfHealWebhook({ ...ENV, LM_TELEGRAM_WEBHOOK_SECRET: "" }, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /secret/i);
  assert.equal(f.calls.length, 0, "no Telegram call without a secret");
});

test("an unimplemented shared registry mode never touches Telegram", async () => {
  const f = fakeFetch([]);
  const out = await selfHealWebhook({ ...ENV, LM_TELEGRAM_MODE: "shared_registry" }, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /unsupported/i);
  assert.equal(f.calls.length, 0);
});

test("an invalid configured username fails closed before sending the token", async () => {
  const f = fakeFetch([]);
  const out = await selfHealWebhook({ ...ENV, LM_TELEGRAM_BOT_USERNAME: "https://t.me/EvilBot" }, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /username is invalid/);
  assert.equal(f.calls.length, 0);
});

test("fails closed before Telegram when no deployment-owned public URL exists", async () => {
  const f = fakeFetch([]);
  const out = await selfHealWebhook({
    LM_TELEGRAM_BOT_TOKEN: ENV.LM_TELEGRAM_BOT_TOKEN,
    LM_TELEGRAM_WEBHOOK_SECRET: ENV.LM_TELEGRAM_WEBHOOK_SECRET,
  }, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /LM_PUBLIC_URL|RAILWAY_PUBLIC_DOMAIN/);
  assert.equal(f.calls.length, 0);
});

test("refuses a token belonging to a different BotFather bot", async () => {
  const f = fakeFetch([{ ok: true, result: { id: 7, is_bot: true, username: "SomeoneElseBot" } }]);
  const out = await selfHealWebhook(ENV, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /does not match token/);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].url.includes("/getMe"));
});

test("a Telegram error is reported, not swallowed as success", async () => {
  const f = fakeFetch([
    { ok: false, description: "Unauthorized" },
  ]);
  const out = await selfHealWebhook(ENV, { fetchImpl: f.fetch });
  assert.equal(out.healed, false);
  assert.match(out.reason, /Unauthorized/);
});

test("repairs the public command menu and BotFather descriptions, then verifies readback", async () => {
  const f = fakeFetch([
    { ok: true, result: [] },
    { ok: true, result: { description: "old" } },
    { ok: true, result: { short_description: "old" } },
    { ok: true, result: true },
    { ok: true, result: true },
    { ok: true, result: true },
    { ok: true, result: BOT_COMMANDS },
    { ok: true, result: { description: BOT_DESCRIPTION } },
    { ok: true, result: { short_description: BOT_SHORT_DESCRIPTION } },
  ]);
  const result = await syncBotProfile("42:token", f.fetch);
  assert.deepEqual(result, { ok: true, changed: true, reason: "updated" });
  const commands = f.calls.find((call) => call.url.endsWith("/setMyCommands"));
  assert.deepEqual(JSON.parse(commands.init.body).commands, BOT_COMMANDS);
  assert.ok(f.calls.some((call) => call.url.endsWith("/setMyDescription")));
  assert.ok(f.calls.some((call) => call.url.endsWith("/setMyShortDescription")));
});

test("does not rewrite a BotFather profile that already matches", async () => {
  const f = fakeFetch([
    { ok: true, result: BOT_COMMANDS },
    { ok: true, result: { description: BOT_DESCRIPTION } },
    { ok: true, result: { short_description: BOT_SHORT_DESCRIPTION } },
  ]);
  assert.deepEqual(await syncBotProfile("42:token", f.fetch), {
    ok: true, changed: false, reason: "already-current",
  });
  assert.ok(!f.calls.some((call) => /\/setMy/.test(call.url)));
});

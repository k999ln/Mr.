"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
  envValue,
  upsertEnvContent,
  inspectBot,
  registerBot,
  parseArgs,
  main,
} = require("./configure-telegram.js");

function fakeTelegram(replies) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      const payload = replies.shift();
      return { json: async () => payload };
    },
  };
}

test("private env writer updates one value per key without disturbing unrelated settings", () => {
  const source = "A=1\nLM_TELEGRAM_BOT_TOKEN=old\nA_COMMENT=value\nLM_TELEGRAM_BOT_TOKEN=duplicate\n";
  const output = upsertEnvContent(source, {
    LM_TELEGRAM_BOT_TOKEN: "42:new-token",
    LM_TELEGRAM_BOT_USERNAME: "KaiLifeBot",
  });
  assert.equal((output.match(/^LM_TELEGRAM_BOT_TOKEN=/gm) || []).length, 1);
  assert.equal(envValue(output, "LM_TELEGRAM_BOT_TOKEN"), "42:new-token");
  assert.equal(envValue(output, "LM_TELEGRAM_BOT_USERNAME"), "KaiLifeBot");
  assert.match(output, /^A=1$/m);
  assert.match(output, /^A_COMMENT=value$/m);
});

test("getMe binds the secret token to a valid public bot identity", async () => {
  const telegram = fakeTelegram([{ ok: true, result: { id: 42, is_bot: true, username: "KaiLifeBot" } }]);
  assert.deepEqual(await inspectBot("secret-token", telegram.fetch), { botId: "42", botUsername: "KaiLifeBot" });
  assert.equal(telegram.calls.length, 1);
  assert.match(telegram.calls[0].url, /\/getMe$/);
});

test("existing foreign webhook requires an explicit takeover flag", async () => {
  const telegram = fakeTelegram([{ ok: true, result: { url: "https://other.example/telegram" } }]);
  await assert.rejects(() => registerBot({
    token: "secret-token", secret: "s".repeat(64), publicUrl: "https://mine.example", fetchImpl: telegram.fetch,
  }), (error) => error.code === "WEBHOOK_TAKEOVER_CONFIRMATION_REQUIRED");
  assert.equal(telegram.calls.length, 1);
  assert.match(telegram.calls[0].url, /\/getWebhookInfo$/);
});

test("explicit registration installs only implemented commands and verifies exact webhook readback", async () => {
  const telegram = fakeTelegram([
    { ok: true, result: { url: "" } },
    { ok: true, result: true },
    { ok: true, result: true },
    { ok: true, result: true },
    { ok: true, result: true },
    { ok: true, result: { url: "https://mine.example/telegram", allowed_updates: ["message", "edited_message", "callback_query", "pre_checkout_query"], pending_update_count: 0 } },
  ]);
  const result = await registerBot({
    token: "secret-token", secret: "s".repeat(64), publicUrl: "https://mine.example", fetchImpl: telegram.fetch,
  });
  assert.deepEqual(result, { webhookUrl: "https://mine.example/telegram", pendingUpdateCount: 0, lastError: false });
  const commands = telegram.calls.find((call) => call.url.endsWith("/setMyCommands"));
  assert.deepEqual(commands.body.commands, BOT_COMMANDS);
  assert.deepEqual(BOT_COMMANDS.map((entry) => entry.command), ["start", "home", "tools", "jobs", "today", "help"]);
  assert.ok(BOT_COMMANDS.every((entry) => /[ぁ-んァ-ン一-龠]/.test(entry.description)));
  const description = telegram.calls.find((call) => call.url.endsWith("/setMyDescription"));
  assert.equal(description.body.description, BOT_DESCRIPTION);
  const shortDescription = telegram.calls.find((call) => call.url.endsWith("/setMyShortDescription"));
  assert.equal(shortDescription.body.short_description, BOT_SHORT_DESCRIPTION);
  const webhook = telegram.calls.find((call) => call.url.endsWith("/setWebhook"));
  assert.equal(webhook.body.url, "https://mine.example/telegram");
  assert.equal(webhook.body.secret_token, "s".repeat(64));
});

test("token is deliberately not accepted as a command-line argument", () => {
  assert.throws(() => parseArgs(["--token", "secret"]), /unknown option/);
  assert.deepEqual(parseArgs(["--public-url", "https://mine.example", "--register"]), {
    register: true, replaceExistingWebhook: false, reuseToken: false, publicUrl: "https://mine.example",
  });
});

test("full configuration stores secrets in a 0600 file and prints only a safe receipt", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lm-telegram-config-"));
  const envFile = path.join(directory, "private.env");
  let output = "";
  const telegram = fakeTelegram([
    { ok: true, result: { id: 42, is_bot: true, username: "KaiLifeBot" } },
  ]);
  try {
    const receipt = await main(["--env-file", envFile], {
      stdin: Readable.from(["42:private-token\n"]),
      stdout: { write: (chunk) => { output += String(chunk); } },
      fetchImpl: telegram.fetch,
    });
    const content = await fs.readFile(envFile, "utf8");
    const mode = (await fs.stat(envFile)).mode & 0o777;
    const webhookSecret = envValue(content, "LM_TELEGRAM_WEBHOOK_SECRET");
    const callbackSecret = envValue(content, "LM_LATE_APPROVAL_CALLBACK_SECRET");

    assert.equal(mode, 0o600);
    assert.equal(envValue(content, "LM_TELEGRAM_BOT_TOKEN"), "42:private-token");
    assert.equal(envValue(content, "LM_TELEGRAM_BOT_USERNAME"), "KaiLifeBot");
    assert.notEqual(webhookSecret, callbackSecret);
    assert.equal(webhookSecret.length, 64);
    assert.equal(callbackSecret.length, 64);
    assert.equal(receipt.botUsername, "KaiLifeBot");
    assert.doesNotMatch(output, /42:private-token/);
    assert.equal(output.includes(webhookSecret), false);
    assert.equal(output.includes(callbackSecret), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

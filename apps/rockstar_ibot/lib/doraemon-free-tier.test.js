"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeInput,
  createSupabaseFreeTierWriter,
} = require("./doraemon-free-tier.js");

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("free tier requires a private Telegram self-chat and no email or card", () => {
  assert.deepEqual(normalizeInput({
    chatType: "private", chatId: "123456", userId: "123456", profileName: " Kai ",
  }), {
    chatId: "123456", userId: "123456", profileName: "Kai", termsVersion: "2026-09-02-free-v1",
  });
  assert.throws(
    () => normalizeInput({ chatType: "group", chatId: "-1", userId: "123456" }),
    (error) => error.code === "free_tier_private_chat_required",
  );
});

test("free tier writer records versioned consent and returns tenant identity", async () => {
  const calls = [];
  const writer = createSupabaseFreeTierWriter({
    supaUrl: "https://db.example/",
    supaKey: "service-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: "started", uid: "lm_tg_abc", paid: false });
    },
  });
  assert.deepEqual(await writer({
    chatType: "private", chatId: "123456", userId: "123456", profileName: "Kai",
  }), { uid: "lm_tg_abc", paid: false, duplicate: false });
  assert.match(calls[0].url, /lm_start_doraemon_free_tier$/);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.p_user_id, "123456");
  assert.equal(payload.p_terms_version, "2026-09-02-free-v1");
  assert.equal(Object.hasOwn(payload, "email"), false);
  assert.equal(Object.hasOwn(payload, "card"), false);
});

test("free tier storage failures are fail-closed", async () => {
  const writer = createSupabaseFreeTierWriter({
    supaUrl: "https://db.example",
    supaKey: "service-secret",
    fetchImpl: async () => response({ message: "provider detail" }, 503),
  });
  await assert.rejects(
    () => writer({ chatType: "private", chatId: "123456", userId: "123456" }),
    (error) => error.code === "free_tier_write_failed",
  );
});

test("migration records versioned consent and creates only a free tenant", () => {
  const migration = fs.readFileSync(path.join(
    __dirname, "../migrations/2026-09-02-lm-doraemon-free-tier.sql",
  ), "utf8");
  assert.match(migration, /lm_doraemon_tier_consents/);
  assert.match(migration, /PRIMARY KEY \(telegram_user_id, terms_version\)/);
  assert.match(migration, /'done', false, 'free'/);
  assert.doesNotMatch(migration, /email|card|stripe_customer_id/i);
});

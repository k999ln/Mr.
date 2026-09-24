"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FEATURE_KEYS,
  MAX_FEATURE_SELECTIONS,
  parseFeatureStartPayload,
  featureSelectionMessage,
} = require("./doraemon-feature-selection.js");
const { createDoraemonFeatureStore } = require("./doraemon-feature-store.js");
const { parseUpdate } = require("./telegram.js");

test("feature payload decodes one to three website selections without allowing unknown bits", () => {
  assert.equal(MAX_FEATURE_SELECTIONS, 3);
  assert.deepEqual(parseFeatureStartPayload("f2_1").keys, FEATURE_KEYS.slice(0, 1));
  assert.deepEqual(parseFeatureStartPayload("f2_7").keys, FEATURE_KEYS.slice(0, 3));
  assert.equal(parseFeatureStartPayload("f2_f"), null);
  assert.equal(parseFeatureStartPayload("f2_sf"), null);
  assert.equal(parseFeatureStartPayload("f2_0"), null);
  assert.equal(parseFeatureStartPayload("free"), null);
  assert.equal(parseFeatureStartPayload("f2_1000"), null);
});

test("feature handoff confirms selection and never claims an automatic charge", () => {
  const text = featureSelectionMessage(["course", "pay", "measure"]);
  assert.match(text, /ようこそ、avocadominiへ/);
  assert.match(text, /サイトで選んだ3つをTelegramに反映しました/);
  assert.match(text, /教材を作る/);
  assert.match(text, /入金を確認/);
  assert.match(text, /自動決済は行いません/);
});

test("Telegram message parsing preserves private chat type for the free-tier handoff", () => {
  const parsed = parseUpdate({
    message: {
      chat: { id: 123456, type: "private" },
      from: { id: 123456 },
      text: "/start f2_7",
    },
  });
  assert.equal(parsed.chatType, "private");
  assert.equal(parsed.chatId, "123456");
  assert.equal(parsed.userId, "123456");
});

test("Telegram message parsing preserves the ForceReply parent without changing command parsing", () => {
  const parsed = parseUpdate({
    update_id: 10,
    message: {
      message_id: 20,
      chat: { id: 123456, type: "private" },
      from: { id: 123456 },
      text: "返信案を作って",
      reply_to_message: { message_id: 19, text: "【avocadomini依頼:nurture】" },
    },
  });
  assert.equal(parsed.replyToMessageId, "19");
  assert.equal(parsed.replyToMessageText, "【avocadomini依頼:nurture】");
  assert.equal(parsed.isStart, false);
});

test("feature storage enforces the same one-to-three-tool contract as the payload parser", async () => {
  const store = createDoraemonFeatureStore({
    supaUrl: "https://db.example",
    supaKey: "service-secret",
    fetchImpl: async (_url, init) => ({
      ok: true,
      json: async () => ({ selected_count: JSON.parse(init.body).p_feature_keys.length }),
    }),
  });
  for (const featureKeys of [[], ["request", "course", "check", "store"]]) {
    await assert.rejects(
      () => store.replace({ uid: "lm_tg_fixture", featureKeys, termsVersion: "2026-09-03-feature-v2" }),
      /feature_selection_invalid/,
    );
  }

  const selected = await store.replace({
    uid: "lm_tg_fixture",
    featureKeys: ["request"],
    termsVersion: "2026-09-03-feature-v2",
  });
  assert.equal(selected.selectedCount, 1);
});

test("feature storage reads and normalizes the database selection", async () => {
  const store = createDoraemonFeatureStore({
    supaUrl: "https://db.example",
    supaKey: "service-secret",
    fetchImpl: async (url, init) => {
      assert.match(String(url), /lm_doraemon_feature_selections/);
      assert.equal(init.headers.Authorization, "Bearer service-secret");
      return { ok: true, json: async () => [
        { feature_key: "nurture", selected_at: "2026-09-05T00:00:00Z" },
        { feature_key: "course", selected_at: "2026-09-05T00:00:01Z" },
      ] };
    },
  });
  assert.deepEqual(await store.get("lm_tg_fixture"), ["course", "nurture"]);
});

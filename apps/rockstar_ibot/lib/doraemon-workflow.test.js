"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FEATURE_KEYS, FEATURE_NAMES } = require("./doraemon-feature-selection.js");
const {
  FEATURE_INSTRUCTIONS,
  intakePromptMessage,
  parseDoraemonReply,
  buildDoraemonPrompt,
  buildDoraemonCommandPrompt,
  commandRevisionPromptMessage,
  todayMessage,
  resultKeyboard,
  handleDoraemonFeatureMessage,
  handleDoraemonCommandMessage,
} = require("./doraemon-workflow.js");

const JOB_ID = "00000000-0000-4000-8000-000000000001";

test("all ten tools have a bounded draft workflow and a parseable ForceReply marker", () => {
  assert.deepEqual(Object.keys(FEATURE_INSTRUCTIONS), FEATURE_KEYS);
  for (const key of FEATURE_KEYS) {
    const prompt = intakePromptMessage(key);
    assert.deepEqual(parseDoraemonReply(prompt), { featureKey: key, parentJobId: null });
    const built = buildDoraemonPrompt(key, "これを手伝って");
    assert.match(built, new RegExp(FEATURE_NAMES[key]));
    assert.match(built, /外部への公開・送信・決済/);
    assert.match(built, /実行状態は/);
    assert.match(built, /入力の目安/);
    assert.match(built, /返す成果物/);
    assert.match(built, /利用者からの依頼/);
  }
});

test("revision marker keeps the immutable parent job", () => {
  const prompt = intakePromptMessage("nurture", JOB_ID);
  assert.deepEqual(parseDoraemonReply(prompt), { featureKey: "nurture", parentJobId: JOB_ID });
  assert.equal(parseDoraemonReply("普通のBotメッセージ"), null);
});

test("command room combines only selected tools and can revise an immutable parent", () => {
  const built = buildDoraemonCommandPrompt(["course", "nurture"], "講座を作って案内したい");
  assert.match(built, /教材を作る/);
  assert.match(built, /見込み客を育てる/);
  assert.match(built, /選択外の道具を勝手に使わない/);
  assert.deepEqual(parseDoraemonReply(commandRevisionPromptMessage(JOB_ID)), {
    command: true, featureKey: null, parentJobId: JOB_ID,
  });
  assert.throws(() => buildDoraemonCommandPrompt([], "依頼"), /selection_invalid/);
});

test("today view distinguishes queue, delivery, acceptance, and failure", () => {
  const text = todayMessage([
    { id: JOB_ID, feature_key: "course", request_text: "教材を作って", status: "queued" },
    { id: JOB_ID, feature_key: "nurture", request_text: "返信を作って", status: "completed", telegram_result_message_id: 7 },
    { id: JOB_ID, feature_key: "split", request_text: "分けて", status: "completed", telegram_result_message_id: 8, accepted_at: "2026-09-05T00:00:00Z" },
    { id: JOB_ID, feature_key: "check", request_text: "確認して", status: "failed" },
  ]);
  for (const label of ["受付済み", "結果お届け済み", "完了にしました", "安全停止・確認待ち"]) assert.match(text, new RegExp(label));
});

test("result actions fit Telegram callback limits", () => {
  const keyboard = resultKeyboard({ id: JOB_ID, feature_key: "nurture", status: "completed" });
  for (const row of keyboard.inline_keyboard) {
    for (const button of row) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  }
});

function baseInput(overrides = {}) {
  return {
    text: "無料相談後の返信を3案作って",
    replyToMessageText: intakePromptMessage("nurture"),
    chatId: "100",
    chatType: "private",
    userId: "100",
    messageId: "9",
    updateId: "10",
    userRow: { uid: "lm_tg_100" },
    ...overrides,
  };
}

function baseDependencies(overrides = {}) {
  const sent = [];
  const enqueued = [];
  return {
    sent,
    enqueued,
    dependencies: {
      enabled: true,
      telegramToken: "fixture-token",
      featureStore: { get: async () => ["nurture"] },
      store: {
        read: async () => null,
        countRecentByChat: async () => 0,
        enqueue: async (job) => {
          enqueued.push(job);
          return { created: true, job: { id: JOB_ID } };
        },
      },
      sendMessage: async (_token, _chat, text) => {
        sent.push(text);
        return { ok: true, result: { message_id: 11 } };
      },
      ...overrides,
    },
  };
}

test("natural-language room reply creates one tenant-scoped, read-only job", async () => {
  const fixture = baseDependencies();
  const result = await handleDoraemonFeatureMessage(baseInput(), fixture.dependencies);
  assert.equal(result.accepted, true);
  assert.equal(result.featureKey, "nurture");
  assert.equal(fixture.enqueued.length, 1);
  assert.equal(fixture.enqueued[0].uid, "lm_tg_100");
  assert.equal(fixture.enqueued[0].mode, "read-only");
  assert.equal(fixture.enqueued[0].jobKind, "doraemon_feature");
  assert.equal(fixture.enqueued[0].requestText, "無料相談後の返信を3案作って");
  assert.match(fixture.sent[0], /受付しました/);
});

test("ordinary command-room text creates an isolated orchestrator job", async () => {
  const fixture = baseDependencies({ featureStore: { get: async () => ["course", "nurture"] } });
  const result = await handleDoraemonCommandMessage(baseInput({ replyToMessageText: "" }), fixture.dependencies);
  assert.equal(result.accepted, true);
  assert.equal(result.command, true);
  assert.equal(fixture.enqueued[0].jobKind, "doraemon_command");
  assert.equal(fixture.enqueued[0].featureKey, null);
  assert.equal(fixture.enqueued[0].mode, "read-only");
  assert.match(fixture.enqueued[0].prompt, /総合司令室/);
  assert.match(fixture.sent[0], /総合司令室が受付/);
});

test("a replayed Telegram message is acknowledged without another enqueue or rate count", async () => {
  let counted = 0;
  const fixture = baseDependencies({
    store: {
      read: async () => null,
      readByTelegramMessage: async () => ({ id: JOB_ID, status: "queued" }),
      countRecentByChat: async () => { counted += 1; return 0; },
      enqueue: async () => { throw new Error("must not enqueue"); },
    },
  });
  const result = await handleDoraemonFeatureMessage(baseInput(), fixture.dependencies);
  assert.equal(result.created, false);
  assert.equal(result.jobId, JOB_ID);
  assert.equal(counted, 0);
  assert.match(fixture.sent[0], /すでに受付済み/);
});

test("unselected tools, cross-chat use, and disabled execution fail closed", async () => {
  const unselected = baseDependencies({ featureStore: { get: async () => ["course"] } });
  assert.equal((await handleDoraemonFeatureMessage(baseInput(), unselected.dependencies)).reason, "feature_not_selected");
  assert.equal(unselected.enqueued.length, 0);

  const crossed = baseDependencies();
  assert.equal((await handleDoraemonFeatureMessage(baseInput({ userId: "101" }), crossed.dependencies)).reason, "private_chat_required");
  assert.equal(crossed.enqueued.length, 0);

  const disabled = baseDependencies({ enabled: false });
  assert.equal((await handleDoraemonFeatureMessage(baseInput(), disabled.dependencies)).reason, "bridge_disabled");
  assert.equal(disabled.enqueued.length, 0);
});

test("revision can only use a delivered or failed parent from the same tenant", async () => {
  const revisionInput = baseInput({
    text: "もっと短くして",
    replyToMessageText: intakePromptMessage("nurture", JOB_ID),
  });
  const valid = baseDependencies({
    store: {
      read: async () => ({ id: JOB_ID, uid: "lm_tg_100", telegram_chat_id: "100", job_kind: "doraemon_feature", feature_key: "nurture", status: "completed", result: "前の文章" }),
      countRecentByChat: async () => 0,
      enqueue: async (job) => ({ created: true, job: { id: JOB_ID, parent_job_id: job.parentJobId } }),
    },
  });
  const accepted = await handleDoraemonFeatureMessage(revisionInput, valid.dependencies);
  assert.equal(accepted.accepted, true);

  const wrongTenant = baseDependencies({
    store: {
      read: async () => ({ id: JOB_ID, uid: "someone-else", telegram_chat_id: "999", job_kind: "doraemon_feature", feature_key: "nurture", status: "completed" }),
      countRecentByChat: async () => 0,
      enqueue: async () => { throw new Error("must not enqueue"); },
    },
  });
  assert.equal((await handleDoraemonFeatureMessage(revisionInput, wrongTenant.dependencies)).reason, "revision_parent_invalid");
});

test("per-chat rate limit rejects the eleventh job in one hour", async () => {
  const fixture = baseDependencies({
    store: {
      read: async () => null,
      countRecentByChat: async () => 10,
      enqueue: async () => { throw new Error("must not enqueue"); },
    },
  });
  assert.equal((await handleDoraemonFeatureMessage(baseInput(), fixture.dependencies)).reason, "rate_limited");

  const raced = baseDependencies({
    store: {
      read: async () => null,
      countRecentByChat: async () => 9,
      enqueue: async () => ({ created: false, rateLimited: true, job: null }),
    },
  });
  assert.equal((await handleDoraemonFeatureMessage(baseInput(), raced.dependencies)).reason, "rate_limited");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCodexJob, createSupabaseCodexJobStore } = require("./codex-job-store.js");

test("Codex job is bounded, tenant-aware, and defaults to queued read-only", () => {
  const job = buildCodexJob({ chatId: "100", userId: "100", messageId: "4", updateId: "5", prompt: "調べて" });
  assert.equal(job.status, "queued");
  assert.equal(job.mode, "read-only");
  assert.equal(job.uid, null);
  assert.equal(job.prompt, "調べて");
  assert.throws(() => buildCodexJob({ chatId: "100", userId: "100", messageId: "4", updateId: "5", prompt: "x", mode: "danger" }), /mode invalid/);
  assert.throws(() => buildCodexJob({ chatId: "100", userId: "100", messageId: "4", updateId: "5", prompt: "" }), /prompt invalid/);
});

test("Doraemon feature jobs are tenant-bound and can never request workspace write", () => {
  const job = buildCodexJob({
    uid: "lm_tg_100", chatId: "100", userId: "100", messageId: "4", updateId: "5",
    prompt: "下書きを作る", mode: "read-only", jobKind: "doraemon_feature",
    featureKey: "nurture", requestText: "返信を作って",
  });
  assert.equal(job.job_kind, "doraemon_feature");
  assert.equal(job.feature_key, "nurture");
  assert.equal(job.request_text, "返信を作って");
  assert.throws(() => buildCodexJob({
    uid: "lm_tg_100", chatId: "100", userId: "100", messageId: "4", updateId: "5",
    prompt: "危険", mode: "workspace-write", jobKind: "doraemon_feature",
    featureKey: "nurture", requestText: "返信を作って",
  }), /feature job invalid/);
});

test("Doraemon command-room jobs are tenant-bound, tool-neutral, and read-only", () => {
  const job = buildCodexJob({
    uid: "lm_tg_100", chatId: "100", userId: "100", messageId: "6", updateId: "7",
    prompt: "選択中の道具をまとめる", mode: "read-only", jobKind: "doraemon_command",
    requestText: "講座を作って案内したい",
  });
  assert.equal(job.job_kind, "doraemon_command");
  assert.equal(job.feature_key, null);
  assert.throws(() => buildCodexJob({
    uid: "lm_tg_100", chatId: "100", userId: "100", messageId: "6", updateId: "7",
    prompt: "危険", mode: "workspace-write", jobKind: "doraemon_command", requestText: "依頼",
  }), /command job invalid/);
});

test("Supabase store uses idempotent enqueue and narrow RPCs", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes("enqueue_lm_doraemon_job")) return new Response(JSON.stringify({
      outcome: "created",
      job: { id: "00000000-0000-4000-8000-000000000002", job_kind: "doraemon_command" },
    }), { status: 200 });
    if (url.includes("lm_codex_jobs?on_conflict")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001" }]), { status: 201 });
    if (url.includes("created_at=gte")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001" }]), { status: 200 });
    if (url.includes("order=created_at.desc")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", feature_key: "nurture" }]), { status: 200 });
    if (url.includes("telegram_chat_id=eq")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", status: "queued" }]), { status: 200 });
    if (url.includes("claim_lm_codex_job")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", prompt: "調べて", mode: "read-only" }]), { status: 200 });
    if (url.includes("finish_lm_codex_job")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", status: "completed" }]), { status: 200 });
    if (url.includes("mark_lm_codex_job_telegram_sent")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", telegram_result_message_id: 8 }]), { status: 200 });
    if (url.includes("accept_lm_doraemon_job")) return new Response(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000001", accepted_at: "2026-09-05T00:00:00Z" }]), { status: 200 });
    throw new Error(`unexpected URL ${url}`);
  };
  const store = createSupabaseCodexJobStore({ supaUrl: "https://supa.example", supaKey: "service-secret", fetchImpl });
  assert.equal((await store.enqueue({ chatId: "100", userId: "100", messageId: "4", updateId: "5", prompt: "調べて" })).created, true);
  assert.equal((await store.claim()).mode, "read-only");
  assert.equal((await store.finish("00000000-0000-4000-8000-000000000001", { status: "completed", result: "完了", exitCode: 0 })).status, "completed");
  assert.equal((await store.markTelegramSent("00000000-0000-4000-8000-000000000001", 8)).telegram_result_message_id, 8);
  assert.equal((await store.listRecentByChat("100"))[0].feature_key, "nurture");
  assert.equal(await store.countRecentByChat("100", "2026-09-05T00:00:00Z"), 1);
  assert.ok((await store.accept("00000000-0000-4000-8000-000000000001", "100")).accepted_at);
  const command = await store.enqueue({
    uid: "lm_tg_100", chatId: "100", userId: "100", messageId: "9", updateId: "10",
    prompt: "まとめる", mode: "read-only", jobKind: "doraemon_command", requestText: "手伝って",
  });
  assert.equal(command.created, true);
  assert.equal(command.job.job_kind, "doraemon_command");
  const rpc = calls.find((call) => call.url.includes("enqueue_lm_doraemon_job"));
  assert.equal(JSON.parse(rpc.init.body).p_job_kind, "doraemon_command");
  assert.match(calls[0].url, /on_conflict=telegram_chat_id%2Ctelegram_message_id|on_conflict=telegram_chat_id,telegram_message_id/);
  assert.match(calls[1].url, /claim_lm_codex_job/);
  assert.match(calls[2].url, /finish_lm_codex_job/);
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-secret");
});

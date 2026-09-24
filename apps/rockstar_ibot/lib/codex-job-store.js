// Durable, service-role-only queue for the local Codex bridge.
//
// The queue is deliberately separate from lm_browser_jobs: a Codex job is executed by the
// owner's local Codex session, while a browser job is executed by the cloud browser worker.
"use strict";

const { FEATURE_KEYS } = require("./doraemon-feature-selection.js");

const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const MODES = new Set(["read-only", "workspace-write"]);
const JOB_KINDS = new Set(["owner_command", "doraemon_feature", "doraemon_command"]);

function text(value, label, max) {
  const result = String(value == null ? "" : value).trim();
  if (!result || result.length > max) throw new Error(`${label} invalid`);
  return result;
}

function optionalText(value, label, max) {
  if (value == null || value === "") return null;
  const result = String(value).trim();
  if (result.length > max) throw new Error(`${label} invalid`);
  return result || null;
}

function jobId(value) {
  const id = text(value, "codex job id", 100);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("codex job id invalid");
  return id;
}

function integerOrNull(value, label) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < -255 || number > 255) throw new Error(`${label} invalid`);
  return number;
}

function buildCodexJob(input = {}) {
  const mode = text(input.mode || "read-only", "codex job mode", 32);
  if (!MODES.has(mode)) throw new Error("codex job mode invalid");
  const kind = text(input.jobKind || "owner_command", "codex job kind", 32);
  if (!JOB_KINDS.has(kind)) throw new Error("codex job kind invalid");
  const base = {
    uid: optionalText(input.uid, "codex job uid", 200),
    telegram_chat_id: text(input.chatId, "codex Telegram chat id", 100),
    telegram_user_id: text(input.userId, "codex Telegram user id", 100),
    telegram_message_id: text(input.messageId, "codex Telegram message id", 100),
    telegram_update_id: text(input.updateId, "codex Telegram update id", 100),
    prompt: text(input.prompt, "codex prompt", 12_000),
    mode,
    status: "queued",
  };
  if (kind === "owner_command") return Object.freeze(base);
  if (kind === "doraemon_command") {
    if (mode !== "read-only" || !base.uid) throw new Error("codex command job invalid");
    return Object.freeze({
      ...base,
      job_kind: kind,
      feature_key: null,
      request_text: text(input.requestText, "codex request text", 9_000),
      parent_job_id: input.parentJobId == null ? null : jobId(input.parentJobId),
    });
  }
  const featureKey = text(input.featureKey, "codex feature key", 32);
  if (!FEATURE_KEYS.includes(featureKey) || mode !== "read-only" || !base.uid) {
    throw new Error("codex feature job invalid");
  }
  return Object.freeze({
    ...base,
    job_kind: kind,
    feature_key: featureKey,
    request_text: text(input.requestText, "codex request text", 9_000),
    parent_job_id: input.parentJobId == null ? null : jobId(input.parentJobId),
  });
}

function createSupabaseCodexJobStore(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supaKey = String(options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") throw new Error("codex_store_unavailable");

  const headers = (extra = {}) => ({
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    ...extra,
  });

  async function request(path, init = {}) {
    const response = await fetchImpl(`${supaUrl}${path}`, {
      ...init,
      headers: headers(init.headers || {}),
    }).catch(() => null);
    if (!response || !response.ok) throw new Error("codex_store_request_failed");
    return response.json().catch(() => []);
  }

  async function enqueue(input) {
    const job = buildCodexJob(input);
    if (job.job_kind === "doraemon_feature" || job.job_kind === "doraemon_command") {
      const payload = await request("/rest/v1/rpc/enqueue_lm_doraemon_job", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          p_uid: job.uid,
          p_telegram_chat_id: job.telegram_chat_id,
          p_telegram_user_id: job.telegram_user_id,
          p_telegram_message_id: job.telegram_message_id,
          p_telegram_update_id: job.telegram_update_id,
          p_prompt: job.prompt,
          p_job_kind: job.job_kind,
          p_feature_key: job.feature_key,
          p_request_text: job.request_text,
          p_parent_job_id: job.parent_job_id,
        }),
      });
      if (!payload || payload.outcome === "rate_limited") return { created: false, rateLimited: true, job: null };
      if (!["created", "duplicate"].includes(payload.outcome) || !payload.job || !payload.job.id) {
        throw new Error("codex doraemon enqueue invalid");
      }
      return { created: payload.outcome === "created", rateLimited: false, job: payload.job };
    }
    const rows = await request("/rest/v1/lm_codex_jobs?on_conflict=telegram_chat_id,telegram_message_id", {
      method: "POST",
      headers: { "content-type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(job),
    });
    if (Array.isArray(rows) && rows.length === 1) return { created: true, job: rows[0] };
    const existing = await readByTelegramMessage(job.telegram_chat_id, job.telegram_message_id);
    if (!existing) throw new Error("codex duplicate was not readable");
    return { created: false, job: existing };
  }

  async function readByTelegramMessage(chatId, messageId) {
    const chat = encodeURIComponent(text(chatId, "codex Telegram chat id", 100));
    const message = encodeURIComponent(text(messageId, "codex Telegram message id", 100));
    const rows = await request(`/rest/v1/lm_codex_jobs?telegram_chat_id=eq.${chat}&telegram_message_id=eq.${message}&select=*&limit=1`, {
      headers: { Accept: "application/json" },
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex read returned multiple rows");
    return rows[0] || null;
  }

  async function read(id) {
    const rows = await request(`/rest/v1/lm_codex_jobs?id=eq.${encodeURIComponent(jobId(id))}&select=*&limit=1`, {
      headers: { Accept: "application/json" },
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex read returned multiple rows");
    return rows[0] || null;
  }

  async function listRecentByChat(chatId, limit = 10) {
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(20, Math.max(1, limit)) : 10;
    const chat = encodeURIComponent(text(chatId, "codex Telegram chat id", 100));
    const rows = await request(`/rest/v1/lm_codex_jobs?telegram_chat_id=eq.${chat}&select=id,uid,job_kind,feature_key,request_text,parent_job_id,status,telegram_result_message_id,accepted_at,created_at,finished_at&order=created_at.desc&limit=${safeLimit}`, {
      headers: { Accept: "application/json" },
    });
    if (!Array.isArray(rows)) throw new Error("codex recent jobs invalid");
    return rows;
  }

  async function countRecentByChat(chatId, sinceIso) {
    const chat = encodeURIComponent(text(chatId, "codex Telegram chat id", 100));
    const since = new Date(String(sinceIso || ""));
    if (!Number.isFinite(since.getTime())) throw new Error("codex since invalid");
    const value = encodeURIComponent(since.toISOString());
    const rows = await request(`/rest/v1/lm_codex_jobs?telegram_chat_id=eq.${chat}&created_at=gte.${value}&select=id&limit=11`, {
      headers: { Accept: "application/json" },
    });
    if (!Array.isArray(rows)) throw new Error("codex recent count invalid");
    return rows.length;
  }

  async function claim(leaseSeconds = 900) {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 1800) {
      throw new Error("codex lease invalid");
    }
    const rows = await request("/rest/v1/rpc/claim_lm_codex_job", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_lease_seconds: leaseSeconds }),
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex claim returned multiple rows");
    return rows[0] || null;
  }

  async function finish(id, input = {}) {
    const status = text(input.status, "codex terminal status", 32);
    if (!TERMINAL_STATUSES.has(status)) throw new Error("codex terminal status invalid");
    const result = text(input.result, "codex result", 16_000);
    const rows = await request("/rest/v1/rpc/finish_lm_codex_job", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        p_job_id: jobId(id),
        p_status: status,
        p_result: result,
        p_exit_code: integerOrNull(input.exitCode, "codex exit code"),
        p_codex_session_id: optionalText(input.codexSessionId, "codex session id", 200),
      }),
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex finish returned multiple rows");
    return rows[0] || null;
  }

  async function markTelegramSent(id, messageId) {
    const message = Number(messageId);
    if (!Number.isSafeInteger(message) || message <= 0) throw new Error("codex Telegram result message id invalid");
    const rows = await request("/rest/v1/rpc/mark_lm_codex_job_telegram_sent", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_job_id: jobId(id), p_telegram_message_id: message }),
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex Telegram receipt returned multiple rows");
    return rows[0] || null;
  }

  async function accept(id, chatId) {
    const rows = await request("/rest/v1/rpc/accept_lm_doraemon_job", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        p_job_id: jobId(id),
        p_telegram_chat_id: text(chatId, "codex Telegram chat id", 100),
      }),
    });
    if (!Array.isArray(rows) || rows.length > 1) throw new Error("codex accept returned multiple rows");
    return rows[0] || null;
  }

  return Object.freeze({
    enqueue,
    readByTelegramMessage,
    read,
    listRecentByChat,
    countRecentByChat,
    claim,
    finish,
    markTelegramSent,
    accept,
  });
}

module.exports = {
  MODES,
  JOB_KINDS,
  TERMINAL_STATUSES,
  buildCodexJob,
  createSupabaseCodexJobStore,
};

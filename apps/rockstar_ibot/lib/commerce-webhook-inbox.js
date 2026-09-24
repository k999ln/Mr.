"use strict";

const INBOX_STATES = Object.freeze(["received", "processing", "completed", "failed"]);
const MERCHANT_PATTERN = /^commerce:\/\/merchant\/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_KEY = /(?:^|_)(?:raw|body|email|phone|name|address|customer|person|secret|token|password|credential|api.?key|private.?key|authorization|cookie)(?:_|$)/i;
const FORBIDDEN_VALUE = /(?:\bBearer\s+|\bsk_(?:live|test)_|\bxox[baprs]-|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

class CommerceWebhookInboxError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "CommerceWebhookInboxError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new CommerceWebhookInboxError(code, message, details);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectRawOrSensitive(value, depth = 0) {
  if (depth > 5) fail("privacy_rejected", "webhook envelope is too deeply nested");
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) fail("privacy_rejected", "raw secret or PII is not accepted");
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) fail("privacy_rejected", `${key} is not accepted; store immutable evidence externally`);
    rejectRawOrSensitive(nested, depth + 1);
  }
}

function read(input, snake, camel) {
  const hasSnake = Object.prototype.hasOwnProperty.call(input, snake);
  const hasCamel = camel !== snake && Object.prototype.hasOwnProperty.call(input, camel);
  if (hasSnake && hasCamel) fail("ambiguous_field", `supply one spelling of ${snake}`);
  return hasSnake ? input[snake] : input[camel];
}

function aliased(input, snake, camel) {
  return read(input, snake, camel);
}

function bounded(value, field, max, pattern) {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > max
      || (pattern && !pattern.test(value))) {
    fail(`invalid_${field}`, `${field} must use its bounded opaque format`);
  }
  return value;
}

function tenant(value) {
  const uid = bounded(value, "uid", 256);
  if (/\s|[\x00-\x1f\x7f]/.test(uid)) fail("invalid_uid", "uid contains unsafe characters");
  return uid;
}

function instant(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`invalid_${field}`, `${field} must be an ISO timestamp`);
  }
  const normalized = new Date(value).toISOString();
  if (Date.parse(normalized) < Date.parse("2000-01-01T00:00:00.000Z")) {
    fail(`invalid_${field}`, `${field} is outside the supported range`);
  }
  return normalized;
}

const ENVELOPE_FIELDS = Object.freeze({
  uid: "uid", merchant_ref: "merchantRef", provider: "provider",
  provider_account_id: "providerAccountId", provider_event_id: "providerEventId",
  payload_sha256: "payloadSha256", evidence_ref: "evidenceRef", received_at: "receivedAt",
});

function buildWebhookEnvelope(input) {
  if (!plain(input)) fail("invalid_webhook_envelope", "webhook envelope must be a plain object");
  rejectRawOrSensitive(input);
  const allowed = new Set(Object.entries(ENVELOPE_FIELDS).flatMap(([snake, camel]) => [snake, camel]));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail("invalid_webhook_envelope_field", `field ${key} is not accepted in a webhook envelope`);
  }
  const uid = tenant(read(input, "uid", "uid"));
  const merchantRef = bounded(read(input, "merchant_ref", "merchantRef"), "merchant_ref", 160, MERCHANT_PATTERN);
  const provider = bounded(read(input, "provider", "provider"), "provider", 32, /^[a-z][a-z0-9_-]{0,31}$/);
  const providerAccountId = bounded(read(input, "provider_account_id", "providerAccountId"),
    "provider_account_id", 256, SAFE_ID_PATTERN);
  const providerEventId = bounded(read(input, "provider_event_id", "providerEventId"),
    "provider_event_id", 256, SAFE_ID_PATTERN);
  const payloadSha256 = bounded(read(input, "payload_sha256", "payloadSha256"), "payload_sha256", 64, HASH_PATTERN);
  const evidenceRef = bounded(read(input, "evidence_ref", "evidenceRef"), "evidence_ref", 1024);
  const expectedEvidence = `provider://${provider}/accounts/${providerAccountId}/events/${providerEventId}/sha256/${payloadSha256}`;
  if (evidenceRef !== expectedEvidence) {
    fail("invalid_evidence_ref", "evidence_ref must exactly bind provider account, event, and payload SHA-256");
  }
  const received = read(input, "received_at", "receivedAt");
  return Object.freeze({
    uid,
    merchant_ref: merchantRef,
    provider,
    provider_account_id: providerAccountId,
    provider_event_id: providerEventId,
    payload_sha256: payloadSha256,
    evidence_ref: evidenceRef,
    received_at: received == null || received === "" ? null : instant(received, "received_at"),
  });
}

function optionsForClient(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") {
    fail("storage_unavailable", "commerce webhook inbox needs Supabase service credentials and fetch");
  }
  return { supaUrl, supaKey, fetchImpl };
}

function headers(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function rpc(client, name, payload) {
  const response = await client.fetchImpl(`${client.supaUrl}/rest/v1/rpc/${name}`, {
    method: "POST", headers: headers(client.supaKey), body: JSON.stringify(payload),
  }).catch(() => null);
  const body = response && typeof response.json === "function"
    ? await response.json().catch(() => null) : null;
  if (!response || !response.ok) {
    const message = body && typeof body.message === "string" ? body.message : "";
    const known = ["webhook_event_collision", "webhook_lease_mismatch"]
      .find((code) => message.includes(code));
    fail(known || "storage_error", known || `commerce webhook RPC ${name} failed`,
      { status: response && response.status });
  }
  return body;
}

function normalizeInboxRow(row, expectedScope) {
  if (!plain(row)) fail("storage_error", "webhook inbox returned an invalid row");
  const normalized = Object.freeze({
    inbox_id: bounded(row.inbox_id, "inbox_id", 36, UUID_PATTERN),
    uid: tenant(row.uid),
    merchant_ref: bounded(row.merchant_ref, "merchant_ref", 160, MERCHANT_PATTERN),
    provider: bounded(row.provider, "provider", 32, /^[a-z][a-z0-9_-]{0,31}$/),
    provider_account_id: bounded(row.provider_account_id, "provider_account_id", 256, SAFE_ID_PATTERN),
    provider_event_id: bounded(row.provider_event_id, "provider_event_id", 256, SAFE_ID_PATTERN),
    payload_sha256: bounded(row.payload_sha256, "payload_sha256", 64, HASH_PATTERN),
    evidence_ref: bounded(row.evidence_ref, "evidence_ref", 1024),
    state: bounded(row.state, "state", 16),
    attempt_count: row.attempt_count,
    available_at: row.available_at || null,
    lease_token: row.lease_token || null,
    lease_expires_at: row.lease_expires_at || null,
    last_error_code: row.last_error_code || null,
    received_at: row.received_at || null,
    processing_started_at: row.processing_started_at || null,
    completed_at: row.completed_at || null,
    failed_at: row.failed_at || null,
    updated_at: row.updated_at || null,
  });
  if (!INBOX_STATES.includes(normalized.state) || !Number.isInteger(normalized.attempt_count)
      || normalized.attempt_count < 0) fail("storage_error", "webhook inbox state is invalid");
  const expectedEvidence = `provider://${normalized.provider}/accounts/${normalized.provider_account_id}`
    + `/events/${normalized.provider_event_id}/sha256/${normalized.payload_sha256}`;
  if (normalized.evidence_ref !== expectedEvidence) {
    fail("storage_boundary_violation", "webhook inbox returned unbound provider evidence");
  }
  if (expectedScope && (normalized.uid !== expectedScope.uid
      || normalized.merchant_ref !== expectedScope.merchant_ref)) {
    fail("storage_boundary_violation", "webhook inbox crossed the tenant or merchant boundary");
  }
  return normalized;
}

function one(body, label) {
  const value = Array.isArray(body) ? (body.length === 1 ? body[0] : null) : body;
  if (!value) fail("storage_error", `${label} returned an invalid row count`);
  return value;
}

function scopeInput(input) {
  if (!plain(input)) fail("invalid_webhook_scope", "webhook scope must be a plain object");
  const uid = tenant(input.uid);
  const merchantRef = bounded(aliased(input, "merchant_ref", "merchantRef"),
    "merchant_ref", 160, MERCHANT_PATTERN);
  return { uid, merchant_ref: merchantRef };
}

function assertControlFields(input, allowed) {
  if (!plain(input)) fail("invalid_webhook_control", "webhook control input must be a plain object");
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) {
      rejectRawOrSensitive({ [key]: value });
      fail("invalid_webhook_control_field", `field ${key} is not accepted for this operation`);
    }
  }
}

function createCommerceWebhookInbox(options = {}) {
  const client = optionsForClient(options);

  async function receive(input) {
    const record = buildWebhookEnvelope(input);
    const result = one(await rpc(client, "lm_receive_commerce_webhook", { p_record: record }), "webhook receive");
    if (!plain(result) || typeof result.created !== "boolean") {
      fail("storage_error", "webhook receive returned an invalid result");
    }
    const inbox = normalizeInboxRow(result.inbox, record);
    for (const field of ["provider", "provider_account_id", "provider_event_id", "payload_sha256", "evidence_ref"]) {
      if (inbox[field] !== record[field]) fail("storage_boundary_violation", "webhook receive readback changed immutable evidence");
    }
    return Object.freeze({ created: result.created, inbox });
  }

  async function claim(input) {
    assertControlFields(input, new Set([
      "uid", "merchantRef", "merchant_ref", "workerId", "worker_id", "limit",
      "leaseSeconds", "lease_seconds",
    ]));
    const scope = scopeInput(input);
    const workerId = bounded(aliased(input, "worker_id", "workerId"),
      "worker_id", 128, /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/);
    const limit = input.limit == null ? 10 : input.limit;
    const rawLeaseSeconds = aliased(input, "lease_seconds", "leaseSeconds");
    const leaseSeconds = rawLeaseSeconds == null ? 120 : rawLeaseSeconds;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("invalid_limit", "claim limit must be 1..100");
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) {
      fail("invalid_lease_seconds", "lease must be 30..900 seconds");
    }
    const body = await rpc(client, "lm_claim_commerce_webhooks", {
      p_uid: scope.uid, p_merchant_ref: scope.merchant_ref, p_worker_id: workerId,
      p_limit: limit, p_lease_seconds: leaseSeconds,
    });
    if (!Array.isArray(body)) fail("storage_error", "webhook claim returned a non-array result");
    return Object.freeze(body.map((row) => {
      const normalized = normalizeInboxRow(row, scope);
      if (normalized.state !== "processing" || !normalized.lease_token || !normalized.lease_expires_at) {
        fail("storage_error", "webhook claim returned an unleased row");
      }
      return normalized;
    }));
  }

  async function finish(input, succeeded) {
    assertControlFields(input, new Set([
      "uid", "merchantRef", "merchant_ref", "inboxId", "inbox_id", "leaseToken",
      "lease_token", "errorCode", "error_code", "retrySeconds", "retry_seconds",
    ]));
    const scope = scopeInput(input);
    const inboxId = bounded(aliased(input, "inbox_id", "inboxId"),
      "inbox_id", 36, UUID_PATTERN);
    const leaseToken = bounded(aliased(input, "lease_token", "leaseToken"),
      "lease_token", 36, UUID_PATTERN);
    const rawRetrySeconds = aliased(input, "retry_seconds", "retrySeconds");
    const retrySeconds = rawRetrySeconds == null ? 60 : rawRetrySeconds;
    if (!Number.isInteger(retrySeconds) || retrySeconds < 1 || retrySeconds > 86400) {
      fail("invalid_retry_seconds", "retry delay must be 1..86400 seconds");
    }
    let errorCode = null;
    if (!succeeded) {
      errorCode = bounded(aliased(input, "error_code", "errorCode"),
        "error_code", 64, /^[a-z][a-z0-9_]{0,63}$/);
    }
    const body = one(await rpc(client, "lm_finish_commerce_webhook", {
      p_uid: scope.uid, p_merchant_ref: scope.merchant_ref, p_inbox_id: inboxId,
      p_lease_token: leaseToken, p_succeeded: succeeded, p_error_code: errorCode,
      p_retry_seconds: retrySeconds,
    }), "webhook finish");
    const row = normalizeInboxRow(body, scope);
    const expectedState = succeeded ? "completed" : "failed";
    if (row.inbox_id !== inboxId || row.state !== expectedState || row.lease_token !== null) {
      fail("storage_boundary_violation", "webhook finish returned the wrong durable state");
    }
    return row;
  }

  return Object.freeze({
    receive, receiveWebhook: receive, claim, claimWebhooks: claim,
    complete: (input) => finish(input, true),
    completeWebhook: (input) => finish(input, true),
    fail: (input) => finish(input, false),
    failWebhook: (input) => finish(input, false),
  });
}

module.exports = {
  INBOX_STATES,
  CommerceWebhookInboxError,
  rejectRawOrSensitive,
  buildWebhookEnvelope,
  normalizeInboxRow,
  createCommerceWebhookInbox,
  createInbox: createCommerceWebhookInbox,
};

"use strict";

const STATES = new Set(["granted", "denied", "withdrawn", "expired"]);
const FORBIDDEN = new Set(["email", "rawcontent", "token", "accesstoken", "refreshtoken", "credential", "credentials", "secret", "password"]);

class CommerceConsentRightsStoreError extends Error {
  constructor(code, message, details = {}) { super(message || code); this.name = "CommerceConsentRightsStoreError"; this.code = code; Object.assign(this, details); }
}
function fail(code, message, details) { throw new CommerceConsentRightsStoreError(code, message, details); }
function text(value, name, max = 256, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) fail(`invalid_${name}`, `${name} is required`);
  return result;
}
function instant(value, name, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  const date = new Date(value); if (!value || Number.isNaN(date.getTime())) fail(`invalid_${name}`, `${name} must be an instant`); return date.toISOString();
}
function normalizeRecord(input) {
  const value = input || {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key.replace(/[^A-Za-z]/g, "").toLowerCase())) fail("forbidden_sensitive_field", `${key} is not accepted`);
    if (typeof value[key] === "string" && /^[^\s@]+@[^\s@]+$/.test(value[key])) fail("forbidden_sensitive_value", `${key} must be an opaque merchant-local reference`);
  }
  const rightState = value.rightState ?? value.right_state;
  if (!STATES.has(rightState)) fail("invalid_right_state", "rightState is invalid");
  const effectiveAt = instant(value.effectiveAt ?? value.effective_at, "effective_at");
  const expiresAt = instant(value.expiresAt ?? value.expires_at, "expires_at", true);
  const withdrawnAt = instant(value.withdrawnAt ?? value.withdrawn_at, "withdrawn_at", true);
  if (expiresAt && expiresAt <= effectiveAt) fail("invalid_effective_interval", "expiresAt must follow effectiveAt");
  if (rightState === "withdrawn" && !withdrawnAt) fail("withdrawal_time_required", "withdrawnAt is required for withdrawal");
  if (withdrawnAt && withdrawnAt < effectiveAt) fail("invalid_withdrawal_time", "withdrawnAt cannot precede effectiveAt");
  if (rightState !== "withdrawn" && withdrawnAt) fail("invalid_withdrawal_time", "withdrawnAt is only valid for withdrawal");
  return {
    uid: text(value.uid, "uid"), merchant_ref: text(value.merchantRef ?? value.merchant_ref, "merchant_ref"),
    subject_ref: text(value.subjectRef ?? value.subject_ref, "subject_ref"), purpose: text(value.purpose, "purpose"),
    scope: text(value.scope, "scope"), channel: text(value.channel, "channel"), right_state: rightState,
    notice_version: text(value.noticeVersion ?? value.notice_version, "notice_version"), policy_version: text(value.policyVersion ?? value.policy_version, "policy_version"),
    evidence_reference: text(value.evidenceReference ?? value.evidence_reference, "evidence_reference", 512),
    effective_at: effectiveAt, expires_at: expiresAt, withdrawn_at: withdrawnAt,
    reason_code: text(value.reasonCode ?? value.reason_code, "reason_code"),
    idempotency_key: text(value.idempotencyKey ?? value.idempotency_key, "idempotency_key"), revision_key: text(value.revisionKey ?? value.revision_key, "revision_key"),
    recorded_at: instant(value.recordedAt ?? value.recorded_at, "recorded_at"),
  };
}
function clientFor(options) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, ""); const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY; const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") fail("storage_unavailable", "Supabase service credentials are required"); return { supaUrl, supaKey, fetchImpl };
}
function createCommerceConsentRightsStore(options = {}) {
  const client = clientFor(options); const headers = { apikey: client.supaKey, Authorization: `Bearer ${client.supaKey}`, "Content-Type": "application/json" };
  async function rpc(name, payload) {
    const response = await client.fetchImpl(`${client.supaUrl}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(payload) }).catch(() => null);
    const body = response && await response.json().catch(() => null);
    if (!response || !response.ok) { const code = body && body.message === "idempotency_collision" ? "idempotency_collision" : "storage_error"; fail(code, `${name} failed`, { status: response && response.status }); }
    return body;
  }
  async function record(input) {
    const event = normalizeRecord(input); const body = await rpc("lm_append_commerce_consent_right", { p_event: event }); const row = body && body.event;
    if (!row || row.uid !== event.uid || row.merchant_ref !== event.merchant_ref) fail("storage_error", "consent write crossed the merchant boundary");
    return Object.freeze({ created: body.created === true, event: Object.freeze(row) });
  }
  async function permission(input) {
    const value = input || {}; const scope = { p_uid: text(value.uid, "uid"), p_merchant_ref: text(value.merchantRef ?? value.merchant_ref, "merchant_ref"), p_subject_ref: text(value.subjectRef ?? value.subject_ref, "subject_ref"), p_purpose: text(value.purpose, "purpose"), p_scope: text(value.scope, "scope"), p_channel: text(value.channel, "channel"), p_at: instant(value.at ?? new Date().toISOString(), "at") };
    const body = await rpc("lm_commerce_contact_permission", scope);
    if (!body || typeof body.permitted !== "boolean") fail("storage_error", "permission RPC returned an invalid result");
    return Object.freeze(body);
  }
  async function assertPermitted(input) { const result = await permission(input); if (!result.permitted) fail("commerce_contact_suppressed", "purpose-specific right does not permit this action", { reasonCode: result.reason_code }); return result; }
  return Object.freeze({ record, recordRight: record, permission, assertPermitted, assertContactPermitted: assertPermitted });
}
module.exports = { STATES, CommerceConsentRightsStoreError, normalizeRecord, createCommerceConsentRightsStore, createStore: createCommerceConsentRightsStore };

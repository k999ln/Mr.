"use strict";

const STATES = new Set(["granted", "revoked", "suspended", "expired"]);
const KINDS = new Set(["desired", "observed", "reconciliation"]);
const FORBIDDEN = new Set(["email", "rawcontent", "token", "accesstoken", "refreshtoken", "credential", "credentials", "secret", "password"]);

class CommercePurchaserEntitlementStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "CommercePurchaserEntitlementStoreError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new CommercePurchaserEntitlementStoreError(code, message, details);
}

function text(value, name, max = 256, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max) fail(`invalid_${name}`, `${name} is required`);
  return result;
}

function instant(value, name, nullable = false) {
  if (nullable && (value == null || value === "")) return null;
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) fail(`invalid_${name}`, `${name} must be an instant`);
  return date.toISOString();
}

function state(value, name, nullable = false) {
  if (nullable && value == null) return null;
  value = ({ grant: "granted", revoke: "revoked", suspend: "suspended", expire: "expired" })[value] || value;
  if (!STATES.has(value)) fail(`invalid_${name}`, `${name} must be grant, revoke, suspend, or expire state`);
  return value;
}

function rejectForbidden(input) {
  for (const key of Object.keys(input || {})) {
    if (FORBIDDEN.has(key.replace(/[^A-Za-z]/g, "").toLowerCase())) fail("forbidden_sensitive_field", `${key} is not accepted`);
    if (typeof input[key] === "string" && /^[^\s@]+@[^\s@]+$/.test(input[key])) fail("forbidden_sensitive_value", `${key} must be an opaque merchant-local reference`);
  }
}

function normalizeInput(input) {
  const value = input || {};
  rejectForbidden(value);
  const eventKind = value.eventKind || value.event_kind;
  if (!KINDS.has(eventKind)) fail("invalid_event_kind", "eventKind is required");
  const desiredState = state(value.desiredState ?? value.desired_state, "desired_state", true);
  const observedState = state(value.observedState ?? value.observed_state, "observed_state", true);
  if (eventKind === "desired" && (!desiredState || observedState)) fail("invalid_desired_event", "desired events carry desiredState only");
  if (eventKind === "observed" && (!observedState || desiredState)) fail("invalid_observed_event", "observed events carry observedState only");
  if (eventKind === "reconciliation" && (!desiredState || !observedState)) fail("invalid_reconciliation_event", "reconciliation requires both states");
  const providerRef = text(value.providerRef ?? value.provider_ref, "provider_ref", 256, true);
  if (eventKind === "desired" && providerRef) fail("invalid_desired_event", "desired state must not claim a provider observation");
  if (eventKind !== "desired" && !providerRef) fail("provider_reference_required", "observed provider state requires providerRef");
  const effectiveFrom = instant(value.effectiveFrom ?? value.effective_from, "effective_from");
  const effectiveUntil = instant(value.effectiveUntil ?? value.effective_until, "effective_until", true);
  if (effectiveUntil && effectiveUntil <= effectiveFrom) fail("invalid_effective_interval", "effectiveUntil must follow effectiveFrom");
  const discrepancy = eventKind === "reconciliation" ? desiredState !== observedState : false;
  const suppliedDiscrepancy = value.discrepancy;
  if (suppliedDiscrepancy != null && suppliedDiscrepancy !== discrepancy) fail("invalid_discrepancy", "discrepancy must reflect desired/observed drift");
  const reconciliationCaseRef = text(value.reconciliationCaseRef ?? value.reconciliation_case_ref, "reconciliation_case_ref", 256, true);
  if (discrepancy && !reconciliationCaseRef) fail("reconciliation_case_required", "drift requires a reconciliation case reference");
  return {
    uid: text(value.uid, "uid"), merchant_ref: text(value.merchantRef ?? value.merchant_ref, "merchant_ref"),
    purchaser_ref: text(value.purchaserRef ?? value.purchaser_ref, "purchaser_ref"),
    entitlement_ref: text(value.entitlementRef ?? value.entitlement_ref, "entitlement_ref"),
    event_kind: eventKind, desired_state: desiredState, observed_state: observedState, provider_ref: providerRef,
    effective_from: effectiveFrom, effective_until: effectiveUntil,
    source_order_ref: text(value.sourceOrderRef ?? value.source_order_ref, "source_order_ref", 256, true),
    source_refund_ref: text(value.sourceRefundRef ?? value.source_refund_ref, "source_refund_ref", 256, true),
    evidence_reference: text(value.evidenceReference ?? value.evidence_reference, "evidence_reference", 512),
    reconciliation_case_ref: reconciliationCaseRef, discrepancy,
    idempotency_key: text(value.idempotencyKey ?? value.idempotency_key, "idempotency_key"),
    revision_key: text(value.revisionKey ?? value.revision_key, "revision_key"),
    recorded_at: instant(value.recordedAt ?? value.recorded_at, "recorded_at"),
  };
}

function credentials(options) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") fail("storage_unavailable", "Supabase service credentials are required");
  return { supaUrl, supaKey, fetchImpl };
}

function createCommercePurchaserEntitlementStore(options = {}) {
  const client = credentials(options);
  async function append(input) {
    const event = normalizeInput(input);
    const response = await client.fetchImpl(`${client.supaUrl}/rest/v1/rpc/lm_append_commerce_purchaser_entitlement`, {
      method: "POST", headers: { apikey: client.supaKey, Authorization: `Bearer ${client.supaKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_event: event }),
    }).catch(() => null);
    const body = response && await response.json().catch(() => null);
    if (!response || !response.ok) {
      const collision = body && body.message === "idempotency_collision";
      fail(collision ? "idempotency_collision" : "storage_error", "entitlement evidence write failed", { status: response && response.status });
    }
    const row = body && body.event;
    if (!row || row.uid !== event.uid || row.merchant_ref !== event.merchant_ref) fail("storage_error", "entitlement write crossed the merchant boundary");
    return Object.freeze({ created: body.created === true, event: Object.freeze(row) });
  }
  return Object.freeze({
    append,
    recordDesiredState: (input) => append({ ...input, eventKind: "desired" }),
    recordObservedState: (input) => append({ ...input, eventKind: "observed" }),
    recordReconciliation: (input) => append({ ...input, eventKind: "reconciliation" }),
    grant: (input) => append({ ...input, eventKind: "desired", desiredState: "grant" }),
    revoke: (input) => append({ ...input, eventKind: "desired", desiredState: "revoke" }),
    suspend: (input) => append({ ...input, eventKind: "desired", desiredState: "suspend" }),
    expire: (input) => append({ ...input, eventKind: "desired", desiredState: "expire" }),
  });
}

module.exports = { STATES, CommercePurchaserEntitlementStoreError, normalizeInput, createCommercePurchaserEntitlementStore, createStore: createCommercePurchaserEntitlementStore };

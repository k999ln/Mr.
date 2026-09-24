"use strict";

const OBSERVATION_TYPES = Object.freeze(["order", "payment", "refund", "chargeback"]);
const PROMISE_TYPES = Object.freeze([
  "delivery", "access", "entitlement", "refund_policy", "support", "service_level",
]);
const MAX_MINOR_UNITS = Number.MAX_SAFE_INTEGER;
const MERCHANT_PATTERN = /^commerce:\/\/merchant\/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{0,255}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ARTIFACT_PATTERN = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._~:/+-]{0,470}\/sha256\/[0-9a-f]{64}$/;
const SENSITIVE_KEY = /(?:raw|payload|body|email|phone|name|address|customer|person|secret|token|password|credential|api.?key|private.?key|authorization|cookie)/i;
const SENSITIVE_VALUE = /(?:\bBearer\s+|\bsk_(?:live|test)_|\bxox[baprs]-|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

class CommerceAssuranceError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "CommerceAssuranceError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new CommerceAssuranceError(code, message, details);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectSensitive(value, depth = 0) {
  if (depth > 6) fail("privacy_rejected", "assurance input is too deeply nested");
  if (typeof value === "string") {
    if (SENSITIVE_VALUE.test(value)) fail("privacy_rejected", "raw secret or PII is not accepted");
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) fail("privacy_rejected", `${key} is not an assurance reference field`);
    rejectSensitive(nested, depth + 1);
  }
}

function read(input, snake, camel) {
  const hasSnake = Object.prototype.hasOwnProperty.call(input, snake);
  const hasCamel = camel && camel !== snake && Object.prototype.hasOwnProperty.call(input, camel);
  if (hasSnake && hasCamel) fail("ambiguous_field", `supply one spelling of ${snake}`);
  return hasSnake ? input[snake] : input[camel];
}

function assertKeys(input, aliases, label) {
  if (!plain(input)) fail(`invalid_${label}`, `${label} must be a plain object`);
  rejectSensitive(input);
  const allowed = new Set(Object.entries(aliases).flatMap(([snake, camel]) => [snake, camel]));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail(`invalid_${label}_field`, `${key} is not accepted for ${label}`);
  }
}

function boundedString(value, field, max, pattern) {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > max
      || (pattern && !pattern.test(value))) {
    fail(`invalid_${field}`, `${field} must use its bounded opaque format`);
  }
  return value;
}

function tenant(value) {
  const uid = boundedString(value, "uid", 256);
  if (/\s|[\x00-\x1f\x7f]/.test(uid)) fail("invalid_uid", "uid contains unsafe characters");
  return uid;
}

function merchant(value) {
  return boundedString(value, "merchant_ref", 160, MERCHANT_PATTERN);
}

function positiveVersion(value) {
  const number = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(number) || number < 1 || number > 2147483647) {
    fail("invalid_version", "version must be a positive 32-bit integer");
  }
  return number;
}

function minorUnits(value, field = "amount_minor") {
  const number = typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_MINOR_UNITS) {
    fail(`invalid_${field}`, `${field} must be non-negative integer minor units`);
  }
  return number;
}

function currency(value) {
  return boundedString(value, "currency", 3, /^[A-Z]{3}$/);
}

function instant(value, field) {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    fail(`invalid_${field}`, `${field} must be an ISO timestamp`);
  }
  const normalized = new Date(value).toISOString();
  if (Date.parse(normalized) < Date.parse("2000-01-01T00:00:00.000Z")) {
    fail(`invalid_${field}`, `${field} is outside the supported range`);
  }
  return normalized;
}

function optional(value, normalizer) {
  return value == null || value === "" ? null : normalizer(value);
}

function merchantEntityRef(value, merchantRef, kind, field) {
  const ref = boundedString(value, field, 512);
  const prefix = `${merchantRef}/${kind}/`;
  if (!ref.startsWith(prefix)) fail("merchant_scope_violation", `${field} must belong to merchant_ref`);
  const suffix = ref.slice(prefix.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(suffix)) {
    fail(`invalid_${field}`, `${field} must contain one opaque local identifier`);
  }
  return ref;
}

function versionRef(value, entityRef, version, field) {
  const expected = `${entityRef}/version/${version}`;
  if (value !== expected) fail(`invalid_${field}`, `${field} must exactly identify entity version ${version}`);
  return expected;
}

function priorVersionRef(value, entityRef, version, field) {
  const ref = boundedString(value, field, 550);
  const prefix = `${entityRef}/version/`;
  const prior = ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
  if (!/^[1-9]\d*$/.test(prior) || Number(prior) >= version) {
    fail(`invalid_${field}`, `${field} must identify an earlier version of the same entity`);
  }
  return ref;
}

const OFFER_FIELDS = Object.freeze({
  uid: "uid", merchant_ref: "merchantRef", offer_version_ref: "offerVersionRef",
  offer_ref: "offerRef", version: "version", price_minor: "priceMinor", currency: "currency",
  terms_ref: "termsRef", content_sha256: "contentSha256", effective_at: "effectiveAt",
  supersedes_offer_version_ref: "supersedesOfferVersionRef",
});

function buildOfferVersion(input) {
  assertKeys(input, OFFER_FIELDS, "offer_version");
  const uid = tenant(read(input, "uid", "uid"));
  const merchantRef = merchant(read(input, "merchant_ref", "merchantRef"));
  const offerRef = merchantEntityRef(read(input, "offer_ref", "offerRef"), merchantRef, "offer", "offer_ref");
  const version = positiveVersion(read(input, "version", "version"));
  const supersedes = optional(
    read(input, "supersedes_offer_version_ref", "supersedesOfferVersionRef"),
    (value) => priorVersionRef(value, offerRef, version, "supersedes_offer_version_ref"),
  );
  return Object.freeze({
    uid,
    merchant_ref: merchantRef,
    offer_version_ref: versionRef(read(input, "offer_version_ref", "offerVersionRef"), offerRef, version, "offer_version_ref"),
    offer_ref: offerRef,
    version,
    price_minor: minorUnits(read(input, "price_minor", "priceMinor"), "price_minor"),
    currency: currency(read(input, "currency", "currency")),
    terms_ref: boundedString(read(input, "terms_ref", "termsRef"), "terms_ref", 512, ARTIFACT_PATTERN),
    content_sha256: boundedString(read(input, "content_sha256", "contentSha256"), "content_sha256", 64, HASH_PATTERN),
    effective_at: instant(read(input, "effective_at", "effectiveAt"), "effective_at"),
    supersedes_offer_version_ref: supersedes,
  });
}

const PROMISE_FIELDS = Object.freeze({
  uid: "uid", merchant_ref: "merchantRef", promise_version_ref: "promiseVersionRef",
  promise_ref: "promiseRef", version: "version", offer_version_ref: "offerVersionRef",
  promise_type: "promiseType", specification_ref: "specificationRef",
  content_sha256: "contentSha256", effective_at: "effectiveAt",
  supersedes_promise_version_ref: "supersedesPromiseVersionRef",
});

function buildPromiseVersion(input) {
  assertKeys(input, PROMISE_FIELDS, "promise_version");
  const uid = tenant(read(input, "uid", "uid"));
  const merchantRef = merchant(read(input, "merchant_ref", "merchantRef"));
  const promiseRef = merchantEntityRef(read(input, "promise_ref", "promiseRef"), merchantRef, "promise", "promise_ref");
  const version = positiveVersion(read(input, "version", "version"));
  const promiseType = boundedString(read(input, "promise_type", "promiseType"), "promise_type", 32);
  if (!PROMISE_TYPES.includes(promiseType)) fail("invalid_promise_type", "unsupported promise_type");
  const offerVersionRef = boundedString(read(input, "offer_version_ref", "offerVersionRef"), "offer_version_ref", 550);
  if (!offerVersionRef.startsWith(`${merchantRef}/offer/`) || !/\/version\/[1-9]\d*$/.test(offerVersionRef)) {
    fail("merchant_scope_violation", "offer_version_ref must exactly identify a merchant-local offer version");
  }
  const supersedes = optional(
    read(input, "supersedes_promise_version_ref", "supersedesPromiseVersionRef"),
    (value) => priorVersionRef(value, promiseRef, version, "supersedes_promise_version_ref"),
  );
  return Object.freeze({
    uid,
    merchant_ref: merchantRef,
    promise_version_ref: versionRef(read(input, "promise_version_ref", "promiseVersionRef"), promiseRef, version, "promise_version_ref"),
    promise_ref: promiseRef,
    version,
    offer_version_ref: offerVersionRef,
    promise_type: promiseType,
    specification_ref: boundedString(read(input, "specification_ref", "specificationRef"), "specification_ref", 512, ARTIFACT_PATTERN),
    content_sha256: boundedString(read(input, "content_sha256", "contentSha256"), "content_sha256", 64, HASH_PATTERN),
    effective_at: instant(read(input, "effective_at", "effectiveAt"), "effective_at"),
    supersedes_promise_version_ref: supersedes,
  });
}

const OBSERVATION_FIELDS = Object.freeze({
  observation_ref: "observationRef", uid: "uid", merchant_ref: "merchantRef",
  observation_type: "observationType", amount_minor: "amountMinor", currency: "currency",
  provider: "provider", provider_account_id: "providerAccountId",
  provider_event_id: "providerEventId", provider_payment_id: "providerPaymentId",
  reverses_observation_ref: "reversesObservationRef", observed_at: "observedAt",
  offer_version_ref: "offerVersionRef", promise_version_ref: "promiseVersionRef",
  inbox_id: "inboxId", evidence_ref: "evidenceRef",
});

function exactProviderEvidence(value, provider, accountId, eventId) {
  const ref = boundedString(value, "evidence_ref", 1024);
  const prefix = `provider://${provider}/accounts/${accountId}/events/${eventId}/sha256/`;
  if (!ref.startsWith(prefix) || !HASH_PATTERN.test(ref.slice(prefix.length))) {
    fail("invalid_evidence_ref", "evidence_ref must exactly bind provider account, event, and SHA-256");
  }
  return ref;
}

function exactLocalVersion(value, merchantRef, kind, field) {
  const ref = boundedString(value, field, 550);
  if (!ref.startsWith(`${merchantRef}/${kind}/`) || !/\/version\/[1-9]\d*$/.test(ref)) {
    fail("merchant_scope_violation", `${field} must identify an exact merchant-local ${kind} version`);
  }
  return ref;
}

function buildCommerceObservation(input) {
  assertKeys(input, OBSERVATION_FIELDS, "commerce_observation");
  const uid = tenant(read(input, "uid", "uid"));
  const merchantRef = merchant(read(input, "merchant_ref", "merchantRef"));
  const type = boundedString(read(input, "observation_type", "observationType"), "observation_type", 16);
  if (!OBSERVATION_TYPES.includes(type)) fail("invalid_observation_type", "unsupported observation_type");
  const provider = boundedString(read(input, "provider", "provider"), "provider", 32, /^[a-z][a-z0-9_-]{0,31}$/);
  const providerAccountId = boundedString(read(input, "provider_account_id", "providerAccountId"),
    "provider_account_id", 256, SAFE_ID_PATTERN);
  const providerEventId = boundedString(read(input, "provider_event_id", "providerEventId"),
    "provider_event_id", 256, SAFE_ID_PATTERN);
  const paymentId = optional(read(input, "provider_payment_id", "providerPaymentId"),
    (value) => boundedString(value, "provider_payment_id", 256, SAFE_ID_PATTERN));
  if (type !== "order" && !paymentId) fail("missing_provider_payment_id", `${type} requires provider_payment_id`);
  const reversal = optional(read(input, "reverses_observation_ref", "reversesObservationRef"),
    (value) => merchantEntityRef(value, merchantRef, "observation", "reverses_observation_ref"));
  if (["refund", "chargeback"].includes(type) !== Boolean(reversal)) {
    fail("invalid_reversal_linkage", "refund and chargeback require one exact reversal link only");
  }
  return Object.freeze({
    observation_ref: merchantEntityRef(read(input, "observation_ref", "observationRef"), merchantRef, "observation", "observation_ref"),
    uid,
    merchant_ref: merchantRef,
    observation_type: type,
    amount_minor: minorUnits(read(input, "amount_minor", "amountMinor")),
    currency: currency(read(input, "currency", "currency")),
    provider,
    provider_account_id: providerAccountId,
    provider_event_id: providerEventId,
    provider_payment_id: paymentId,
    reverses_observation_ref: reversal,
    observed_at: instant(read(input, "observed_at", "observedAt"), "observed_at"),
    offer_version_ref: exactLocalVersion(read(input, "offer_version_ref", "offerVersionRef"), merchantRef, "offer", "offer_version_ref"),
    promise_version_ref: exactLocalVersion(read(input, "promise_version_ref", "promiseVersionRef"), merchantRef, "promise", "promise_version_ref"),
    inbox_id: boundedString(read(input, "inbox_id", "inboxId"), "inbox_id", 36, UUID_PATTERN),
    evidence_ref: exactProviderEvidence(read(input, "evidence_ref", "evidenceRef"),
      provider, providerAccountId, providerEventId),
  });
}

function clientOptions(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") {
    fail("storage_unavailable", "commerce assurance store needs Supabase service credentials and fetch");
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
    const collision = [
      "offer_version_collision", "promise_version_collision", "observation_collision",
      "invalid_supersedes_offer_version_ref", "invalid_supersedes_promise_version_ref",
      "webhook_lease_mismatch", "invalid_payment_reversal", "payment_reversal_exceeded",
    ]
      .find((code) => message.includes(code));
    fail(collision || "storage_error", collision || "commerce assurance RPC failed",
      { status: response && response.status });
  }
  if (Array.isArray(body)) {
    if (body.length !== 1) fail("storage_error", "commerce assurance RPC returned an invalid row count");
    return body[0];
  }
  return body;
}

function sameRecord(actual, expected, label, builder) {
  if (!plain(actual) || typeof actual.created !== "boolean" || !plain(actual.record || actual.observation)) {
    fail("storage_error", `${label} RPC returned an invalid result`);
  }
  const stored = actual.record || actual.observation;
  const comparableInput = {};
  for (const key of Object.keys(expected)) comparableInput[key] = stored[key] == null ? null : stored[key];
  let comparable;
  try {
    comparable = builder(comparableInput);
  } catch {
    fail("storage_boundary_violation", `${label} readback was not a valid immutable record`);
  }
  if (JSON.stringify(comparable) !== JSON.stringify(expected)) {
    fail("storage_boundary_violation", `${label} readback crossed tenant, merchant, or immutable payload boundary`);
  }
  return Object.freeze({ created: actual.created, [actual.record ? "record" : "observation"]: Object.freeze({ ...stored }) });
}

function createCommerceAssuranceStore(options = {}) {
  const client = clientOptions(options);
  async function putOfferVersion(input) {
    const record = buildOfferVersion(input);
    return sameRecord(await rpc(client, "lm_put_commerce_offer_version", { p_record: record }),
      record, "offer version", buildOfferVersion);
  }
  async function putPromiseVersion(input) {
    const record = buildPromiseVersion(input);
    return sameRecord(await rpc(client, "lm_put_commerce_promise_version", { p_record: record }),
      record, "promise version", buildPromiseVersion);
  }
  async function appendObservation(input, leaseToken) {
    const record = buildCommerceObservation(input);
    const lease = boundedString(leaseToken, "lease_token", 36, UUID_PATTERN);
    return sameRecord(await rpc(client, "lm_append_commerce_observation", {
      p_record: record, p_lease_token: lease,
    }),
      record, "observation", buildCommerceObservation);
  }
  return Object.freeze({
    putOfferVersion, recordOfferVersion: putOfferVersion,
    putPromiseVersion, recordPromiseVersion: putPromiseVersion,
    appendObservation, recordObservation: appendObservation,
  });
}

module.exports = {
  OBSERVATION_TYPES,
  PROMISE_TYPES,
  MAX_MINOR_UNITS,
  CommerceAssuranceError,
  rejectSensitive,
  buildOfferVersion,
  buildPromiseVersion,
  buildCommerceObservation,
  createCommerceAssuranceStore,
  createStore: createCommerceAssuranceStore,
};

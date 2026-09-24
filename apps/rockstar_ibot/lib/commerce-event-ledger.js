"use strict";

const COMMERCE_EVENT_KINDS = Object.freeze([
  "decision_proposed",
  "decision_approved",
  "action_enqueued",
  "exposure_eligible",
  "exposure_delivered",
  "provider_readback",
  "outcome_observed",
  "experiment_assignment",
  "consent_recorded",
]);

const COMMERCE_RESULT_LABELS = Object.freeze([
  "approved", "enqueued", "eligible", "ineligible", "delivered", "read",
  "purchase", "renew", "refund", "cancel", "fail", "success", "no_action",
  "assigned", "consented", "declined",
]);

const EVENT_KIND_SET = new Set(COMMERCE_EVENT_KINDS);
const RESULT_LABEL_SET = new Set(COMMERCE_RESULT_LABELS);
const MONEY_RESULT_SET = new Set(["purchase", "renew", "refund"]);
const MAX_VALUE_MINOR = Number.MAX_SAFE_INTEGER;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const MERCHANT_REF_PATTERN = /^commerce:\/\/merchant\/[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const METADATA_KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}_ref$/;
const METADATA_REF_PATTERN = /^(?:commerce|artifact|provider|receipt|decision|action):\/\/[A-Za-z0-9][A-Za-z0-9._~:/+-]{0,510}$/;
const RESERVED_METADATA_KEY_PATTERN = /(?:email|message|body|raw|secret|token|credential|password|api_key|private_key|customer|person|contact|identity|profile|user|account)/;
const RESERVED_METADATA_REF_PATTERN = /(?:^|[/:._~-])(?:email|secret|token|credential|password|api[_-]?key|private[_-]?key|customer|person|contact|identity|profile|user|account)(?:[/:._~-]|$)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REFERENCE_FIELDS = Object.freeze({
  target_ref: "target",
  workflow_ref: "workflow",
  plan_ref: "plan",
  step_ref: "step",
  campaign_ref: "campaign",
  experiment_ref: "experiment",
  customer_ref: "customer",
});

const INPUT_ALIASES = Object.freeze({
  merchant_ref: "merchantRef",
  event_kind: "eventKind",
  reason_code: "reasonCode",
  occurred_at: "occurredAt",
  idempotency_key: "idempotencyKey",
  revision_key: "revisionKey",
  target_ref: "targetRef",
  workflow_ref: "workflowRef",
  plan_ref: "planRef",
  step_ref: "stepRef",
  campaign_ref: "campaignRef",
  experiment_ref: "experimentRef",
  customer_ref: "customerRef",
  result_label: "resultLabel",
  value_minor: "valueMinor",
  currency: "currency",
  metadata: "metadata",
  uid: "uid",
});

const ALLOWED_INPUT_FIELDS = new Set(Object.entries(INPUT_ALIASES).flatMap(([snake, camel]) => [snake, camel]));
const SENSITIVE_KEYS = new Set([
  "message", "messagebody", "body", "raw", "rawcontent", "content", "email",
  "emailaddress", "password", "secret", "token", "accesstoken", "refreshtoken",
  "clientsecret", "privatekey", "apikey", "authorization", "cookie", "credentials",
]);
const SENSITIVE_STRING_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bsk_(?:live|test)_[A-Za-z0-9]+/i,
  /\bxox[baprs]-[A-Za-z0-9-]+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

class CommerceEventLedgerError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "CommerceEventLedgerError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new CommerceEventLedgerError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoSensitiveData(value, depth = 0) {
  if (depth > 8) fail("privacy_rejected", "commerce event input is too deeply nested");
  if (typeof value === "string") {
    if (SENSITIVE_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      fail("privacy_rejected", "privacy rejected: commerce events accept opaque references only");
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitiveData(item, depth + 1);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      fail("privacy_rejected", `commerce event field ${key} is not reference-only`);
    }
    assertNoSensitiveData(nested, depth + 1);
  }
}

function readInput(input, snake) {
  const camel = INPUT_ALIASES[snake];
  const hasSnake = Object.prototype.hasOwnProperty.call(input, snake);
  const hasCamel = camel !== snake && Object.prototype.hasOwnProperty.call(input, camel);
  if (hasSnake && hasCamel) {
    fail("ambiguous_field", `supply only one spelling of ${snake}`);
  }
  return hasSnake ? input[snake] : input[camel];
}

function requiredString(value, field, maxLength, pattern) {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > maxLength
      || (pattern && !pattern.test(value))) {
    fail(`invalid_${field}`, `${field} is required and must use its bounded opaque format`);
  }
  return value;
}

function normalizeTenantUid(value) {
  const uid = requiredString(value, "tenant_uid", 256);
  if (/\s|[\x00-\x1f\x7f]/.test(uid)) {
    fail("invalid_tenant_uid", "tenant uid must not contain whitespace or control characters");
  }
  return uid;
}

function normalizeMerchantReference(value) {
  return requiredString(value, "merchant_ref", 160, MERCHANT_REF_PATTERN);
}

function normalizeScopedReference(value, field, category, merchantRef) {
  if (value == null || value === "") return null;
  const ref = requiredString(value, field, 512);
  const prefix = `${merchantRef}/${category}/`;
  if (!ref.startsWith(prefix)) {
    fail("cross_merchant_reference", `${field} must be local to merchant_ref`);
  }
  const localId = ref.slice(prefix.length);
  if (category === "customer") {
    if (!/^psn_[A-Za-z0-9][A-Za-z0-9._~-]{0,119}$/.test(localId)) {
      fail("invalid_customer_ref", "customer_ref must be a merchant-local pseudonymous reference");
    }
  } else if (!SAFE_ID_PATTERN.test(localId)) {
    fail(`invalid_${field}`, `${field} must contain one bounded opaque local identifier`);
  }
  return ref;
}

function normalizeInstant(value, field = "occurred_at") {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value))) {
    fail(`invalid_${field}`, `${field} must be an ISO timestamp`);
  }
  const instant = new Date(value).toISOString();
  if (Date.parse(instant) < Date.parse("2000-01-01T00:00:00.000Z")) {
    fail(`invalid_${field}`, `${field} is outside the supported time range`);
  }
  if (field === "occurred_at" && Date.parse(instant) > Date.now() + 5 * 60_000) {
    fail("commerce_event_time_in_future", "occurred_at must not be more than five minutes in the future");
  }
  return instant;
}

function normalizeMetadata(value) {
  const metadata = value == null ? {} : value;
  if (!isPlainObject(metadata)) {
    fail("invalid_metadata", "metadata must be a flat reference-only object");
  }
  const entries = Object.entries(metadata);
  if (entries.length > 32) fail("invalid_metadata", "metadata has too many references");
  const normalized = {};
  for (const [key, ref] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!METADATA_KEY_PATTERN.test(key) || RESERVED_METADATA_KEY_PATTERN.test(key)
        || typeof ref !== "string" || ref.length > 512
        || !METADATA_REF_PATTERN.test(ref) || RESERVED_METADATA_REF_PATTERN.test(ref)) {
      fail("invalid_metadata", "metadata accepts only *_ref keys with safe reference URIs");
    }
    normalized[key] = ref;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 8192) {
    fail("invalid_metadata", "metadata exceeds the 8192-byte limit");
  }
  return Object.freeze(normalized);
}

function requiredReferencesFor(eventKind) {
  if (eventKind === "decision_proposed" || eventKind === "decision_approved") {
    return ["target_ref", "workflow_ref", "plan_ref"];
  }
  if (eventKind === "action_enqueued") {
    return ["target_ref", "workflow_ref", "plan_ref", "step_ref"];
  }
  if (["exposure_eligible", "exposure_delivered", "provider_readback"].includes(eventKind)) {
    return ["target_ref", "campaign_ref", "customer_ref"];
  }
  if (eventKind === "outcome_observed") return ["target_ref", "customer_ref"];
  if (eventKind === "experiment_assignment") return ["target_ref", "experiment_ref", "customer_ref"];
  return ["customer_ref"];
}

function validateCommerceEvent(input) {
  if (!isPlainObject(input)) fail("invalid_commerce_event", "commerce event must be a plain object");
  assertNoSensitiveData(input);
  for (const key of Object.keys(input)) {
    if (!ALLOWED_INPUT_FIELDS.has(key)) {
      fail("invalid_commerce_event_field", `commerce event field ${key} is not allowed`);
    }
  }

  const uid = normalizeTenantUid(readInput(input, "uid"));
  const merchantRef = normalizeMerchantReference(readInput(input, "merchant_ref"));
  const eventKind = requiredString(readInput(input, "event_kind"), "event_kind", 64);
  if (!EVENT_KIND_SET.has(eventKind)) fail("invalid_event_kind", `unsupported commerce event kind ${eventKind}`);
  const reasonCode = requiredString(
    readInput(input, "reason_code"), "reason_code", 64, /^[a-z][a-z0-9_]{0,63}$/,
  );
  const occurredAt = normalizeInstant(readInput(input, "occurred_at"));
  const idempotencyKey = requiredString(
    readInput(input, "idempotency_key"), "idempotency_key", 256,
    /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$/,
  );
  const revisionKey = requiredString(
    readInput(input, "revision_key"), "revision_key", 128,
    /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/,
  );

  const references = {};
  for (const [field, category] of Object.entries(REFERENCE_FIELDS)) {
    references[field] = normalizeScopedReference(readInput(input, field), field, category, merchantRef);
  }
  for (const field of requiredReferencesFor(eventKind)) {
    if (!references[field]) fail("missing_event_reference", `${eventKind} requires ${field}`);
  }

  const rawResult = readInput(input, "result_label");
  const resultLabel = rawResult == null || rawResult === "" ? null
    : requiredString(rawResult, "result_label", 32);
  if (resultLabel && !RESULT_LABEL_SET.has(resultLabel)) {
    fail("invalid_result_label", "result_label must use the explicit safe vocabulary");
  }
  if (eventKind === "outcome_observed" && !resultLabel) {
    fail("missing_result_label", "outcome_observed requires an explicit result_label");
  }

  const rawValue = readInput(input, "value_minor");
  let valueMinor = null;
  if (rawValue != null && rawValue !== "") {
    const digits = typeof rawValue === "number" ? String(rawValue) : rawValue;
    if (!/^(?:0|[1-9]\d*)$/.test(digits) || !Number.isSafeInteger(Number(digits))
        || Number(digits) > MAX_VALUE_MINOR) {
      fail("invalid_value_minor", "value_minor must be bounded non-negative whole minor units");
    }
    valueMinor = Number(digits);
  }
  const rawCurrency = readInput(input, "currency");
  const currency = rawCurrency == null || rawCurrency === "" ? null
    : requiredString(rawCurrency, "currency", 3, /^[A-Z]{3}$/);
  if ((valueMinor == null) !== (currency == null)) {
    fail("invalid_value_pair", "value_minor and currency must be supplied together");
  }
  if (valueMinor != null && !MONEY_RESULT_SET.has(resultLabel)) {
    fail("invalid_value_result", "money values are allowed only for purchase, renew, or refund results");
  }

  return Object.freeze({
    uid,
    merchant_ref: merchantRef,
    event_kind: eventKind,
    reason_code: reasonCode,
    occurred_at: occurredAt,
    idempotency_key: idempotencyKey,
    revision_key: revisionKey,
    ...references,
    result_label: resultLabel,
    value_minor: valueMinor,
    currency,
    metadata: normalizeMetadata(readInput(input, "metadata")),
  });
}

function buildCommerceEvent(input) {
  return validateCommerceEvent(input);
}

function credentials(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") {
    fail("storage_unavailable", "commerce event ledger needs Supabase service credentials and fetch");
  }
  return { supaUrl, supaKey, fetchImpl };
}

function requestHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function parseResponse(response) {
  const body = response && typeof response.json === "function"
    ? await response.json().catch(() => null)
    : null;
  if (!response || !response.ok) {
    const providerMessage = body && typeof body.message === "string" ? body.message : "";
    const code = providerMessage.includes("idempotency_collision")
      ? "idempotency_collision"
      : "storage_error";
    fail(code, code === "idempotency_collision"
      ? "commerce event idempotency collision"
      : "commerce event append failed", { status: response && response.status });
  }
  if (Array.isArray(body)) {
    if (body.length !== 1) fail("storage_error", "commerce event RPC returned an invalid row count");
    return body[0];
  }
  return body;
}

function normalizeStoredResult(body, expected) {
  if (!isPlainObject(body) || typeof body.created !== "boolean" || !isPlainObject(body.event)) {
    fail("storage_error", "commerce event RPC returned an invalid result");
  }
  const event = body.event;
  const eventId = requiredString(event.event_id, "event_id", 36, UUID_PATTERN);
  const recordedAt = normalizeInstant(event.recorded_at, "recorded_at");
  const eventInput = {};
  for (const field of Object.keys(INPUT_ALIASES)) eventInput[field] = event[field];
  const normalized = validateCommerceEvent(eventInput);
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    fail("storage_boundary_violation", "commerce event RPC returned another tenant, merchant, or payload");
  }
  return Object.freeze({
    created: body.created,
    event: Object.freeze({ event_id: eventId, ...normalized, recorded_at: recordedAt }),
  });
}

function createCommerceEventLedger(options = {}) {
  const client = credentials(options);

  async function appendEvent(input) {
    const event = buildCommerceEvent(input);
    const response = await client.fetchImpl(
      `${client.supaUrl}/rest/v1/rpc/lm_append_commerce_event`,
      {
        method: "POST",
        headers: requestHeaders(client.supaKey),
        body: JSON.stringify({ p_event: event }),
      },
    ).catch(() => null);
    const body = await parseResponse(response);
    return normalizeStoredResult(body, event);
  }

  return Object.freeze({ append: appendEvent, appendEvent, appendCommerceEvent: appendEvent });
}

async function storeCommerceEvent(input, options = {}) {
  return createCommerceEventLedger(options).appendEvent(input);
}

module.exports = {
  COMMERCE_EVENT_KINDS,
  COMMERCE_RESULT_LABELS,
  MAX_VALUE_MINOR,
  CommerceEventLedgerError,
  assertNoSensitiveData,
  validateCommerceEvent,
  buildCommerceEvent,
  createCommerceEventLedger,
  createStore: createCommerceEventLedger,
  storeCommerceEvent,
};

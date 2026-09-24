"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  COMMERCE_EVENT_KINDS,
  COMMERCE_RESULT_LABELS,
  MAX_VALUE_MINOR,
  buildCommerceEvent,
  createCommerceEventLedger,
} = require("./commerce-event-ledger.js");

const MIGRATION = fs.readFileSync(path.join(
  __dirname, "../migrations/2026-08-31-lm-commerce-events.sql",
), "utf8");
const MERCHANT = "commerce://merchant/mrc_alpha";
const REFS = Object.freeze({
  targetRef: `${MERCHANT}/target/offer_42`,
  workflowRef: `${MERCHANT}/workflow/wf_launch`,
  planRef: `${MERCHANT}/plan/plan_v1`,
  stepRef: `${MERCHANT}/step/step_send`,
  campaignRef: `${MERCHANT}/campaign/cmp_summer`,
  experimentRef: `${MERCHANT}/experiment/exp_subject_v2`,
  customerRef: `${MERCHANT}/customer/psn_7fc82a`,
});

function event(overrides = {}) {
  return {
    uid: "tenant-1",
    merchantRef: MERCHANT,
    eventKind: "decision_proposed",
    reasonCode: "offer_ready",
    occurredAt: "2026-08-31T00:00:00.000Z",
    idempotencyKey: "workflow:wf_launch:decision:1",
    revisionKey: "rev_1",
    targetRef: REFS.targetRef,
    workflowRef: REFS.workflowRef,
    planRef: REFS.planRef,
    metadata: { source_ref: "artifact://commerce/proposal/42" },
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function storedResponse(payload, created = true, overrides = {}) {
  return {
    created,
    event: {
      event_id: "8c6fbd77-6086-4bf8-9870-9c129d71a9ee",
      ...payload,
      recorded_at: "2026-08-31T00:00:01.000Z",
      ...overrides,
    },
  };
}

test("migration is tenant-bound, service-only, RLS-protected, and engine-enforced append-only", () => {
  assert.match(MIGRATION, /uid text NOT NULL REFERENCES public\.lm_users\(uid\) ON DELETE RESTRICT/i);
  assert.match(MIGRATION, /ALTER TABLE public\.lm_commerce_events ENABLE ROW LEVEL SECURITY/i);
  assert.match(MIGRATION, /CREATE POLICY lm_commerce_events_service_select[\s\S]*TO service_role/i);
  assert.match(MIGRATION, /CREATE POLICY lm_commerce_events_service_insert[\s\S]*TO service_role/i);
  assert.match(MIGRATION, /REVOKE ALL ON TABLE public\.lm_commerce_events FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(MIGRATION, /GRANT SELECT ON TABLE public\.lm_commerce_events TO service_role/i);
  assert.match(MIGRATION, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*FROM service_role/i);
  assert.match(MIGRATION, /lm_commerce_events is append-only/i);
  assert.match(MIGRATION, /BEFORE UPDATE OR DELETE ON public\.lm_commerce_events/i);
  assert.doesNotMatch(MIGRATION, /GRANT[^;]+TO (?:anon|authenticated)/i);
});

test("migration declares the complete event vocabulary and atomic collision-aware append", () => {
  for (const kind of COMMERCE_EVENT_KINDS) assert.match(MIGRATION, new RegExp(`'${kind}'`));
  assert.match(MIGRATION, /reason_code text NOT NULL/i);
  assert.match(MIGRATION, /occurred_at timestamptz NOT NULL/i);
  assert.match(MIGRATION, /idempotency_key text NOT NULL/i);
  assert.match(MIGRATION, /revision_key text NOT NULL/i);
  assert.match(MIGRATION, /UNIQUE \(\s*uid, merchant_ref, idempotency_key, revision_key\s*\)/i);
  assert.match(MIGRATION, /ON CONFLICT \(uid, merchant_ref, idempotency_key, revision_key\) DO NOTHING/i);
  assert.match(MIGRATION, /v_row\.payload_hash <> v_payload_hash[\s\S]*idempotency_collision/i);
  assert.match(MIGRATION, /SECURITY DEFINER\s+SET search_path = public, pg_temp/i);
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.lm_append_commerce_event\(jsonb\) TO service_role/i);
});

test("migration stores bounded merchant-local references and no direct identity, content, or credential fields", () => {
  for (const column of [
    "merchant_ref", "target_ref", "workflow_ref", "plan_ref", "step_ref",
    "campaign_ref", "experiment_ref", "customer_ref",
  ]) assert.match(MIGRATION, new RegExp(`${column} text`, "i"));
  assert.match(MIGRATION, /customer_ref ~ '\^commerce:\/\/merchant\/[\s\S]+\/customer\/psn_/i);
  assert.match(MIGRATION, /starts_with\(customer_ref, merchant_ref \|\| '\/customer\/psn_'\)/i);
  assert.match(MIGRATION, /value_minor bigint CHECK \(value_minor IS NULL OR value_minor BETWEEN 0 AND 9007199254740991\)/i);
  assert.match(MIGRATION, /public\.lm_commerce_reference_metadata_valid\(metadata\)/i);
  const tableDefinition = MIGRATION.match(/CREATE TABLE IF NOT EXISTS public\.lm_commerce_events \(([\s\S]*?)\n\);/i)[1];
  assert.doesNotMatch(tableDefinition, /\b(?:message|body|email|password|secret|token|credential|raw_content|provider_credentials?)\b/i);
});

test("builder accepts the decision-to-outcome chain plus experiment and consent evidence", () => {
  const chain = [
    event(),
    event({ eventKind: "decision_approved", reasonCode: "owner_approved", idempotencyKey: "chain:2", resultLabel: "approved" }),
    event({ eventKind: "action_enqueued", reasonCode: "approval_present", idempotencyKey: "chain:3", stepRef: REFS.stepRef, resultLabel: "enqueued" }),
    event({ eventKind: "exposure_eligible", reasonCode: "audience_rule_match", idempotencyKey: "chain:4", campaignRef: REFS.campaignRef, customerRef: REFS.customerRef, resultLabel: "eligible" }),
    event({ eventKind: "exposure_delivered", reasonCode: "provider_receipt", idempotencyKey: "chain:5", campaignRef: REFS.campaignRef, customerRef: REFS.customerRef, resultLabel: "delivered" }),
    event({ eventKind: "provider_readback", reasonCode: "provider_observed", idempotencyKey: "chain:6", campaignRef: REFS.campaignRef, customerRef: REFS.customerRef, resultLabel: "read", metadata: { receipt_ref: "receipt://stripe/event/evt_42" } }),
    event({ eventKind: "outcome_observed", reasonCode: "paid_receipt", idempotencyKey: "chain:7", customerRef: REFS.customerRef, resultLabel: "purchase", valueMinor: 1299, currency: "USD" }),
    event({ eventKind: "experiment_assignment", reasonCode: "stable_bucket", idempotencyKey: "chain:8", experimentRef: REFS.experimentRef, customerRef: REFS.customerRef, resultLabel: "assigned" }),
    event({ eventKind: "consent_recorded", reasonCode: "policy_accept", idempotencyKey: "chain:9", customerRef: REFS.customerRef, resultLabel: "consented" }),
  ].map(buildCommerceEvent);

  assert.deepEqual(chain.map((item) => item.event_kind), COMMERCE_EVENT_KINDS);
  assert.equal(chain[6].value_minor, 1299);
  for (const label of ["purchase", "renew", "refund", "cancel", "fail"]) {
    assert.ok(COMMERCE_RESULT_LABELS.includes(label));
  }
});

test("builder rejects secret, identity, and raw-content shaped input before storage", async () => {
  let fetches = 0;
  const ledger = createCommerceEventLedger({
    supaUrl: "https://supa.invalid",
    supaKey: "service-role-test",
    fetchImpl: async () => { fetches += 1; return jsonResponse({}); },
  });
  const unsafe = [
    event({ apiKey: "sk_live_abc123" }),
    event({ metadata: { email: "person@example.test" } }),
    event({ metadata: { message_body: "please buy this" } }),
    event({ metadata: { access_token: "Bearer raw-token" } }),
    event({ customerRef: `${MERCHANT}/customer/person@example.test` }),
    event({ metadata: { note_ref: "vault://tenant/commerce-key" } }),
    event({ metadata: { provider_customer_ref: "provider://stripe/customer/cus_123" } }),
    event({ metadata: { source_ref: "provider://stripe/credential/ref_123" } }),
  ];
  for (const input of unsafe) {
    await assert.rejects(() => ledger.append(input), /privacy|reference-only|customer_ref|metadata/i);
  }
  assert.equal(fetches, 0);
});

test("all durable entity references are merchant-local and customer identity is pseudonymous", () => {
  const otherMerchant = "commerce://merchant/mrc_other";
  for (const [field, ref] of Object.entries(REFS)) {
    assert.throws(
      () => buildCommerceEvent(event({ [field]: ref.replace(MERCHANT, otherMerchant) })),
      /merchant|reference/i,
      `${field} must not cross merchant scope`,
    );
  }
  assert.throws(
    () => buildCommerceEvent(event({ customerRef: `${MERCHANT}/customer/customer_123` })),
    /pseudonymous|customer_ref/i,
  );
});

test("metadata and result value contracts are bounded, explicit, reference-only, and immutable", () => {
  const built = buildCommerceEvent(event());
  assert.ok(Object.isFrozen(built));
  assert.ok(Object.isFrozen(built.metadata));
  assert.throws(() => { built.reason_code = "rewritten"; }, TypeError);
  assert.throws(() => { built.metadata.source_ref = "artifact://changed"; }, TypeError);
  assert.throws(() => buildCommerceEvent(event({ metadata: { note: "artifact://proposal/42" } })), /metadata/i);
  assert.throws(() => buildCommerceEvent(event({ metadata: { note_ref: "plain words" } })), /metadata/i);
  assert.throws(() => buildCommerceEvent(event({
    eventKind: "outcome_observed", customerRef: REFS.customerRef, resultLabel: "converted",
  })), /result_label/i);
  assert.throws(() => buildCommerceEvent(event({
    eventKind: "outcome_observed", customerRef: REFS.customerRef, resultLabel: "success",
    valueMinor: 20, currency: "USD",
  })), /money values/i);
  assert.throws(() => buildCommerceEvent(event({
    eventKind: "outcome_observed", customerRef: REFS.customerRef, resultLabel: "purchase",
    valueMinor: MAX_VALUE_MINOR + 1, currency: "USD",
  })), /value_minor/i);
});

test("store sends one normalized idempotent RPC payload and accepts exact retry readback", async () => {
  const calls = [];
  const ledger = createCommerceEventLedger({
    supaUrl: "https://supa.invalid/",
    supaKey: "service-role-test",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const payload = JSON.parse(init.body).p_event;
      return jsonResponse(storedResponse(payload, false));
    },
  });
  const result = await ledger.append(event());

  assert.equal(result.created, false);
  assert.ok(Object.isFrozen(result.event));
  assert.equal(calls[0].url, "https://supa.invalid/rest/v1/rpc/lm_append_commerce_event");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer service-role-test");
  const request = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(request), ["p_event"]);
  assert.equal(request.p_event.uid, "tenant-1");
  assert.equal(request.p_event.idempotency_key, "workflow:wf_launch:decision:1");
  assert.equal(request.p_event.revision_key, "rev_1");
  assert.equal(request.p_event.metadata.source_ref, "artifact://commerce/proposal/42");
  assert.doesNotMatch(calls[0].init.body, /sk_live|@example|access_token|message_body/i);
});

test("store detects provider collision errors and rejects tenant or merchant readback drift", async () => {
  const collision = createCommerceEventLedger({
    supaUrl: "https://supa.invalid", supaKey: "service-role-test",
    fetchImpl: async () => jsonResponse({ message: "idempotency_collision", details: "internal row" }, 409),
  });
  await assert.rejects(
    () => collision.append(event()),
    (error) => error.code === "idempotency_collision" && !error.message.includes("internal row"),
  );

  for (const drift of [{ uid: "tenant-2" }, { merchant_ref: "commerce://merchant/mrc_other" }]) {
    const ledger = createCommerceEventLedger({
      supaUrl: "https://supa.invalid", supaKey: "service-role-test",
      fetchImpl: async (_url, init) => {
        const payload = JSON.parse(init.body).p_event;
        return jsonResponse(storedResponse(payload, true, drift));
      },
    });
    await assert.rejects(() => ledger.append(event()), /tenant|merchant|payload|boundary/i);
  }
});

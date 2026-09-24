"use strict";
const { test } = require("node:test"); const assert = require("node:assert/strict");
const { createCommercePurchaserEntitlementStore, normalizeInput } = require("./commerce-purchaser-entitlement-store.js");
const OPTS = { supaUrl: "https://supa.invalid", supaKey: "service" };
const BASE = { uid: "u1", merchantRef: "merchant-a", purchaserRef: "buyer-local-7", entitlementRef: "premium", effectiveFrom: "2026-08-31T00:00:00Z", evidenceReference: "provider-event://evt-1", idempotencyKey: "idem-1", revisionKey: "v1", recordedAt: "2026-08-31T00:01:00Z" };
function response(body, status = 200) { return { ok: status < 300, status, json: async () => body }; }

test("desired and independently observed state expose drift only through reconciliation", () => {
  const desired = normalizeInput({ ...BASE, eventKind: "desired", desiredState: "granted", sourceOrderRef: "order-1" });
  const observed = normalizeInput({ ...BASE, eventKind: "observed", observedState: "suspended", providerRef: "provider://stripe/account-local" });
  const reconciliation = normalizeInput({ ...BASE, eventKind: "reconciliation", desiredState: "granted", observedState: "suspended", providerRef: "provider://stripe/account-local", discrepancy: true, reconciliationCaseRef: "case-9" });
  assert.equal(desired.observed_state, null); assert.equal(observed.desired_state, null); assert.equal(reconciliation.discrepancy, true);
  assert.throws(() => normalizeInput({ ...BASE, eventKind: "reconciliation", desiredState: "granted", observedState: "suspended", providerRef: "provider://stripe/account-local" }), /case reference/);
});

test("grant revoke suspend expire states and effective interval/source references are retained", () => {
  for (const [desiredState, normalized] of [["grant", "granted"], ["revoke", "revoked"], ["suspend", "suspended"], ["expire", "expired"]]) assert.equal(normalizeInput({ ...BASE, eventKind: "desired", desiredState }).desired_state, normalized);
  const event = normalizeInput({ ...BASE, eventKind: "desired", desiredState: "revoked", effectiveUntil: "2026-09-01T00:00:00Z", sourceRefundRef: "refund-3" });
  assert.equal(event.source_refund_ref, "refund-3"); assert.equal(event.effective_until, "2026-09-01T00:00:00.000Z");
  assert.throws(() => normalizeInput({ ...BASE, eventKind: "desired", desiredState: "granted", effectiveUntil: "2026-08-30T00:00:00Z" }), /follow/);
});

test("store uses atomic RPC, preserves exact retry, and surfaces collisions", async () => {
  const calls = []; const row = { ...normalizeInput({ ...BASE, eventKind: "desired", desiredState: "granted" }) };
  const store = createCommercePurchaserEntitlementStore({ ...OPTS, fetchImpl: async (url, init) => { calls.push({ url, init }); return response({ created: calls.length === 1, event: row }); } });
  assert.equal((await store.recordDesiredState({ ...BASE, desiredState: "granted" })).created, true);
  assert.equal((await store.recordDesiredState({ ...BASE, desiredState: "granted" })).created, false);
  assert.match(calls[0].url, /rpc\/lm_append_commerce_purchaser_entitlement$/); assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)), ["p_event"]);
  const collision = createCommercePurchaserEntitlementStore({ ...OPTS, fetchImpl: async () => response({ message: "idempotency_collision" }, 409) });
  await assert.rejects(() => collision.recordDesiredState({ ...BASE, desiredState: "revoked" }), (error) => error.code === "idempotency_collision");
});

test("merchant boundary and sensitive identity fields fail closed", async () => {
  assert.throws(() => normalizeInput({ ...BASE, eventKind: "desired", desiredState: "granted", email: "x@example.test" }), /not accepted/);
  const store = createCommercePurchaserEntitlementStore({ ...OPTS, fetchImpl: async () => response({ created: true, event: { ...normalizeInput({ ...BASE, eventKind: "desired", desiredState: "granted" }), merchant_ref: "merchant-b" } }) });
  await assert.rejects(() => store.recordDesiredState({ ...BASE, desiredState: "granted" }), /merchant boundary/);
});

"use strict";
const { test } = require("node:test"); const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path");
const { createCommerceDecisionStore, normalizeDecision } = require("./commerce-decision-store.js");
const OPTS = { supaUrl: "https://supa.invalid", supaKey: "service" };
const BASE = { uid: "u1", merchantRef: "merchant-a", opportunityRef: "opp-7", stateSnapshotReference: "state-snapshot://s-9", candidates: [{ actionRef: "offer-a", actionKind: "discount", disposition: "selected", reasonCode: "highest_expected_net", selectionProbability: 0.7 }, { actionRef: "no-action", actionKind: "none", disposition: "rejected", reasonCode: "lower_expected_net", selectionProbability: 0.3 }], policyVersion: "policy-4", modelVersion: "model-2", approvalReference: "approval://a-1", experimentRef: "exp-5", experimentAssignment: "treatment", holdout: false, outcomeState: "pending", netEconomicsReferences: ["economics://estimate-1"], idempotencyKey: "idem-1", revisionKey: "v1", decidedAt: "2026-08-31T00:00:00Z" };
function response(body, status = 200) { return { ok: status < 300, status, json: async () => body }; }

test("complete selected/rejected candidates carry calibrated probabilities totaling one", () => {
  const decision = normalizeDecision(BASE); assert.equal(decision.candidates.length, 2); assert.equal(decision.candidates[0].selection_probability, 0.7); assert.equal(decision.outcome_state, "pending");
  assert.throws(() => normalizeDecision({ ...BASE, candidates: BASE.candidates.map((candidate) => ({ ...candidate, selectionProbability: 0.8 })) }), /total one/);
  assert.throws(() => normalizeDecision({ ...BASE, candidates: [...BASE.candidates, { ...BASE.candidates[1], selectionProbability: 0 }] }), /unique/);
  assert.throws(() => normalizeDecision({ ...BASE, candidates: BASE.candidates.map((candidate) => ({ ...candidate, disposition: "rejected" })) }), /exactly one/);
});

test("decision preserves snapshot, policy/model, approval, experiment/holdout, unknown outcome, and economics references", () => {
  const decision = normalizeDecision({ ...BASE, outcomeState: "unknown", approvalReference: null, holdout: true, experimentAssignment: "holdout" });
  assert.equal(decision.state_snapshot_reference, "state-snapshot://s-9"); assert.equal(decision.outcome_state, "unknown"); assert.equal(decision.holdout, true); assert.deepEqual(decision.net_economics_references, ["economics://estimate-1"]);
});

test("atomic decision RPC handles duplicate replay, collision, and merchant boundary", async () => {
  const normalized = normalizeDecision(BASE); let count = 0;
  const store = createCommerceDecisionStore({ ...OPTS, fetchImpl: async () => response({ created: count++ === 0, decision: normalized }) });
  assert.equal((await store.appendDecision(BASE)).created, true); assert.equal((await store.appendDecision(BASE)).created, false);
  const collision = createCommerceDecisionStore({ ...OPTS, fetchImpl: async () => response({ message: "idempotency_collision" }, 409) }); await assert.rejects(() => collision.recordDecision(BASE), (error) => error.code === "idempotency_collision");
  const crossed = createCommerceDecisionStore({ ...OPTS, fetchImpl: async () => response({ created: true, decision: { ...normalized, merchant_ref: "merchant-b" } }) }); await assert.rejects(() => crossed.recordDecision(BASE), /merchant boundary/);
});

test("decision migration is append-only, service-only, merchant-scoped, and reference-only", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/2026-08-31-lm-commerce-rights-entitlements-decisions.sql"), "utf8");
  assert.match(sql, /lm_commerce_decisions is append-only/i); assert.match(sql, /UNIQUE \(uid, merchant_ref, idempotency_key, revision_key\)/i); assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.lm_append_commerce_decision\(jsonb\) TO service_role/i);
  assert.doesNotMatch(sql, /\b(email|raw_content|access_token|refresh_token|client_secret|password)\b/i);
});

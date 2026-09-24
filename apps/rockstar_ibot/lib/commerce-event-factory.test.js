"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCommerceEvent } = require("./commerce-event-ledger.js");
const {
  approvalEvidenceRefs,
  workflowDecisionEvent,
  workflowActionEvents,
} = require("./commerce-event-factory.js");

const plan = Object.freeze({
  plan_digest: `sha256:${"a".repeat(64)}`,
  steps: Object.freeze([
    Object.freeze({ step_id: "launch/checkout/stripe", connector_key: "stripe", capability: "payment.checkout.create" }),
    Object.freeze({ step_id: "launch/announce/x", connector_key: "x", capability: "social.publish" }),
  ]),
});
const base = {
  uid: "tenant/with:unsafe_chars",
  workflowId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  plan,
  occurredAt: "2026-08-31T00:00:00Z",
  actorId: "42",
};

test("workflow event factory creates ledger-valid tenant-local proposal and approval evidence", () => {
  const proposed = buildCommerceEvent(workflowDecisionEvent({
    ...base, eventKind: "decision_proposed",
  }));
  const approved = buildCommerceEvent(workflowDecisionEvent({
    ...base, eventKind: "decision_approved",
  }));
  assert.match(proposed.merchant_ref, /^commerce:\/\/merchant\/mrc_[0-9a-f]{24}$/);
  assert.equal(approved.result_label, "approved");
  assert.equal(proposed.workflow_ref, approved.workflow_ref);
  assert.equal(proposed.plan_ref, approved.plan_ref);
  const evidence = approvalEvidenceRefs(base.uid, base.actorId);
  assert.deepEqual(approved.metadata, {
    actor_ref: evidence.actorRef,
    approval_policy_ref: evidence.approvalPolicyRef,
  });
  assert.doesNotMatch(JSON.stringify(approved.metadata), /tenant\/with:unsafe_chars|"42"/);
});

test("one deterministic action event is produced for every selected workflow step", () => {
  const first = workflowActionEvents(base).map(buildCommerceEvent);
  const second = workflowActionEvents(base).map(buildCommerceEvent);
  assert.deepEqual(first, second);
  assert.equal(first.length, plan.steps.length);
  assert.deepEqual(first.map((event) => event.result_label), ["enqueued", "enqueued"]);
  assert.ok(first.every((event) => event.metadata.connector_ref));
  assert.notEqual(first[0].step_ref, first[1].step_ref);
});

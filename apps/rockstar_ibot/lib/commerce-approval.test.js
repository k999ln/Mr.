"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { approveCommerceObject } = require("./commerce-approval.js");
const { createCommerceWorkflowPlan } = require("./commerce-workflow-plan.js");

const UID = "tenant-approval-test";
const WORKFLOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function storeFor(object, paused = false) {
  let row = JSON.parse(JSON.stringify(object));
  return {
    async list(_uid, kind) {
      return kind === "setting" && paused
        ? [{ kind: "setting", data: { paused: true } }]
        : [];
    },
    async get(uid, id) {
      return row.uid === uid && row.id === id ? row : null;
    },
    async transition(uid, id, fromStatus, toStatus, data) {
      if (row.uid !== uid || row.id !== id || row.status !== fromStatus) return null;
      row = { ...row, status: toStatus, data };
      return row;
    },
    current() { return row; },
  };
}

function readyPlan() {
  return createCommerceWorkflowPlan({
    templateKey: "launch_offer",
    deadline: "2026-09-02T12:00:00Z",
    selectedToolKeys: ["stripe", "landing-page", "telegram"],
    inputRefs: {
      goal_ref: "commerce-goal://launch/one",
      offer_ref: "commerce-offer://one",
      stripe_connection_ref: "vault://tenant/stripe",
      stripe_runtime_adapter_ref: "provider://adapter/stripe/v1",
      landing_page_deployment_ref: "managed://landing/page/one",
      landing_page_runtime_adapter_ref: "provider://adapter/landing-page/v1",
      telegram_connection_ref: "managed://telegram/channel/one",
      telegram_runtime_adapter_ref: "provider://adapter/telegram/v1",
    },
  });
}

test("failed fanout stays queueing and retry converges before jobs become authoritative", async () => {
  const plan = readyPlan();
  const store = storeFor({
    id: WORKFLOW_ID,
    uid: UID,
    kind: "workflow",
    status: "approval_required",
    data: { plan, targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  });
  await assert.rejects(() => approveCommerceObject({
    uid: UID, object: store.current(), actorId: "42",
  }, {
    store,
    eventLedger: { append: async () => ({ created: true }) },
    nowMs: Date.parse("2026-08-31T00:00:00Z"),
    enqueueWorkflow: async () => { throw new Error("queue temporarily unavailable"); },
  }), /temporarily unavailable/);
  assert.equal(store.current().status, "queueing");
  assert.match(store.current().data.approvalRef,
    new RegExp(`^commerce-approval://workflow/${WORKFLOW_ID}/sha256/`));

  const calls = [];
  const mismatched = await approveCommerceObject({
    uid: UID, object: store.current(), actorId: "99",
  }, {
    store,
    eventLedger: { append: async () => ({ created: true }) },
    nowMs: Date.parse("2026-08-31T00:01:00Z"),
    enqueueWorkflow: async (_plan, options) => { calls.push(options); },
  });
  assert.equal(mismatched.reason, "actor_mismatch");
  assert.equal(calls.length, 0);

  const retried = await approveCommerceObject({
    uid: UID, object: store.current(), actorId: "42",
  }, {
    store,
    eventLedger: { append: async () => ({ created: true }) },
    nowMs: Date.parse("2026-08-31T00:01:00Z"),
    enqueueWorkflow: async (_plan, options) => { calls.push(options); },
  });
  assert.equal(retried.ok, true);
  assert.equal(store.current().status, "queued");
  assert.equal(calls[0].workflowId, WORKFLOW_ID);
  assert.equal(calls[0].approvalRef, store.current().data.approvalRef);
  assert.match(store.current().data.approvalActorRef,
    /^commerce:\/\/merchant\/mrc_[0-9a-f]{24}\/actor\/psn_[0-9a-f]{32}$/);
  assert.match(store.current().data.approvalPolicyRef,
    /^commerce:\/\/merchant\/mrc_[0-9a-f]{24}\/policy\/pol_telegram_private_chat_owner_v1$/);
});

test("expired reverse plan, pause, and unwired standalone jobs all fail closed", async () => {
  const plan = readyPlan();
  const workflow = {
    id: WORKFLOW_ID, uid: UID, kind: "workflow", status: "approval_required",
    data: { plan, targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  };
  const expiredStore = storeFor(workflow);
  const expired = await approveCommerceObject({ uid: UID, object: workflow, actorId: "42" }, {
    store: expiredStore,
    nowMs: Date.parse("2026-09-03T00:00:00Z"),
  });
  assert.equal(expired.reason, "deadline_expired");
  assert.equal(expiredStore.current().status, "approval_required");

  const pausedStore = storeFor(workflow, true);
  const paused = await approveCommerceObject({ uid: UID, object: workflow, actorId: "42" }, {
    store: pausedStore,
    nowMs: Date.parse("2026-08-31T00:00:00Z"),
  });
  assert.equal(paused.reason, "paused");

  const job = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    uid: UID,
    kind: "job",
    status: "approval_required",
    data: { jobType: "content" },
  };
  const jobStore = storeFor(job);
  const unwired = await approveCommerceObject({ uid: UID, object: job, actorId: "42" }, { store: jobStore });
  assert.equal(unwired.reason, "runtime_not_ready");
  assert.equal(jobStore.current().status, "approval_required");
});

test("missing approval actors fail closed before evidence or queue writes", async () => {
  const workflow = {
    id: WORKFLOW_ID, uid: UID, kind: "workflow", status: "approval_required",
    data: { plan: readyPlan(), targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  };
  const store = storeFor(workflow);
  let appended = 0;
  let enqueued = 0;
  const result = await approveCommerceObject({ uid: UID, object: workflow }, {
    store,
    eventLedger: { append: async () => { appended += 1; } },
    enqueueWorkflow: async () => { enqueued += 1; },
  });
  assert.equal(result.reason, "actor_required");
  assert.equal(store.current().status, "approval_required");
  assert.equal(appended, 0);
  assert.equal(enqueued, 0);
});

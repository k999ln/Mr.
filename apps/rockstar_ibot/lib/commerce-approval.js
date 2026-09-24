"use strict";

const {
  enqueueCommerceWorkflowPlan,
} = require("./commerce-workflow-runtime.js");
const {
  approvalEvidenceRefs,
  workflowDecisionEvent,
  workflowActionEvents,
} = require("./commerce-event-factory.js");

async function commerceIsPaused(store, uid) {
  if (!store || typeof store.list !== "function") {
    throw new Error("commerce pause state unavailable");
  }
  const settings = await store.list(uid, "setting", 1);
  return settings[0]?.data?.paused === true;
}

function approvalInstant(dependencies) {
  return new Date(
    dependencies.nowMs == null ? Date.now() : dependencies.nowMs,
  ).toISOString();
}

function workflowApprovalRef(object, plan) {
  const digest = /^sha256:([0-9a-f]{64})$/.exec(String(plan && plan.plan_digest || ""));
  if (!digest) throw new Error("commerce workflow approval digest invalid");
  return `commerce-approval://workflow/${object.id}/sha256/${digest[1]}`;
}

function workflowDeadlineFeasible(plan, nowMs) {
  const starts = (plan.steps || []).map((step) => Date.parse(step.latest_start_at));
  return starts.length > 0 && starts.every(Number.isFinite) && Math.min(...starts) >= nowMs;
}

async function approveCommerceObject(input, dependencies = {}) {
  const { uid, object, actorId } = input || {};
  const store = dependencies.store;
  if (!uid || !object || !store) throw new Error("commerce approval input invalid");
  let approvalEvidence;
  try {
    approvalEvidence = approvalEvidenceRefs(uid, actorId);
  } catch {
    return { ok: false, reason: "actor_required", object };
  }
  if (object.status === "queued") {
    return object.data?.approvalActorRef === approvalEvidence.actorRef
      && object.data?.approvalPolicyRef === approvalEvidence.approvalPolicyRef
      ? { ok: true, alreadyApproved: true, object }
      : { ok: false, reason: "actor_mismatch", object };
  }
  if (!new Set(["approval_required", "queueing"]).has(object.status)) {
    return { ok: false, reason: "not_approvable", object };
  }
  const paused = dependencies.isCommercePaused
    ? await dependencies.isCommercePaused(uid)
    : await commerceIsPaused(store, uid);
  if (paused) return { ok: false, reason: "paused", object };

  if (object.kind === "workflow") {
    const plan = object.data && object.data.plan;
    if (!plan || plan.ready !== true) {
      return { ok: false, reason: "requirements_missing", object };
    }
    const nowMs = dependencies.nowMs == null ? Date.now() : dependencies.nowMs;
    if (!workflowDeadlineFeasible(plan, nowMs)) {
      return { ok: false, reason: "deadline_expired", object };
    }
    const approvalRef = workflowApprovalRef(object, plan);
    const approvedAt = object.data?.approvedAt || approvalInstant(dependencies);
    const approvalData = {
      ...(object.data || {}),
      approvalRef,
      approvedAt,
      approvalActorRef: object.data?.approvalActorRef || approvalEvidence.actorRef,
      approvalPolicyRef: object.data?.approvalPolicyRef || approvalEvidence.approvalPolicyRef,
    };
    if (approvalData.approvalActorRef !== approvalEvidence.actorRef
        || approvalData.approvalPolicyRef !== approvalEvidence.approvalPolicyRef) {
      return { ok: false, reason: "actor_mismatch", object };
    }
    let queueing = object;
    if (object.status === "approval_required") {
      queueing = typeof store.transition === "function"
        ? await store.transition(uid, object.id, "approval_required", "queueing", approvalData)
        : await store.update(uid, object.id, { status: "queueing", data: approvalData });
      if (!queueing) {
        const latest = await store.get(uid, object.id);
        if (latest && latest.status === "queued") {
          return { ok: true, alreadyApproved: true, object: latest };
        }
        if (!latest || latest.status !== "queueing") {
          return { ok: false, reason: "approval_raced", object: latest || object };
        }
        queueing = latest;
      }
    }
    if (queueing.data?.approvalRef !== approvalRef) {
      return { ok: false, reason: "approval_raced", object: queueing };
    }
    const eventLedger = dependencies.eventLedger;
    if (!eventLedger || typeof eventLedger.append !== "function") {
      throw new Error("commerce approval event ledger unavailable");
    }
    await eventLedger.append(workflowDecisionEvent({
      uid,
      workflowId: object.id,
      targetId: queueing.data.targetId,
      plan,
      occurredAt: approvedAt,
      eventKind: "decision_approved",
      actorId,
    }));
    const enqueue = dependencies.enqueueWorkflow || enqueueCommerceWorkflowPlan;
    await enqueue(plan, {
      tenantId: uid,
      workflowId: object.id,
      approvalRef,
      storeOptions: dependencies.runtimeStoreOptions || {},
    }, dependencies.runtimeDependencies || {});
    const enqueuedAt = approvalInstant(dependencies);
    for (const event of workflowActionEvents({
      uid,
      workflowId: object.id,
      targetId: queueing.data.targetId,
      plan,
      occurredAt: enqueuedAt,
    })) await eventLedger.append(event);
    const queuedData = { ...queueing.data, enqueuedAt };
    const queued = typeof store.transition === "function"
      ? await store.transition(uid, object.id, "queueing", "queued", queuedData)
      : await store.update(uid, object.id, { status: "queued", data: queuedData });
    if (queued) return { ok: true, alreadyApproved: false, object: queued };
    const latest = await store.get(uid, object.id);
    return latest && latest.status === "queued"
      ? { ok: true, alreadyApproved: true, object: latest }
      : { ok: false, reason: "approval_projection_failed", object: latest || queueing };
  } else if (object.kind !== "job") {
    return { ok: false, reason: "not_approvable", object };
  }

  // Standalone draft commands have no typed planner/executor contract yet. They remain proposals;
  // only an integrated workflow can enter the authoritative approval/outbox protocol above.
  return { ok: false, reason: "runtime_not_ready", object };
}

async function cancelCommerceObject(input, dependencies = {}) {
  const { uid, object, actorId } = input || {};
  const store = dependencies.store;
  if (!uid || !object || !store) throw new Error("commerce cancellation input invalid");
  let actorRef;
  try {
    actorRef = approvalEvidenceRefs(uid, actorId).actorRef;
  } catch {
    return { ok: false, reason: "actor_required", object };
  }
  if (object.status === "cancelled") return { ok: true, alreadyCancelled: true, object };
  if (!new Set(["approval_required", "needs_information", "queueing"]).has(object.status)) {
    return { ok: false, reason: "not_cancellable", object };
  }
  const data = {
    ...(object.data || {}),
    cancelledAt: new Date(
      dependencies.nowMs == null ? Date.now() : dependencies.nowMs,
    ).toISOString(),
    cancelledBy: actorRef,
  };
  const updated = typeof store.transition === "function"
    ? await store.transition(uid, object.id, object.status, "cancelled", data)
    : await store.update(uid, object.id, { status: "cancelled", data });
  return updated
    ? { ok: true, alreadyCancelled: false, object: updated }
    : { ok: false, reason: "cancellation_raced", object };
}

module.exports = { commerceIsPaused, approveCommerceObject, cancelCommerceObject };

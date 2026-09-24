"use strict";

const { createHash } = require("node:crypto");

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function planHex(plan) {
  const match = /^sha256:([0-9a-f]{64})$/.exec(String(plan && plan.plan_digest || ""));
  if (!match) throw new Error("commerce event plan digest invalid");
  return match[1];
}

function objectId(value, label) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new Error(`commerce event ${label} invalid`);
  }
  return id;
}

function refsFor(uid, workflowId, targetId, plan) {
  const merchantRef = `commerce://merchant/mrc_${hash(uid).slice(0, 24)}`;
  const hex = planHex(plan);
  const workflow = objectId(workflowId, "workflow id");
  const target = objectId(targetId, "target id");
  return {
    merchantRef,
    targetRef: `${merchantRef}/target/obj_${target}`,
    workflowRef: `${merchantRef}/workflow/wf_${workflow}`,
    planRef: `${merchantRef}/plan/sha256_${hex}`,
    revisionKey: `sha256_${hex}`,
    hex,
  };
}

function approvalEvidenceRefs(uid, actorId) {
  const actor = String(actorId || "").trim();
  if (!/^\d{1,20}$/.test(actor)) throw new Error("commerce approval actor invalid");
  const merchantRef = `commerce://merchant/mrc_${hash(uid).slice(0, 24)}`;
  return Object.freeze({
    actorRef: `${merchantRef}/actor/psn_${hash(`${uid}\u0000telegram\u0000${actor}`).slice(0, 32)}`,
    approvalPolicyRef: `${merchantRef}/policy/pol_telegram_private_chat_owner_v1`,
  });
}

function workflowDecisionEvent(input) {
  const refs = refsFor(input.uid, input.workflowId, input.targetId, input.plan);
  const approved = input.eventKind === "decision_approved";
  if (!approved && input.eventKind !== "decision_proposed") {
    throw new Error("commerce decision event kind invalid");
  }
  const approvalEvidence = approved
    ? approvalEvidenceRefs(input.uid, input.actorId)
    : null;
  return {
    uid: input.uid,
    merchantRef: refs.merchantRef,
    eventKind: input.eventKind,
    reasonCode: approved
      ? "owner_approved_plan"
      : (input.plan.ready ? "workflow_plan_ready" : "workflow_requirements_missing"),
    occurredAt: input.occurredAt,
    idempotencyKey: `workflow:${input.workflowId}:${input.eventKind}`,
    revisionKey: refs.revisionKey,
    targetRef: refs.targetRef,
    workflowRef: refs.workflowRef,
    planRef: refs.planRef,
    ...(approved ? { resultLabel: "approved" } : {}),
    ...(approved ? { metadata: {
      actor_ref: approvalEvidence.actorRef,
      approval_policy_ref: approvalEvidence.approvalPolicyRef,
    } } : {}),
  };
}

function workflowActionEvents(input) {
  const refs = refsFor(input.uid, input.workflowId, input.targetId, input.plan);
  return input.plan.steps.map((step) => {
    const stepLocal = `step_${hash(`${refs.hex}:${step.step_id}`).slice(0, 32)}`;
    return {
      uid: input.uid,
      merchantRef: refs.merchantRef,
      eventKind: "action_enqueued",
      reasonCode: "approved_plan_enqueued",
      occurredAt: input.occurredAt,
      idempotencyKey: `workflow:${input.workflowId}:action:${stepLocal}`,
      revisionKey: refs.revisionKey,
      targetRef: refs.targetRef,
      workflowRef: refs.workflowRef,
      planRef: refs.planRef,
      stepRef: `${refs.merchantRef}/step/${stepLocal}`,
      resultLabel: "enqueued",
      metadata: {
        connector_ref: `commerce://connector/${step.connector_key}`,
        capability_ref: `action://capability/${step.capability}`,
      },
    };
  });
}

module.exports = {
  commerceMerchantRef: (uid) => `commerce://merchant/mrc_${hash(uid).slice(0, 24)}`,
  approvalEvidenceRefs,
  workflowDecisionEvent,
  workflowActionEvents,
};

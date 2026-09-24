"use strict";

const { workflowDecisionEvent } = require("./commerce-event-factory.js");

async function persistCommerceWorkflowProposal(input) {
  const { store, eventLedger, uid, plan, targetId } = input || {};
  if (!store || !eventLedger || !uid || !plan || !targetId) {
    throw new Error("commerce workflow persistence input invalid");
  }
  const occurredAt = new Date(
    input.nowMs == null ? Date.now() : input.nowMs,
  ).toISOString();
  const recording = await store.create(uid, "workflow", "recording_proposal", {
    plan,
    targetId,
  });
  await eventLedger.append(workflowDecisionEvent({
    uid,
    workflowId: recording.id,
    targetId,
    plan,
    occurredAt,
    eventKind: "decision_proposed",
  }));
  const status = plan.ready ? "approval_required" : "needs_information";
  const saved = typeof store.transition === "function"
    ? await store.transition(uid, recording.id, "recording_proposal", status, recording.data)
    : await store.update(uid, recording.id, { status, data: recording.data });
  if (!saved) throw new Error("commerce workflow proposal projection failed");
  return saved;
}

module.exports = { persistCommerceWorkflowProposal };

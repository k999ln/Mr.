"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COMMERCE_WORKFLOW_TEMPLATE_KEYS,
  createCommerceWorkflowPlan,
  isCommerceWorkflowPlan,
} = require("./commerce-workflow-plan.js");

const DEADLINE = "2026-09-01T12:00:00.000Z";

function launchRefs() {
  return {
    goal_ref: "commerce-goal://launch/one",
    offer_ref: "commerce-offer://one",
    stripe_connection_ref: "connection://stripe/main",
    stripe_runtime_adapter_ref: "runtime-adapter://stripe/v1",
    landing_page_deployment_ref: "deployment://landing-page/main",
    landing_page_runtime_adapter_ref: "runtime-adapter://landing-page/v1",
    telegram_connection_ref: "connection://telegram/main",
    telegram_runtime_adapter_ref: "runtime-adapter://telegram/v1",
    x_connection_ref: "connection://x/main",
    x_runtime_adapter_ref: "runtime-adapter://x/v1"
  };
}

test("the four integrated commerce templates are catalogued", () => {
  assert.deepEqual(COMMERCE_WORKFLOW_TEMPLATE_KEYS, [
    "launch_offer", "recover_revenue", "deliver_order", "nurture_customer",
  ]);
});

test("one deterministic goal fans out to every selected relevant tool", () => {
  const input = {
    templateKey: "launch_offer",
    deadline: DEADLINE,
    paid: true,
    selectedToolKeys: ["x", "brain-import", "stripe", "telegram", "landing-page"],
    inputRefs: launchRefs(),
  };
  const first = createCommerceWorkflowPlan(input);
  const reordered = createCommerceWorkflowPlan({
    ...input,
    deadline: "2026-09-01T21:00:00+09:00",
    selectedToolKeys: [...input.selectedToolKeys].reverse(),
    inputRefs: Object.fromEntries(Object.entries(input.inputRefs).reverse()),
  });

  assert.equal(first.plan_id, reordered.plan_id);
  assert.deepEqual(first.relevant_tool_keys, ["landing-page", "stripe", "telegram", "x"]);
  assert.deepEqual(first.irrelevant_tool_keys, ["brain-import"]);
  assert.deepEqual(first.steps.map((step) => step.connector_key), [
    "stripe", "landing-page", "telegram", "x",
  ]);
  assert.equal(first.selection.tool_selection_count, 5);
  assert.equal(first.selection.workflow_run_count, 1);
  assert.equal(first.selection.plan, "paid");
  assert.equal(first.ready, true);
  assert.equal(isCommerceWorkflowPlan(first), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.steps[0]), true);
  assert.throws(() => { first.steps[0].capability = "message.send"; }, TypeError);
});

test("free and paid status never count fanout actions as workflow runs", () => {
  const refs = {
    ...launchRefs(),
    telegram_stars_connection_ref: "connection://telegram-stars/main",
    telegram_stars_runtime_adapter_ref: "runtime-adapter://telegram-stars/v1",
    email_connection_ref: "connection://email/main",
    email_runtime_adapter_ref: "runtime-adapter://email/v1",
    lms_connection_ref: "connection://lms/main",
    lms_runtime_adapter_ref: "runtime-adapter://lms/v1",
  };
  const selectedToolKeys = [
    "stripe", "telegram-stars", "landing-page", "lms", "telegram", "email", "x",
  ];
  const free = createCommerceWorkflowPlan({
    templateKey: "launch_offer", deadline: DEADLINE, selectedToolKeys, inputRefs: refs,
  });
  const paid = createCommerceWorkflowPlan({
    templateKey: "launch_offer", deadline: DEADLINE, selectedToolKeys, inputRefs: refs, paid: true,
  });
  assert.equal(free.selection.tool_selection_count, 7);
  assert.equal(free.selection.workflow_run_count, 1);
  assert.equal(paid.selection.workflow_run_count, 1);
  assert.equal(free.steps.length, 7);
  assert.equal(paid.steps.length, 7);
  assert.equal(free.ready, false);
  assert.ok(free.missing_requirements.some((item) => item.code === "plan_tool_limit_exceeded"));
  assert.equal(paid.missing_requirements.some((item) => item.code === "plan_tool_limit_exceeded"), false);
});

test("reverse planning honors dependencies and computes latest starts", () => {
  const plan = createCommerceWorkflowPlan({
    templateKey: "launch_offer",
    deadline: DEADLINE,
    selectedToolKeys: ["stripe", "landing-page", "telegram"],
    inputRefs: launchRefs(),
  });
  const byPhase = Object.fromEntries(plan.steps.map((step) => [step.phase_key, step]));
  assert.equal(byPhase.announce.latest_start_at, "2026-09-01T11:45:00.000Z");
  assert.equal(byPhase.offer_page.latest_start_at, "2026-09-01T11:20:00.000Z");
  assert.equal(byPhase.checkout.latest_start_at, "2026-09-01T10:50:00.000Z");
  assert.deepEqual(byPhase.offer_page.depends_on, [byPhase.checkout.step_id]);
  assert.deepEqual(byPhase.announce.depends_on, [
    byPhase.checkout.step_id, byPhase.offer_page.step_id,
  ].sort());
});

test("missing business, setup, adapter, and capability requirements are explicit", () => {
  const plan = createCommerceWorkflowPlan({
    templateKey: "launch_offer",
    deadline: DEADLINE,
    selectedToolKeys: ["stripe"],
  });
  assert.equal(plan.ready, false);
  assert.deepEqual(new Set(plan.missing_requirements.map((item) => item.code)), new Set([
    "input_ref_missing",
    "connector_setup_ref_missing",
    "runtime_adapter_ref_missing",
    "required_capability_not_selected",
  ]));
  assert.ok(plan.missing_requirements.some((item) => item.ref_key === "goal_ref"));
  assert.ok(plan.missing_requirements.some((item) => item.ref_key === "stripe_connection_ref"));
  assert.ok(plan.missing_requirements.some((item) => item.ref_key === "stripe_runtime_adapter_ref"));
  assert.ok(plan.missing_requirements.some((item) => item.phase_key === "announce"));
});

test("digest verification rejects a modified serialized plan", () => {
  const plan = createCommerceWorkflowPlan({
    templateKey: "nurture_customer",
    deadline: DEADLINE,
    selectedToolKeys: ["telegram"],
    inputRefs: {
      goal_ref: "goal://one",
      customer_ref: "customer://one",
      content_ref: "content://one",
      telegram_connection_ref: "connection://telegram/main",
    },
  });
  const clone = JSON.parse(JSON.stringify(plan));
  assert.equal(isCommerceWorkflowPlan(clone), true);
  clone.deadline = "2026-09-02T12:00:00.000Z";
  assert.equal(isCommerceWorkflowPlan(clone), false);
});

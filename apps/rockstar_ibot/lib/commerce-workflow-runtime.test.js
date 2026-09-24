"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRuntimeJob } = require("./runtime-job-store.js");
const { createCommerceWorkflowPlan } = require("./commerce-workflow-plan.js");
const {
  compileCommerceWorkflowPlan,
  enqueueCommerceWorkflowPlan,
} = require("./commerce-workflow-runtime.js");

const DEADLINE = "2026-09-01T12:00:00.000Z";
const TENANT = "tenant-commerce-test";

function deliveryPlan() {
  return createCommerceWorkflowPlan({
    templateKey: "deliver_order",
    deadline: DEADLINE,
    selectedToolKeys: ["telegram", "brain-import", "telegram-stars"],
    inputRefs: {
      goal_ref: "commerce-goal://delivery/one",
      order_ref: "commerce-order://one",
      delivery_ref: "commerce-delivery://one",
      telegram_stars_connection_ref: "connection://telegram-stars/main",
      telegram_stars_runtime_adapter_ref: "runtime-adapter://telegram-stars/v1",
      brain_import_artifact_ref: "object://sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      brain_import_runtime_adapter_ref: "runtime-adapter://brain-import/v1",
      telegram_connection_ref: "connection://telegram/main",
      telegram_runtime_adapter_ref: "runtime-adapter://telegram/v1",
    },
  });
}

test("runtime compilation uses the shared builder and reference-only deterministic jobs", () => {
  const calls = [];
  const builder = (input) => {
    calls.push(input);
    return buildRuntimeJob(input);
  };
  const plan = deliveryPlan();
  const first = compileCommerceWorkflowPlan(plan, { tenantId: TENANT }, { buildRuntimeJob: builder });
  const second = compileCommerceWorkflowPlan(plan, { tenantId: TENANT });

  assert.equal(calls.length, plan.steps.length);
  assert.deepEqual(first.jobs, second.jobs);
  assert.equal(first.jobs.length, 3);
  assert.equal(first.status, "compiled_awaiting_runtime_execution");
  assert.equal(first.provider_completion_claimed, false);
  for (const job of first.jobs) {
    assert.ok(Object.keys(job.input_refs).every((key) => /_(?:ref|refs)$/.test(key)));
    assert.match(job.job_id, /^commerce-workflow:tnt_[0-9a-f]{24}:[0-9a-f]{64}:/);
    assert.equal(job.tenant_id, TENANT);
  }
  const importJob = first.jobs.find((job) => job.capability === "knowledge.snapshot.import");
  assert.equal(importJob.effect_class, "none");
  assert.equal(importJob.effect_key, null);
  const noticeJob = first.jobs.find((job) => job.capability === "delivery.notify");
  assert.deepEqual(noticeJob.input_refs.dependency_job_refs, [
    `runtime-job://${importJob.job_id}`,
  ]);
});

test("identical plans compile to tenant-separated opaque job and effect identities", () => {
  const plan = deliveryPlan();
  const first = compileCommerceWorkflowPlan(plan, { tenantId: "tenant-alpha-private" });
  const second = compileCommerceWorkflowPlan(plan, { tenantId: "tenant-beta-private" });
  assert.deepEqual(first.jobs.map((job) => job.capability), second.jobs.map((job) => job.capability));
  for (let index = 0; index < first.jobs.length; index += 1) {
    assert.notEqual(first.jobs[index].job_id, second.jobs[index].job_id);
    assert.doesNotMatch(first.jobs[index].job_id, /tenant-(?:alpha|beta)-private/);
    if (first.jobs[index].effect_key !== null) {
      assert.notEqual(first.jobs[index].effect_key, second.jobs[index].effect_key);
      assert.doesNotMatch(first.jobs[index].effect_key, /tenant-(?:alpha|beta)-private/);
    }
  }
});

test("official provider readback is recorded and completion is never claimed", () => {
  const compiled = compileCommerceWorkflowPlan(deliveryPlan(), { tenantId: TENANT });
  assert.ok(compiled.readback_requirements.some((item) => item.required === true));
  for (const record of compiled.job_records) {
    assert.equal(record.provider_completion_claimed, false);
    if (record.official_readback_requirement.required) {
      assert.equal(record.official_readback_requirement.authority, "provider");
      assert.equal(record.official_readback_requirement.status, "pending");
      assert.equal(record.job.input_refs.readback_policy_ref,
        record.official_readback_requirement.policy_ref);
    }
  }
});

test("approved workflow jobs carry immutable workflow and approval references", () => {
  const workflowId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const plan = deliveryPlan();
  const approvalRef = `commerce-approval://workflow/${workflowId}/sha256/${plan.plan_digest.slice(7)}`;
  const compiled = compileCommerceWorkflowPlan(plan, {
    tenantId: TENANT,
    workflowId,
    approvalRef,
  });
  for (const job of compiled.jobs) {
    assert.equal(job.input_refs.workflow_ref, `commerce-object://workflow/${workflowId}`);
    assert.equal(job.input_refs.approval_ref, approvalRef);
  }
  assert.throws(() => compileCommerceWorkflowPlan(plan, {
    tenantId: TENANT,
    workflowId,
    approvalRef: "commerce-approval://wrong",
  }), /approval reference invalid/);
});

test("enqueue reverse-schedules every step through the injected shared queue", async () => {
  const enqueued = [];
  const result = await enqueueCommerceWorkflowPlan(deliveryPlan(), {
    tenantId: TENANT,
    storeOptions: { query: "injected-store-marker" },
  }, {
    enqueueJobAt: async (job, availableAt, storeOptions) => {
      enqueued.push({ job, availableAt, storeOptions });
      return { created: true, job };
    },
  });
  assert.equal(enqueued.length, 3);
  assert.deepEqual(enqueued.map((item) => item.job), result.jobs);
  assert.deepEqual(
    enqueued.map((item) => item.availableAt),
    compileCommerceWorkflowPlan(deliveryPlan(), { tenantId: TENANT })
      .job_records.map((record) => record.latest_start_at),
  );
  assert.equal(enqueued[0].storeOptions.query, "injected-store-marker");
  assert.equal(result.status, "enqueued_awaiting_official_readback");
  assert.equal(result.provider_completion_claimed, false);
});

test("runtime fails closed before build or enqueue when requirements are missing", async () => {
  const plan = createCommerceWorkflowPlan({
    templateKey: "recover_revenue",
    deadline: DEADLINE,
    selectedToolKeys: ["telegram"],
    inputRefs: { telegram_connection_ref: "connection://telegram/main" },
  });
  let builds = 0;
  let enqueues = 0;
  assert.throws(() => compileCommerceWorkflowPlan(plan, { tenantId: TENANT }, {
    buildRuntimeJob: () => { builds += 1; },
  }), (error) => {
    assert.equal(error.code, "commerce_workflow_requirements_missing");
    assert.ok(error.missing_requirements.length > 0);
    return true;
  });
  await assert.rejects(enqueueCommerceWorkflowPlan(plan, { tenantId: TENANT }, {
    enqueueJob: async () => { enqueues += 1; },
  }), /requirements missing/);
  assert.equal(builds, 0);
  assert.equal(enqueues, 0);
});

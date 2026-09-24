"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DORAEMON_POLICY,
  inspectDoraemonJob,
  classifyExecutionFailure,
  runWithDoraemonSafetyGate,
  normalizeSafetyReport,
  decorateSafetyResult,
} = require("./doraemon-safety-gate.js");

function featureJob(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    uid: "lm_tg_100",
    job_kind: "doraemon_feature",
    feature_key: "nurture",
    mode: "read-only",
    prompt: "返信案を作る",
    ...overrides,
  };
}

test("Core-owned policy cannot be weakened by job fields", () => {
  const inspected = inspectDoraemonJob(featureJob({
    safety_policy: { maxAttempts: 99, screenImpact: "full", browserAccess: "headed" },
    execution_surface: "interactive_handoff",
  }));
  assert.equal(inspected.allowed, true);
  assert.strictEqual(inspected.policy, DORAEMON_POLICY);
  assert.equal(inspected.policy.maxAttempts, 2);
  assert.equal(inspected.policy.screenImpact, "none");
  assert.equal(inspected.policy.browserAccess, "denied");
  assert.equal(inspected.policy.externalEffect, "denied");
  assert.equal(Object.isFrozen(inspected.policy), true);
});

test("Doraemon jobs cannot request workspace write or an invalid feature", async () => {
  for (const job of [
    featureJob({ mode: "workspace-write" }),
    featureJob({ feature_key: "unknown" }),
    featureJob({ uid: "" }),
  ]) {
    let executions = 0;
    const result = await runWithDoraemonSafetyGate(job, async () => { executions += 1; });
    assert.equal(executions, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.safety.failureCode, "policy_violation");
    assert.equal(result.safety.screenImpact, "none");
  }
});

test("retryable draft failure gets one fresh isolated retry and records recovery", async () => {
  const contexts = [];
  const waits = [];
  const result = await runWithDoraemonSafetyGate(featureJob(), async (_job, context) => {
    contexts.push(context);
    if (contexts.length === 1) {
      return { status: "failed", result: "upstream unavailable", failureCode: "upstream_unavailable", exitCode: 1 };
    }
    return { status: "completed", result: "返信案ができました", exitCode: 0 };
  }, {
    retryDelayMs: 25,
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.equal(contexts.length, 2);
  assert.deepEqual(contexts.map((context) => context.attempt), [1, 2]);
  assert.ok(contexts.every((context) => context.policy.retrySurface === "fresh_isolated_codex"));
  assert.deepEqual(waits, [25]);
  assert.equal(result.status, "completed");
  assert.equal(result.safety.recoveryState, "recovered");
  assert.equal(result.safety.attempts, 2);
  assert.equal(result.safety.screenImpact, "none");
});

test("transient failures open the circuit after the bounded second attempt", async () => {
  let executions = 0;
  const result = await runWithDoraemonSafetyGate(featureJob(), async () => {
    executions += 1;
    return { status: "failed", result: "timeout", failureCode: "timeout", exitCode: 1 };
  }, { retryDelayMs: 0, wait: async () => {} });
  assert.equal(executions, 2);
  assert.equal(result.status, "failed");
  assert.equal(result.safety.recoveryState, "safe_stopped");
  assert.equal(result.safety.attempts, 2);
});

test("unknown effects and authentication challenges are never retried", async () => {
  for (const [failureCode, expectedState] of [
    ["unknown_effect", "safe_stopped"],
    ["authentication_required", "human_required"],
    ["challenge_required", "human_required"],
  ]) {
    let executions = 0;
    const result = await runWithDoraemonSafetyGate(featureJob(), async () => {
      executions += 1;
      return { status: "failed", result: "止まりました", failureCode, exitCode: 1 };
    }, { retryDelayMs: 0, wait: async () => {} });
    assert.equal(executions, 1);
    assert.equal(result.safety.recoveryState, expectedState);
    assert.equal(result.safety.failureCode, failureCode);
  }
});

test("failure classification is explicit and uncertain failures stop", () => {
  assert.equal(classifyExecutionFailure({ timedOut: true }), "timeout");
  assert.equal(classifyExecutionFailure({ errorCode: "ENOSPC" }), "resource_exhausted");
  assert.equal(classifyExecutionFailure({ diagnostics: "CAPTCHA verification challenge" }), "challenge_required");
  assert.equal(classifyExecutionFailure({ diagnostics: "something odd happened" }), "execution_failed");
});

test("Core rejects safety receipts that claim browser or screen access", () => {
  const valid = {
    policyVersion: "avocadomini-safety-v1",
    attempts: 2,
    recoveryState: "recovered",
    failureCode: null,
    executionSurface: "isolated_codex",
    screenImpact: "none",
    browserAccess: "denied",
    externalEffect: "denied",
  };
  assert.equal(normalizeSafetyReport(featureJob(), valid, "completed").recoveryState, "recovered");
  assert.throws(() => normalizeSafetyReport(featureJob(), { ...valid, browserAccess: "headed" }, "completed"), /invalid/);
  assert.throws(() => normalizeSafetyReport(featureJob(), { ...valid, screenImpact: "full" }, "completed"), /invalid/);
  assert.match(decorateSafetyResult("完成しました", valid), /自動修復.*画面操作・外部操作は0件/);
});

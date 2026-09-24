"use strict";

const { FEATURE_KEYS } = require("./doraemon-feature-selection.js");

const POLICY_VERSION = "avocadomini-safety-v1";
const MAX_ATTEMPTS = 2;
const DORAEMON_JOB_KINDS = new Set(["doraemon_feature", "doraemon_command"]);
const RETRYABLE_FAILURES = new Set([
  "timeout",
  "network_transient",
  "rate_limited",
  "upstream_unavailable",
]);
const HUMAN_REQUIRED_FAILURES = new Set([
  "authentication_required",
  "challenge_required",
  "permission_required",
  "executor_unavailable",
]);
const KNOWN_FAILURES = new Set([
  ...RETRYABLE_FAILURES,
  ...HUMAN_REQUIRED_FAILURES,
  "execution_failed",
  "invalid_result",
  "invalid_request",
  "policy_violation",
  "resource_exhausted",
  "unknown_effect",
]);

const DORAEMON_POLICY = Object.freeze({
  version: POLICY_VERSION,
  executionSurface: "isolated_codex",
  retrySurface: "fresh_isolated_codex",
  screenImpact: "none",
  browserAccess: "denied",
  externalEffect: "denied",
  maxAttempts: MAX_ATTEMPTS,
});

function isDoraemonJob(job) {
  return Boolean(job) && DORAEMON_JOB_KINDS.has(job.job_kind);
}

function inspectDoraemonJob(job) {
  if (!isDoraemonJob(job)) return Object.freeze({ protected: false, allowed: true, policy: null });
  const featureValid = job.job_kind === "doraemon_command"
    ? job.feature_key == null
    : FEATURE_KEYS.includes(String(job.feature_key || ""));
  const allowed = job.mode === "read-only" && Boolean(String(job.uid || "").trim()) && featureValid;
  return Object.freeze({
    protected: true,
    allowed,
    failureCode: allowed ? null : "policy_violation",
    policy: DORAEMON_POLICY,
  });
}

function classifyExecutionFailure(input = {}) {
  const explicit = String(input.failureCode || "").trim();
  if (KNOWN_FAILURES.has(explicit)) return explicit;
  if (input.timedOut === true) return "timeout";
  const errorCode = String(input.errorCode || "").trim().toUpperCase();
  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"].includes(errorCode)) {
    return "network_transient";
  }
  if (errorCode === "ENOENT") return "executor_unavailable";
  if (["ENOSPC", "ENOMEM", "EMFILE", "ENFILE"].includes(errorCode)) return "resource_exhausted";

  // Diagnostics come from the Codex process, not from the untrusted user prompt. Keep the
  // matching narrow: an uncertain failure is stopped instead of being retried blindly.
  const diagnostics = String(input.diagnostics || "").slice(0, 4_000);
  if (/\b(?:captcha|two[- ]factor|2fa|verification challenge)\b/i.test(diagnostics)) return "challenge_required";
  if (/\b(?:unauthori[sz]ed|sign[ -]?in required|login required|invalid credentials?|expired credentials?)\b|\b401\b/i.test(diagnostics)) {
    return "authentication_required";
  }
  if (/\b(?:forbidden|permission denied|access denied)\b|\b403\b/i.test(diagnostics)) return "permission_required";
  if (/\b(?:rate limit|too many requests)\b|\b429\b/i.test(diagnostics)) return "rate_limited";
  if (/\b(?:bad gateway|service unavailable|gateway timeout|temporarily unavailable)\b|\b(?:502|503|504)\b/i.test(diagnostics)) {
    return "upstream_unavailable";
  }
  if (/\b(?:timed? out|timeout)\b|\bETIMEDOUT\b/i.test(diagnostics)) return "timeout";
  return "execution_failed";
}

function normalizeExecutionResult(value) {
  const input = value && typeof value === "object" ? value : {};
  const status = input.status === "completed" ? "completed" : "failed";
  const rawResult = String(input.result || "").trim();
  const validCompleted = status === "completed" && rawResult.length > 0;
  return {
    status: validCompleted ? "completed" : "failed",
    result: rawResult || "安全装置が有効な状態で処理を完了できませんでした。",
    exitCode: Number.isSafeInteger(input.exitCode) ? input.exitCode : null,
    codexSessionId: input.codexSessionId == null ? null : String(input.codexSessionId).slice(0, 200),
    failureCode: validCompleted ? null : classifyExecutionFailure({
      failureCode: rawResult ? input.failureCode : "invalid_result",
      errorCode: input.errorCode,
      timedOut: input.timedOut,
      diagnostics: input.diagnostics,
    }),
  };
}

function recoveryDecision(result, attempt, policy = DORAEMON_POLICY) {
  if (result.status === "completed") return attempt > 1 ? "recovered" : "none";
  if (RETRYABLE_FAILURES.has(result.failureCode) && attempt < policy.maxAttempts) return "retry";
  if (HUMAN_REQUIRED_FAILURES.has(result.failureCode)) return "human_required";
  return "safe_stopped";
}

function safetyReport(attempts, recoveryState, failureCode = null) {
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    attempts,
    recoveryState,
    failureCode,
    executionSurface: DORAEMON_POLICY.executionSurface,
    screenImpact: DORAEMON_POLICY.screenImpact,
    browserAccess: DORAEMON_POLICY.browserAccess,
    externalEffect: DORAEMON_POLICY.externalEffect,
  });
}

async function runWithDoraemonSafetyGate(job, execute, options = {}) {
  if (typeof execute !== "function") throw new Error("doraemon executor invalid");
  const inspection = inspectDoraemonJob(job);
  if (!inspection.protected) return execute(job);
  if (!inspection.allowed) {
    return {
      status: "failed",
      result: "Safety Gateが安全条件を満たさない依頼を停止しました。",
      exitCode: null,
      codexSessionId: null,
      safety: safetyReport(0, "safe_stopped", inspection.failureCode),
    };
  }

  const wait = typeof options.wait === "function"
    ? options.wait
    : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const retryDelayMs = Number.isSafeInteger(options.retryDelayMs)
    ? Math.max(0, Math.min(10_000, options.retryDelayMs))
    : 1_000;

  for (let attempt = 1; attempt <= inspection.policy.maxAttempts; attempt += 1) {
    let result;
    try {
      result = normalizeExecutionResult(await execute(job, { attempt, policy: inspection.policy }));
    } catch (error) {
      result = normalizeExecutionResult({
        status: "failed",
        result: "隔離実行を開始できませんでした。",
        errorCode: error && error.code,
        diagnostics: error && error.message,
      });
    }
    const decision = recoveryDecision(result, attempt, inspection.policy);
    if (decision === "retry") {
      await wait(retryDelayMs * attempt);
      continue;
    }
    return {
      status: result.status,
      result: result.result.slice(0, 16_000),
      exitCode: result.exitCode,
      codexSessionId: result.codexSessionId,
      safety: safetyReport(attempt, decision, result.failureCode),
    };
  }
  throw new Error("doraemon safety gate exhausted without a decision");
}

function normalizeSafetyReport(job, value, status) {
  if (!isDoraemonJob(job)) return null;
  // Accept a result from the pre-Safety-Gate bridge during a rolling update. It gets no recovery
  // claim or badge; the ordinary failed/completed handling remains intact.
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("doraemon safety report invalid");
  const attempts = Number(value.attempts);
  const recoveryState = String(value.recoveryState || "");
  const failureCode = value.failureCode == null ? null : String(value.failureCode);
  const fixedPolicy = value.policyVersion === POLICY_VERSION
    && value.executionSurface === DORAEMON_POLICY.executionSurface
    && value.screenImpact === "none"
    && value.browserAccess === "denied"
    && value.externalEffect === "denied";
  const attemptValid = Number.isSafeInteger(attempts) && attempts >= 0 && attempts <= MAX_ATTEMPTS;
  const successValid = status === "completed"
    && ((recoveryState === "none" && attempts === 1) || (recoveryState === "recovered" && attempts >= 2))
    && failureCode == null;
  const failureValid = status === "failed"
    && ["human_required", "safe_stopped"].includes(recoveryState)
    && KNOWN_FAILURES.has(failureCode)
    && (attempts > 0 || failureCode === "policy_violation");
  if (!fixedPolicy || !attemptValid || (!successValid && !failureValid)) {
    throw new Error("doraemon safety report invalid");
  }
  return Object.freeze({ ...value, attempts, recoveryState, failureCode });
}

function failureGuidance(code) {
  if (code === "authentication_required") return "ログイン状態を確認してください。自動で認証情報を触ることはしません。";
  if (code === "challenge_required") return "CAPTCHAまたは2段階認証が必要です。本人の操作後に再開してください。";
  if (code === "permission_required") return "権限の確認が必要です。自動で権限を広げることはしません。";
  if (code === "executor_unavailable") return "実行環境の確認が必要です。別の画面を勝手に開くことはしません。";
  if (code === "resource_exhausted") return "実行環境の空き容量やメモリを確認してください。";
  if (code === "unknown_effect") return "外部で処理済みか判断できないため、重複防止のため再実行していません。";
  if (code === "policy_violation") return "安全条件に合わないため実行していません。";
  return "原因を安全に特定できないため、重複や誤操作を避けて停止しました。";
}

function decorateSafetyResult(result, report) {
  const body = String(result || "").trim();
  if (!report) return body;
  let heading = "";
  if (report.recoveryState === "recovered") {
    heading = `🛡️ Safety Gateが隔離環境で自動修復しました（${report.attempts}回目で完了）。画面操作・外部操作は0件です。`;
  } else if (report.recoveryState === "human_required") {
    heading = `🛡️ Safety Gateが安全停止しました。${failureGuidance(report.failureCode)}`;
  } else if (report.recoveryState === "safe_stopped") {
    heading = `🛡️ Safety Gateが安全停止しました。${failureGuidance(report.failureCode)}`;
  }
  return `${heading}${heading && body ? "\n\n" : ""}${body}`.slice(0, 16_000);
}

module.exports = {
  POLICY_VERSION,
  MAX_ATTEMPTS,
  DORAEMON_POLICY,
  RETRYABLE_FAILURES,
  HUMAN_REQUIRED_FAILURES,
  isDoraemonJob,
  inspectDoraemonJob,
  classifyExecutionFailure,
  normalizeExecutionResult,
  recoveryDecision,
  runWithDoraemonSafetyGate,
  normalizeSafetyReport,
  decorateSafetyResult,
};

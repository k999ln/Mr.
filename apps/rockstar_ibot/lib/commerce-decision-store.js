"use strict";

const OUTCOMES = new Set(["pending", "unknown", "succeeded", "failed", "cancelled"]);
const FORBIDDEN = new Set(["email", "rawcontent", "token", "accesstoken", "refreshtoken", "credential", "credentials", "secret", "password"]);
class CommerceDecisionStoreError extends Error { constructor(code, message, details = {}) { super(message || code); this.name = "CommerceDecisionStoreError"; this.code = code; Object.assign(this, details); } }
function fail(code, message, details) { throw new CommerceDecisionStoreError(code, message, details); }
function text(value, name, max = 256, nullable = false) { if (nullable && (value == null || value === "")) return null; const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > max) fail(`invalid_${name}`, `${name} is required`); return result; }
function instant(value, name) { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) fail(`invalid_${name}`, `${name} must be an instant`); return date.toISOString(); }
function normalizeCandidates(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail("invalid_candidates", "complete candidate actions are required");
  const seen = new Set(); let selected = 0; let total = 0;
  const candidates = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("invalid_candidate", "candidate must be an object");
    for (const key of Object.keys(item)) if (FORBIDDEN.has(key.replace(/[^A-Za-z]/g, "").toLowerCase())) fail("forbidden_sensitive_field", `${key} is not accepted`);
    const actionRef = text(item.actionRef ?? item.action_ref, "action_ref"); if (seen.has(actionRef)) fail("duplicate_candidate", "candidate action references must be unique"); seen.add(actionRef);
    const disposition = item.disposition; if (disposition !== "selected" && disposition !== "rejected") fail("invalid_disposition", "candidate disposition must be selected or rejected");
    if (disposition === "selected") selected += 1;
    const probability = item.selectionProbability ?? item.selection_probability;
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) fail("invalid_selection_probability", "selection probabilities must be between zero and one");
    total += probability;
    return { action_ref: actionRef, action_kind: text(item.actionKind ?? item.action_kind, "action_kind"), disposition, reason_code: text(item.reasonCode ?? item.reason_code, "reason_code"), selection_probability: probability };
  });
  if (selected !== 1) fail("invalid_selected_candidates", "exactly one candidate must be selected");
  if (Math.abs(total - 1) > 1e-9) fail("invalid_probability_total", "candidate selection probabilities must total one");
  return candidates;
}
function normalizeDecision(input) {
  const value = input || {}; for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key.replace(/[^A-Za-z]/g, "").toLowerCase())) fail("forbidden_sensitive_field", `${key} is not accepted`);
    if (typeof value[key] === "string" && /^[^\s@]+@[^\s@]+$/.test(value[key])) fail("forbidden_sensitive_value", `${key} must be an opaque merchant-local reference`);
  }
  const outcome = value.outcomeState ?? value.outcome_state ?? "pending"; if (!OUTCOMES.has(outcome)) fail("invalid_outcome_state", "outcomeState is invalid");
  const refs = value.netEconomicsReferences ?? value.net_economics_references;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 20) fail("invalid_net_economics_references", "net economics references are required");
  const economics = [...new Set(refs.map((ref) => text(ref, "net_economics_reference", 512)))]; if (economics.length !== refs.length) fail("duplicate_net_economics_reference", "net economics references must be unique");
  const holdout = value.holdout === true; const experimentRef = text(value.experimentRef ?? value.experiment_ref, "experiment_ref", 256, true); const assignment = text(value.experimentAssignment ?? value.experiment_assignment, "experiment_assignment", 256, true);
  if ((experimentRef == null) !== (assignment == null)) fail("invalid_experiment_assignment", "experiment reference and assignment must appear together");
  return { uid: text(value.uid, "uid"), merchant_ref: text(value.merchantRef ?? value.merchant_ref, "merchant_ref"), opportunity_ref: text(value.opportunityRef ?? value.opportunity_ref, "opportunity_ref"), state_snapshot_reference: text(value.stateSnapshotReference ?? value.state_snapshot_reference, "state_snapshot_reference", 512), candidates: normalizeCandidates(value.candidates), policy_version: text(value.policyVersion ?? value.policy_version, "policy_version"), model_version: text(value.modelVersion ?? value.model_version, "model_version"), approval_reference: text(value.approvalReference ?? value.approval_reference, "approval_reference", 512, true), experiment_ref: experimentRef, experiment_assignment: assignment, holdout, outcome_state: outcome, outcome_reference: text(value.outcomeReference ?? value.outcome_reference, "outcome_reference", 512, true), net_economics_references: economics, idempotency_key: text(value.idempotencyKey ?? value.idempotency_key, "idempotency_key"), revision_key: text(value.revisionKey ?? value.revision_key, "revision_key"), decided_at: instant(value.decidedAt ?? value.decided_at, "decided_at") };
}
function createCommerceDecisionStore(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, ""); const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY; const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") fail("storage_unavailable", "Supabase service credentials are required");
  async function appendDecision(input) {
    const decision = normalizeDecision(input); const response = await fetchImpl(`${supaUrl}/rest/v1/rpc/lm_append_commerce_decision`, { method: "POST", headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_decision: decision }) }).catch(() => null); const body = response && await response.json().catch(() => null);
    if (!response || !response.ok) fail(body && body.message === "idempotency_collision" ? "idempotency_collision" : "storage_error", "decision write failed", { status: response && response.status });
    const row = body && body.decision; if (!row || row.uid !== decision.uid || row.merchant_ref !== decision.merchant_ref) fail("storage_error", "decision write crossed the merchant boundary"); return Object.freeze({ created: body.created === true, decision: Object.freeze(row) });
  }
  return Object.freeze({ appendDecision, recordDecision: appendDecision });
}
module.exports = { OUTCOMES, CommerceDecisionStoreError, normalizeCandidates, normalizeDecision, createCommerceDecisionStore, createStore: createCommerceDecisionStore };

"use strict";

const { FEATURE_KEYS } = require("./doraemon-feature-selection.js");

const VALUE_UNITS = Object.freeze({
  request: "tasks", course: "sections", check: "issues", store: "improvements", promote: "campaigns",
  nurture: "opportunities", pay: "yen", deliver: "orders", measure: "yen", split: "yen",
});

function buildValueGate(input = {}) {
  const featureKey = String(input.featureKey || "");
  if (!FEATURE_KEYS.includes(featureKey)) throw new Error("value_gate_feature_invalid");
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.filter((value) => typeof value === "string" && /^[a-z]+:\/\/[A-Za-z0-9._~:/@+-]{1,500}$/.test(value)))]
    : [];
  if (evidenceRefs.length === 0) throw new Error("value_gate_evidence_required");
  const quantity = Number(input.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("value_gate_quantity_invalid");
  const amountYen = input.amountYen == null ? null : Number(input.amountYen);
  if (amountYen != null && (!Number.isSafeInteger(amountYen) || amountYen < 0)) throw new Error("value_gate_amount_invalid");

  return Object.freeze({
    featureKey,
    status: "verified_preview",
    quantity,
    unit: VALUE_UNITS[featureKey],
    amountYen,
    evidenceCount: evidenceRefs.length,
    evidenceRefs: Object.freeze(evidenceRefs),
    preview: Object.freeze({ quantity, amountYen, evidenceCount: evidenceRefs.length }),
    disclosureRequiresPurchase: true,
    executionRequiresPurchase: true,
    purchaseRequiresExplicitApproval: true,
    automaticCharge: false,
  });
}

function authorizeValueAccess(gate, input = {}) {
  if (!gate || gate.status !== "verified_preview") throw new Error("value_gate_invalid");
  if (input.paid !== true) return Object.freeze({ allowed: false, reason: "purchase_required", preview: gate.preview });
  if (input.explicitApproval !== true) return Object.freeze({ allowed: false, reason: "explicit_approval_required", preview: gate.preview });
  return Object.freeze({ allowed: true, reason: "paid_and_approved", evidenceRefs: gate.evidenceRefs });
}

module.exports = { VALUE_UNITS, buildValueGate, authorizeValueAccess };

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildValueGate, authorizeValueAccess } = require("./doraemon-value-gate.js");

test("all ten features can create evidence-backed free previews", () => {
  for (const featureKey of ["request","course","check","store","promote","nurture","pay","deliver","measure","split"]) {
    const gate = buildValueGate({ featureKey, quantity: 3, amountYen: 43000, evidenceRefs: [`receipt://${featureKey}/1`] });
    assert.equal(gate.preview.amountYen, 43000);
    assert.equal(gate.automaticCharge, false);
    assert.equal(authorizeValueAccess(gate, { paid: false, explicitApproval: true }).reason, "purchase_required");
    assert.equal(authorizeValueAccess(gate, { paid: true, explicitApproval: false }).reason, "explicit_approval_required");
    assert.equal(authorizeValueAccess(gate, { paid: true, explicitApproval: true }).allowed, true);
  }
});

test("unverified or empty results can never become a payment gate", () => {
  assert.throws(() => buildValueGate({ featureKey: "pay", quantity: 1, amountYen: 43000 }), /evidence_required/);
  assert.throws(() => buildValueGate({ featureKey: "pay", quantity: 0, evidenceRefs: ["receipt://pay/1"] }), /quantity_invalid/);
});

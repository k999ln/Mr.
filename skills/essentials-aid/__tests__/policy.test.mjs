import test from "node:test";
import assert from "node:assert/strict";
import { createProcurementPlan, validateAidRequest } from "../lib/policy.mjs";

const validRequest = {
  request_id: "aid-1",
  recipient_ref: "recipient:vault:42",
  source_ref: "referral:partner:7",
  recipient_consent_ref: "consent:vault:14",
  evidence_refs: ["evidence:vault:91"],
  delivery_ref: "delivery:vault:13",
  delivery_method: "vendor_direct",
  items: [{ category: "food", description: "Seven-day staple food box", quantity: 1 }],
};

test("accepts a privacy-minimized essential-goods request", () => {
  const result = validateAidRequest(validRequest);
  assert.equal(result.ok, true);
  assert.equal(result.request.recipient_cash_transfer, "prohibited");
  assert.equal(result.request.decision_owner, "authorized_human_or_partner");
});

test("rejects every cash-like category and recipient payment instrument", () => {
  for (const category of ["cash", "bank_transfer", "crypto", "gift_card", "prepaid_card", "unrestricted_voucher"]) {
    const result = validateAidRequest({
      ...validRequest,
      wallet: "recipient-wallet",
      items: [{ category, description: "cash substitute", quantity: 1 }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("cash_like_prohibited")));
    assert.ok(result.errors.includes("recipient_payment_instrument_prohibited"));
  }
});

test("requires recipient consent, rejects a raw address, and requires a private delivery reference", () => {
  const result = validateAidRequest({ ...validRequest, recipient_consent_ref: "", delivery_ref: "", address: "raw address" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("recipient_consent_ref_required"));
  assert.ok(result.errors.includes("private_delivery_ref_required"));
  assert.ok(result.errors.includes("raw_delivery_address_prohibited"));
});

test("requires human approval and a verified vendor before procurement", () => {
  const unapproved = createProcurementPlan(validRequest, {});
  assert.equal(unapproved.ok, false);
  assert.ok(unapproved.errors.includes("authorized_approver_required"));

  const approved = createProcurementPlan(validRequest, {
    approved_by: "partner:reviewer:2",
    approver_role: "authorized_partner",
    approval_ref: "approval:vault:5",
    need_assessment_ref: "assessment:vault:6",
    vendor_id: "vendor:verified:11",
    vendor_verification_ref: "vendor-check:vault:12",
  });
  assert.equal(approved.ok, true);
  assert.equal(approved.plan.payment_destination, "verified_vendor_only");
  assert.equal(approved.plan.approver_role, "authorized_partner");
  assert.deepEqual(approved.plan.required_receipts, ["purchase", "dispatch_or_appointment", "receipt_or_exception"]);
});

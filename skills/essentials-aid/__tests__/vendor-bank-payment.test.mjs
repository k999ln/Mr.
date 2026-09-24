import test from "node:test";
import assert from "node:assert/strict";
import { createProcurementPlan } from "../lib/policy.mjs";
import { createVendorBankPaymentRequest } from "../lib/vendor-bank-payment.mjs";
import { submitBulkTransfer, validatePaymentContext } from "../../ubi/gmo-furikomi.mjs";

const request = {
  request_id: "aid-1",
  recipient_ref: "recipient:vault:42",
  source_ref: "referral:partner:7",
  recipient_consent_ref: "consent:vault:14",
  evidence_refs: ["evidence:vault:91"],
  delivery_ref: "delivery:vault:13",
  delivery_method: "vendor_direct",
  items: [{ category: "food", description: "Seven-day staple food box", quantity: 1 }],
};

const plan = createProcurementPlan(request, {
  approved_by: "partner:reviewer:2",
  approver_role: "authorized_partner",
  approval_ref: "approval:vault:5",
  need_assessment_ref: "assessment:vault:6",
  vendor_id: "vendor:verified:11",
  vendor_verification_ref: "vendor-check:vault:12",
}).plan;

const payment = {
  amount_jpy: 5000,
  account_id: "KAI-ACCOUNT",
  remitter_name: "KAI",
  transfer_designated_date: "20260829",
  procurement_plan_ref: "procurement:vault:30",
  verified_vendor_id: "vendor:verified:11",
  payee_verification_ref: "payee-check:vault:31",
  idempotency_key: "vendor-payment-aid-1-v1",
  bank: {
    bankCode: "0005",
    branchCode: "001",
    accountNumber: "1234567",
    beneficiaryName: "VENDOR",
  },
};

test("creates an authorized vendor-only bank-transfer request from an approved procurement plan", () => {
  const result = createVendorBankPaymentRequest(plan, payment);
  assert.equal(result.ok, true);
  assert.equal(result.request.paymentContext.purpose, "verified_vendor_procurement");
  assert.equal(result.request.paymentContext.vendor_id, plan.vendor_id);
  assert.equal(result.request.paymentContext.payee_id, plan.vendor_id);
  assert.equal(result.request.totalAmount, "5000");
  assert.equal(result.persistence_rule, "bank_details_execution_boundary_only");
});

test("retained bank submitter accepts authorized vendor context and strips internal authority metadata", async () => {
  const result = createVendorBankPaymentRequest(plan, payment);
  let postedBody;
  const fetchImpl = async (_url, init) => {
    postedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ apptransferNo: "sandbox-1" }) };
  };
  const response = await submitBulkTransfer(result.request, "sandbox-token", "https://bank.invalid", { fetchImpl });
  assert.equal(response.apptransferNo, "sandbox-1");
  assert.equal(postedBody.paymentContext, undefined);
  assert.equal(postedBody.idempotencyKey, undefined);
});

test("recipient-support bank payout remains prohibited before any transport call", async () => {
  let calls = 0;
  const recipientRequest = {
    ...createVendorBankPaymentRequest(plan, payment).request,
    paymentContext: {
      purpose: "verified_vendor_procurement",
      destination_type: "aid_recipient",
      approval_ref: "approval:vault:5",
      payee_verification_ref: "payee-check:vault:31",
      vendor_id: "vendor:verified:11",
      payee_id: "vendor:verified:11",
      vendor_verification_ref: "vendor-check:vault:12",
      procurement_plan_ref: "procurement:vault:30",
    },
  };
  await assert.rejects(
    submitBulkTransfer(recipientRequest, "sandbox-token", "https://bank.invalid", {
      fetchImpl: async () => { calls += 1; },
    }),
    /recipient_bank_payout_prohibited/,
  );
  assert.equal(calls, 0);
});

test("rejects a bank destination whose verified payee does not match the approved vendor", async () => {
  const mismatched = createVendorBankPaymentRequest(plan, {
    ...payment,
    verified_vendor_id: "vendor:verified:other",
  });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.errors.join(","), /vendor_payee_mismatch/);

  const directRequest = createVendorBankPaymentRequest(plan, payment).request;
  directRequest.paymentContext.payee_id = "vendor:verified:other";
  await assert.rejects(
    submitBulkTransfer(directRequest, "sandbox-token", "https://bank.invalid", {
      fetchImpl: async () => { throw new Error("transport_must_not_run"); },
    }),
    /vendor_payee_mismatch/,
  );
});

test("business-expense and customer-refund contexts remain allowed", () => {
  const common = {
    idempotencyKey: "bank-op-1",
    paymentContext: {
      approval_ref: "approval:vault:1",
      payee_verification_ref: "payee:vault:1",
    },
  };
  assert.equal(validatePaymentContext({
    ...common,
    paymentContext: { ...common.paymentContext, purpose: "business_expense", destination_type: "business_payee", expense_ref: "expense:vault:1" },
  }).ok, true);
  assert.equal(validatePaymentContext({
    ...common,
    paymentContext: { ...common.paymentContext, purpose: "customer_refund", destination_type: "customer_refund", refund_receipt_ref: "refund:vault:1" },
  }).ok, true);
});

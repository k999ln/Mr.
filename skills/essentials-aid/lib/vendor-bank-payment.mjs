import { buildBulkTransferRequest } from "../../ubi/gmo-furikomi.mjs";

const clean = (value) => String(value ?? "").trim();

export function createVendorBankPaymentRequest(plan = {}, payment = {}) {
  const errors = [];
  const amountJpy = Number(payment.amount_jpy);

  if (plan.kind !== "essentials_procurement_plan") errors.push("procurement_plan_required");
  if (plan.state !== "approved_for_procurement") errors.push("approved_procurement_plan_required");
  if (plan.payment_destination !== "verified_vendor_only") errors.push("verified_vendor_payment_required");
  if (plan.recipient_cash_transfer !== "prohibited") errors.push("recipient_cash_prohibition_required");
  if (!clean(plan.vendor_id)) errors.push("vendor_id_required");
  if (!clean(plan.vendor_verification_ref)) errors.push("vendor_verification_ref_required");
  if (!clean(plan.approval_ref)) errors.push("approval_ref_required");
  if (!clean(payment.procurement_plan_ref)) errors.push("procurement_plan_ref_required");
  if (!clean(payment.verified_vendor_id)) errors.push("verified_payee_id_required");
  if (clean(payment.verified_vendor_id) && clean(plan.vendor_id) && clean(payment.verified_vendor_id) !== clean(plan.vendor_id)) {
    errors.push("vendor_payee_mismatch");
  }
  if (!clean(payment.payee_verification_ref)) errors.push("payee_verification_ref_required");
  if (!clean(payment.idempotency_key)) errors.push("idempotency_key_required");
  if (!Number.isInteger(amountJpy) || amountJpy <= 0) errors.push("positive_integer_amount_jpy_required");
  if (!payment.bank || typeof payment.bank !== "object") errors.push("vendor_bank_details_required");

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const request = buildBulkTransferRequest({
    accountId: payment.account_id,
    remitterName: payment.remitter_name,
    transferDesignatedDate: payment.transfer_designated_date,
    transferDataName: "LM-VENDOR",
    transfers: [{
      to: plan.vendor_id,
      amount: amountJpy,
      bank: payment.bank,
    }],
  });
  request.idempotencyKey = payment.idempotency_key;
  request.paymentContext = {
    purpose: "verified_vendor_procurement",
    destination_type: "verified_vendor",
    vendor_id: plan.vendor_id,
    payee_id: payment.verified_vendor_id,
    vendor_verification_ref: plan.vendor_verification_ref,
    procurement_plan_ref: payment.procurement_plan_ref,
    approval_ref: plan.approval_ref,
    payee_verification_ref: payment.payee_verification_ref,
  };

  return {
    ok: true,
    errors: [],
    request,
    persistence_rule: "bank_details_execution_boundary_only",
  };
}

const ESSENTIAL_CATEGORIES = new Set([
  "food",
  "water",
  "hygiene",
  "clothing",
  "temporary_shelter",
  "utilities",
  "licensed_healthcare",
  "pharmacy",
  "communication",
  "purpose_limited_transport",
  "education_or_work_supplies",
]);

const CASH_LIKE_CATEGORIES = new Set([
  "cash",
  "bank_transfer",
  "crypto",
  "gift_card",
  "prepaid_card",
  "unrestricted_voucher",
]);

const DELIVERY_METHODS = new Set([
  "vendor_direct",
  "warehouse_delivery",
  "provider_direct",
]);

const APPROVER_ROLES = new Set([
  "authorized_human",
  "authorized_partner",
]);

const clean = (value) => String(value ?? "").trim();

export const policyVersion = "2026-08-28.1";

export function validateAidRequest(input = {}) {
  const errors = [];
  const requestId = clean(input.request_id);
  const recipientRef = clean(input.recipient_ref);
  const deliveryRef = clean(input.delivery_ref);
  const deliveryMethod = clean(input.delivery_method);
  const evidenceRefs = Array.isArray(input.evidence_refs)
    ? input.evidence_refs.map(clean).filter(Boolean)
    : [];
  const sourceRef = clean(input.source_ref);
  const recipientConsentRef = clean(input.recipient_consent_ref);

  if (!requestId) errors.push("request_id_required");
  if (!recipientRef) errors.push("recipient_ref_required");
  if (!sourceRef) errors.push("source_ref_required");
  if (!recipientConsentRef) errors.push("recipient_consent_ref_required");
  if (!deliveryRef) errors.push("private_delivery_ref_required");
  if (input.delivery_address || input.address) errors.push("raw_delivery_address_prohibited");
  if (!DELIVERY_METHODS.has(deliveryMethod)) errors.push("unsupported_delivery_method");
  if (evidenceRefs.length === 0) errors.push("evidence_ref_required");

  const items = Array.isArray(input.items) ? input.items.map((item, index) => {
    const category = clean(item?.category).toLowerCase();
    const description = clean(item?.description);
    const quantity = Number(item?.quantity);
    if (CASH_LIKE_CATEGORIES.has(category)) errors.push(`item_${index}_cash_like_prohibited`);
    else if (!ESSENTIAL_CATEGORIES.has(category)) errors.push(`item_${index}_category_not_allowed`);
    if (!description) errors.push(`item_${index}_description_required`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) errors.push(`item_${index}_quantity_invalid`);
    return { category, description, quantity };
  }) : [];

  if (items.length === 0) errors.push("item_required");
  if (input.recipient_payment || input.wallet || input.bank_account || input.payment_handle) {
    errors.push("recipient_payment_instrument_prohibited");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    request: {
      kind: "essentials_aid_request",
      policy_version: policyVersion,
      request_id: requestId,
      recipient_ref: recipientRef,
      source_ref: sourceRef,
      recipient_consent_ref: recipientConsentRef,
      evidence_refs: evidenceRefs,
      delivery_ref: deliveryRef,
      delivery_method: deliveryMethod,
      items,
      decision_owner: "authorized_human_or_partner",
      recipient_cash_transfer: "prohibited",
    },
  };
}

export function createProcurementPlan(input, approval = {}) {
  const validation = validateAidRequest(input);
  if (!validation.ok) return validation;

  const approvedBy = clean(approval.approved_by);
  const approverRole = clean(approval.approver_role);
  const approvalRef = clean(approval.approval_ref);
  const needAssessmentRef = clean(approval.need_assessment_ref);
  const vendorId = clean(approval.vendor_id);
  const vendorVerificationRef = clean(approval.vendor_verification_ref);
  if (!approvedBy || !APPROVER_ROLES.has(approverRole) || !approvalRef || !needAssessmentRef || !vendorId || !vendorVerificationRef) {
    return {
      ok: false,
      errors: [
        ...(!approvedBy ? ["authorized_approver_required"] : []),
        ...(!APPROVER_ROLES.has(approverRole) ? ["authorized_approver_role_required"] : []),
        ...(!approvalRef ? ["approval_ref_required"] : []),
        ...(!needAssessmentRef ? ["need_assessment_ref_required"] : []),
        ...(!vendorId ? ["verified_vendor_required"] : []),
        ...(!vendorVerificationRef ? ["vendor_verification_ref_required"] : []),
      ],
      request: validation.request,
    };
  }

  return {
    ok: true,
    errors: [],
    plan: {
      kind: "essentials_procurement_plan",
      policy_version: policyVersion,
      request_id: validation.request.request_id,
      recipient_ref: validation.request.recipient_ref,
      delivery_ref: validation.request.delivery_ref,
      delivery_method: validation.request.delivery_method,
      items: validation.request.items,
      approved_by: approvedBy,
      approver_role: approverRole,
      approval_ref: approvalRef,
      need_assessment_ref: needAssessmentRef,
      vendor_id: vendorId,
      vendor_verification_ref: vendorVerificationRef,
      state: "approved_for_procurement",
      payment_destination: "verified_vendor_only",
      recipient_cash_transfer: "prohibited",
      required_receipts: ["purchase", "dispatch_or_appointment", "receipt_or_exception"],
    },
  };
}

export const policyCatalog = Object.freeze({
  essential_categories: [...ESSENTIAL_CATEGORIES],
  prohibited_cash_like_categories: [...CASH_LIKE_CATEGORIES],
  delivery_methods: [...DELIVERY_METHODS],
  approver_roles: [...APPROVER_ROLES],
});

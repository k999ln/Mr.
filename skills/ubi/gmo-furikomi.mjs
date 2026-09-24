// gmo-furikomi.mjs — JP bank rail adapter: GMO Aozora Net Bank 一括振込API (bulk transfer).
// The bank-transfer infrastructure is retained for verified vendor procurement, ordinary business
// payees, and customer refunds. The legacy recipients-table UBI watcher remains disabled.
// Field names verified against the official GMO SDK (github.com/gmoaozora/gmo-aozora-api-java
// BulkTransferRequest + BulkTransferInfo). Pure builder is unit-tested; the live submit needs OAuth2
// access (GMO 口座 + 開発者ポータル登録) so it is UNVERIFIED until a real account/token (sunabar sandbox first).
//
// Invariant: recipient-support cash payouts are prohibited. Every live submission needs an allowed
// non-aid purpose plus approval and payee-verification references.

export const API_BASE = process.env.GMO_AOZORA_API_BASE || "https://api.gmo-aozora.com/ganb/api/personal/v1";

const ALLOWED_PAYMENT_PURPOSES = new Set([
  "verified_vendor_procurement",
  "business_expense",
  "customer_refund",
]);

const clean = (value) => String(value ?? "").trim();

export function validatePaymentContext(request = {}) {
  const context = request.paymentContext || {};
  const purpose = clean(context.purpose);
  const destinationType = clean(context.destination_type);
  const errors = [];

  if (!ALLOWED_PAYMENT_PURPOSES.has(purpose)) errors.push("bank_transfer_purpose_not_allowed");
  if (["recipient", "aid_recipient", "ubi_recipient"].includes(destinationType)) {
    errors.push("recipient_bank_payout_prohibited");
  }
  if (!clean(request.idempotencyKey)) errors.push("bank_transfer_idempotency_key_required");
  if (!clean(context.approval_ref)) errors.push("bank_transfer_approval_ref_required");
  if (!clean(context.payee_verification_ref)) errors.push("bank_transfer_payee_verification_ref_required");

  if (purpose === "verified_vendor_procurement") {
    if (destinationType !== "verified_vendor") errors.push("vendor_destination_required");
    if (!clean(context.vendor_id)) errors.push("vendor_id_required");
    if (!clean(context.payee_id)) errors.push("verified_payee_id_required");
    if (clean(context.vendor_id) && clean(context.payee_id) && clean(context.vendor_id) !== clean(context.payee_id)) {
      errors.push("vendor_payee_mismatch");
    }
    if (!clean(context.vendor_verification_ref)) errors.push("vendor_verification_ref_required");
    if (!clean(context.procurement_plan_ref)) errors.push("procurement_plan_ref_required");
  } else if (purpose === "business_expense") {
    if (destinationType !== "business_payee") errors.push("business_payee_destination_required");
    if (!clean(context.expense_ref)) errors.push("expense_ref_required");
  } else if (purpose === "customer_refund") {
    if (destinationType !== "customer_refund") errors.push("customer_refund_destination_required");
    if (!clean(context.refund_receipt_ref)) errors.push("refund_receipt_ref_required");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], context };
}

// accountTypeCode: "1"=普通(ordinary), "2"=当座(checking), "4"=貯蓄
// transfers: [{ to, amount(JPY int), bank:{ bankCode, branchCode, accountTypeCode?, accountNumber, beneficiaryName } }]
export function buildBulkTransferRequest({ accountId, remitterName, transferDesignatedDate, transferDataName = "ROCKSTAR-IBOT", transfers = [] }) {
  if (!accountId || !remitterName || !transferDesignatedDate) throw new Error("accountId, remitterName, transferDesignatedDate required");
  if (!Array.isArray(transfers) || transfers.length === 0) throw new Error("transfers required");
  const bulkTransfers = transfers.map((t, i) => {
    const b = t.bank || {};
    if (!b.bankCode || !b.branchCode || !b.accountNumber || !b.beneficiaryName) {
      throw new Error(`transfer[${i}] missing bank fields (bankCode/branchCode/accountNumber/beneficiaryName)`);
    }
    if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error(`transfer[${i}] invalid amount`);
    return {
      itemId: String(i + 1),
      beneficiaryBankCode: b.bankCode,
      beneficiaryBranchCode: b.branchCode,
      accountTypeCode: b.accountType || b.accountTypeCode || "1", // accept accountType (from parseBankRecipient) or accountTypeCode; default 普通
      accountNumber: b.accountNumber,
      beneficiaryName: b.beneficiaryName,        // 半角カナ per Zengin
      transferAmount: String(t.amount),
      ediInfo: "",
    };
  });
  const totalAmount = transfers.reduce((s, t) => s + t.amount, 0);
  return {
    accountId,
    remitterName,
    transferDesignatedDate,                  // YYYYMMDD
    transferDataName,
    totalCount: String(transfers.length),
    totalAmount: String(totalAmount),
    bulkTransfers,
  };
}

// Live submit is retained, but only for an explicitly authorized non-recipient purpose.
// UNVERIFIED until a Kai-owned GMO_AOZORA_ACCESS_TOKEN and real/sandbox account are connected.
export async function submitBulkTransfer(request, token, base = API_BASE, { fetchImpl = fetch } = {}) {
  const authority = validatePaymentContext(request);
  if (!authority.ok) throw new Error(authority.errors.join(","));
  if (!token) throw new Error("GMO OAuth2 access token required (gmo dev portal / sunabar). UNVERIFIED until real token.");
  // FIND-B: send the idempotency key as a header (out of the JSON body so GMO won't reject an unknown field)
  // so a retry of the SAME batch is de-duped server-side. Defense-in-depth atop the no-auto-requeue policy.
  const { idempotencyKey, paymentContext, ...body } = request;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-access-token": token };
  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  const res = await fetchImpl(`${base}/bulktransfer/request`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GMO bulktransfer ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json; // apptransferNo / status — poll bulktransfer/status to confirm 振込完了
}

// CLI self-check (no token): build + print a sample payload to prove the shape.
if (process.argv[1] && process.argv[1].endsWith("gmo-furikomi.mjs")) {
  const sample = buildBulkTransferRequest({
    accountId: "SANDBOX_ACCT", remitterName: "ROCKSTAR_IBOT", transferDesignatedDate: "20260829",
    transfers: [
      { to: "vendor:verified:sample", amount: 20000, bank: { bankCode: "0005", branchCode: "001", accountNumber: "1234567", beneficiaryName: "ｻﾝﾌﾟﾙｷﾞﾖｳｼﾔ" } },
    ],
  });
  console.log(JSON.stringify(sample, null, 2));
  console.log("\nUNVERIFIED until GMO OAuth2 token + sunabar/法人 account.");
}

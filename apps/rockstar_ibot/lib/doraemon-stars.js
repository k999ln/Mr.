"use strict";

const { requireCommerceConnector } = require("./commerce-connector-catalog.js");

const STARS_CURRENCY = "XTR";
const DEFAULT_TITLE = "avocadomini";
const DEFAULT_DESCRIPTION = "avocadomini 買い切りライセンス";
const PAY_SUPPORT_TEXT =
  "avocadominiのTelegram Stars決済サポートです。購入日時と問題の内容を、このBotとの個別チャットに返信してください。決済IDや個人情報は公開場所へ投稿しないでください。確認後、返金を含む対応をご案内します。";
const TELEGRAM_ID_RE = /^[1-9][0-9]{0,19}$/;
const CHARGE_ID_RE = /^[^\u0000-\u001f\u007f]{1,512}$/u;
const RPC_NAME_RE = /^[a-z][a-z0-9_]{0,62}$/;

class DoraemonStarsError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "DoraemonStarsError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, details) {
  throw new DoraemonStarsError(code, details);
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function normalizeTelegramId(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const id = String(value == null ? "" : value);
  return TELEGRAM_ID_RE.test(id) ? id : null;
}

function normalizeStarsConfig(input = process.env) {
  const amountValue = own(input, "amount") ? input.amount : input.LM_DORAEMON_STARS_AMOUNT;
  const payloadValue = own(input, "payload") ? input.payload : input.LM_DORAEMON_STARS_PAYLOAD;
  const configuredCurrency = own(input, "currency") ? input.currency : input.LM_DORAEMON_STARS_CURRENCY;
  const amountText = String(amountValue == null ? "" : amountValue).trim();
  const payload = typeof payloadValue === "string" ? payloadValue : "";
  const currency = configuredCurrency == null || configuredCurrency === ""
    ? STARS_CURRENCY
    : String(configuredCurrency).trim();

  if (!/^[1-9][0-9]*$/.test(amountText)) fail("stars_configuration_invalid");
  const amount = Number(amountText);
  if (!Number.isSafeInteger(amount) || amount <= 0) fail("stars_configuration_invalid");
  if (!payload || payload.trim() !== payload || byteLength(payload) > 128) fail("stars_configuration_invalid");
  if (currency !== STARS_CURRENCY) fail("stars_configuration_invalid");

  const title = String(input.title || DEFAULT_TITLE);
  const description = String(input.description || DEFAULT_DESCRIPTION);
  if (!title || byteLength(title) > 32 || !description || byteLength(description) > 255) {
    fail("stars_configuration_invalid");
  }
  return Object.freeze({ amount, payload, currency: STARS_CURRENCY, title, description });
}

function privatePurchaseContext(input = {}) {
  const chat = input.chat || {};
  const from = input.from || {};
  const chatType = input.chatType == null ? chat.type : input.chatType;
  const chatId = normalizeTelegramId(input.chatId == null ? chat.id : input.chatId);
  const userId = normalizeTelegramId(input.userId == null ? from.id : input.userId);
  if (chatType !== "private" || !chatId || !userId || chatId !== userId) {
    fail("stars_private_chat_required");
  }
  return Object.freeze({ chatType: "private", chatId, userId });
}

function upgradeInvoicePayload(configInput, connectorKey) {
  const config = normalizeStarsConfig(configInput);
  if (connectorKey == null || connectorKey === "") return config.payload;
  const connector = requireCommerceConnector(connectorKey);
  const payload = `${config.payload}:tool:${connector.key}`;
  if (byteLength(payload) > 128) fail("stars_configuration_invalid");
  return payload;
}

function parseInvoiceIntent(payloadValue, configInput = process.env) {
  const config = normalizeStarsConfig(configInput);
  const payload = typeof payloadValue === "string" ? payloadValue : "";
  if (payload === config.payload) return Object.freeze({ payload, connectorKey: null });
  const prefix = `${config.payload}:tool:`;
  if (!payload.startsWith(prefix) || byteLength(payload) > 128) return null;
  try {
    const connector = requireCommerceConnector(payload.slice(prefix.length));
    if (`${prefix}${connector.key}` !== payload) return null;
    return Object.freeze({ payload, connectorKey: connector.key });
  } catch {
    return null;
  }
}

function buildStarsInvoice(messageOrContext, configInput = process.env, intent = {}) {
  const context = privatePurchaseContext(messageOrContext);
  const config = normalizeStarsConfig(configInput);
  const payload = upgradeInvoicePayload(config, intent.connectorKey);
  return Object.freeze({
    method: "sendInvoice",
    body: Object.freeze({
      chat_id: context.chatId,
      title: config.title,
      description: config.description,
      payload,
      start_parameter: "dora_os",
      provider_token: "",
      currency: STARS_CURRENCY,
      prices: Object.freeze([Object.freeze({ label: config.title, amount: config.amount })]),
    }),
  });
}

function decidePreCheckout(preCheckoutQuery, purchaseContext, configInput = process.env) {
  let config;
  try {
    config = normalizeStarsConfig(configInput);
    const context = privatePurchaseContext(purchaseContext);
    const queryUserId = normalizeTelegramId(preCheckoutQuery && preCheckoutQuery.from && preCheckoutQuery.from.id);
    if (!queryUserId || queryUserId !== context.userId) fail("stars_private_chat_required");
  } catch (error) {
    if (error && error.code === "stars_configuration_invalid") throw error;
    return Object.freeze({
      ok: false,
      reason: "private_chat_required",
      errorMessage: "この購入はBotとの個別チャットからやり直してください。",
    });
  }

  if (!preCheckoutQuery || typeof preCheckoutQuery.id !== "string" || !preCheckoutQuery.id) {
    return Object.freeze({ ok: false, reason: "invalid_query", errorMessage: "購入内容を確認できませんでした。請求を作り直してください。" });
  }
  if (preCheckoutQuery.currency !== STARS_CURRENCY) {
    return Object.freeze({ ok: false, reason: "currency_mismatch", errorMessage: "購入内容を確認できませんでした。請求を作り直してください。" });
  }
  if (preCheckoutQuery.total_amount !== config.amount) {
    return Object.freeze({ ok: false, reason: "amount_mismatch", errorMessage: "購入内容を確認できませんでした。請求を作り直してください。" });
  }
  const intent = parseInvoiceIntent(preCheckoutQuery.invoice_payload, config);
  if (!intent) {
    return Object.freeze({ ok: false, reason: "payload_mismatch", errorMessage: "購入内容を確認できませんでした。請求を作り直してください。" });
  }
  return Object.freeze({ ok: true, reason: null, errorMessage: null, connectorKey: intent.connectorKey });
}

function preCheckoutAnswerRequest(preCheckoutQuery, decision) {
  if (!preCheckoutQuery || typeof preCheckoutQuery.id !== "string" || !preCheckoutQuery.id) {
    fail("stars_pre_checkout_query_invalid");
  }
  return Object.freeze({
    method: "answerPreCheckoutQuery",
    body: Object.freeze({
      pre_checkout_query_id: preCheckoutQuery.id,
      ok: decision.ok === true,
      ...(decision.ok === true ? {} : { error_message: decision.errorMessage || "購入を確認できませんでした。" }),
    }),
  });
}

function extractSuccessfulPayment(message, configInput = process.env) {
  const context = privatePurchaseContext(message);
  const config = normalizeStarsConfig(configInput);
  const payment = message && message.successful_payment;
  if (!payment || typeof payment !== "object") fail("stars_successful_payment_missing");
  if (payment.currency !== STARS_CURRENCY) fail("stars_currency_mismatch");
  if (payment.total_amount !== config.amount) fail("stars_amount_mismatch");
  const intent = parseInvoiceIntent(payment.invoice_payload, config);
  if (!intent) fail("stars_payload_mismatch");
  const chargeId = typeof payment.telegram_payment_charge_id === "string"
    ? payment.telegram_payment_charge_id
    : "";
  if (!CHARGE_ID_RE.test(chargeId)) fail("stars_charge_id_invalid");
  return Object.freeze({
    chatId: context.chatId,
    userId: context.userId,
    currency: STARS_CURRENCY,
    amount: config.amount,
    payload: intent.payload,
    connectorKey: intent.connectorKey,
    telegramPaymentChargeId: chargeId,
  });
}

function extractRefundedPayment(message, configInput = process.env) {
  const context = privatePurchaseContext(message);
  const config = normalizeStarsConfig(configInput);
  const payment = message && message.refunded_payment;
  if (!payment || typeof payment !== "object") fail("stars_refunded_payment_missing");
  if (payment.currency !== STARS_CURRENCY) fail("stars_currency_mismatch");
  if (payment.total_amount !== config.amount) fail("stars_amount_mismatch");
  if (!parseInvoiceIntent(payment.invoice_payload, config)) fail("stars_payload_mismatch");
  const chargeId = typeof payment.telegram_payment_charge_id === "string"
    ? payment.telegram_payment_charge_id
    : "";
  if (!CHARGE_ID_RE.test(chargeId)) fail("stars_charge_id_invalid");
  return Object.freeze({
    chatId: context.chatId,
    userId: context.userId,
    telegramPaymentChargeId: chargeId,
  });
}

function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function createSupabaseStarsEntitlementWriter(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supaKey = String(options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const rpcName = String(options.rpcName || "lm_mark_doraemon_stars_paid");
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function" || !RPC_NAME_RE.test(rpcName)) {
    fail("stars_entitlement_store_unavailable");
  }

  return async function markPurchaserEntitlementPaid(payment) {
    const context = privatePurchaseContext({ chatType: "private", chatId: payment.chatId, userId: payment.userId });
    const chargeId = String(payment.telegramPaymentChargeId || "");
    if (!CHARGE_ID_RE.test(chargeId) || payment.currency !== STARS_CURRENCY || !Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
      fail("stars_payment_evidence_invalid");
    }
    let response;
    try {
      response = await fetchImpl(`${supaUrl}/rest/v1/rpc/${rpcName}`, {
        method: "POST",
        headers: supabaseHeaders(supaKey),
        body: JSON.stringify({
          p_user_id: context.userId,
          p_chat_id: context.chatId,
          p_telegram_payment_charge_id: chargeId,
          p_currency: STARS_CURRENCY,
          p_total_amount: payment.amount,
          p_invoice_payload: payment.payload,
        }),
      });
    } catch {
      fail("stars_entitlement_write_failed");
    }
    if (!response || !response.ok) fail("stars_entitlement_write_failed", { status: response && response.status });
    const body = await response.json().catch(() => null);
    const result = Array.isArray(body) ? body[0] : body;
    const status = result && String(result.status || "");
    if (!result || !["paid", "already_paid"].includes(status)) fail("stars_entitlement_write_failed");
    if (result.telegram_user_id != null && String(result.telegram_user_id) !== context.userId) fail("stars_entitlement_boundary_mismatch");
    if (result.telegram_payment_charge_id != null && String(result.telegram_payment_charge_id) !== chargeId) fail("stars_entitlement_boundary_mismatch");
    return Object.freeze({
      paid: true,
      duplicate: status === "already_paid" || result.duplicate === true || result.created === false,
    });
  };
}

function createSupabaseStarsRevocationWriter(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const supaKey = String(options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") fail("stars_entitlement_store_unavailable");
  return async function markPurchaserEntitlementRefunded(payment) {
    const context = privatePurchaseContext({ chatType: "private", chatId: payment.chatId, userId: payment.userId });
    const chargeId = String(payment.telegramPaymentChargeId || "");
    if (!CHARGE_ID_RE.test(chargeId)) fail("stars_payment_evidence_invalid");
    let response;
    try {
      response = await fetchImpl(`${supaUrl}/rest/v1/rpc/lm_mark_doraemon_stars_refunded`, {
        method: "POST",
        headers: supabaseHeaders(supaKey),
        body: JSON.stringify({
          p_user_id: context.userId,
          p_chat_id: context.chatId,
          p_telegram_payment_charge_id: chargeId,
        }),
      });
    } catch {
      fail("stars_entitlement_revoke_failed");
    }
    if (!response || !response.ok) fail("stars_entitlement_revoke_failed");
    const body = await response.json().catch(() => null);
    const result = Array.isArray(body) ? body[0] : body;
    if (!result || !["refunded", "already_refunded"].includes(String(result.status || ""))) {
      fail("stars_entitlement_revoke_failed");
    }
    return Object.freeze({ revoked: true, duplicate: String(result.status) === "already_refunded" });
  };
}

function refundRequest(input = {}) {
  const userId = normalizeTelegramId(input.userId);
  const chargeId = String(input.telegramPaymentChargeId || "");
  if (!userId || !CHARGE_ID_RE.test(chargeId)) fail("stars_refund_input_invalid");
  return Object.freeze({
    method: "refundStarPayment",
    body: Object.freeze({ user_id: userId, telegram_payment_charge_id: chargeId }),
  });
}

async function executeStarsRefund(input, telegramApi) {
  if (typeof telegramApi !== "function") fail("stars_telegram_api_unavailable");
  const request = refundRequest(input);
  const result = await telegramApi(request.method, request.body);
  if (!result || result.ok !== true) fail("stars_refund_failed");
  return Object.freeze({ refunded: true });
}

function paysupportReply() {
  return PAY_SUPPORT_TEXT;
}

function createDoraemonStarsService(options = {}) {
  const config = normalizeStarsConfig(options.config || options.env || process.env);
  const telegramApi = options.telegramApi;
  const markPaid = options.markPaid;
  const markRefunded = options.markRefunded;
  if (typeof telegramApi !== "function") fail("stars_telegram_api_unavailable");
  if (typeof markPaid !== "function") fail("stars_entitlement_store_unavailable");

  return Object.freeze({
    config,
    paysupportReply,
    async sendInvoice(messageOrContext, intent = {}) {
      const request = buildStarsInvoice(messageOrContext, config, intent);
      const result = await telegramApi(request.method, request.body);
      if (!result || result.ok !== true) fail("stars_invoice_send_failed");
      return result;
    },
    async handlePreCheckoutQuery(preCheckoutQuery, purchaseContext) {
      const decision = decidePreCheckout(preCheckoutQuery, purchaseContext, config);
      const request = preCheckoutAnswerRequest(preCheckoutQuery, decision);
      const result = await telegramApi(request.method, request.body);
      if (!result || result.ok !== true) fail("stars_pre_checkout_answer_failed");
      return decision;
    },
    async handleSuccessfulPayment(message) {
      const payment = extractSuccessfulPayment(message, config);
      try {
        const result = await markPaid(payment);
        return Object.freeze({ ...result, connectorKey: payment.connectorKey });
      } catch (error) {
        if (error && error.code === "stars_entitlement_boundary_mismatch") throw error;
        fail("stars_entitlement_write_failed");
      }
    },
    async handleRefundedPayment(message) {
      if (typeof markRefunded !== "function") fail("stars_entitlement_store_unavailable");
      const payment = extractRefundedPayment(message, config);
      try {
        return await markRefunded(payment);
      } catch {
        fail("stars_entitlement_revoke_failed");
      }
    },
    refund: (input) => executeStarsRefund(input, telegramApi),
  });
}

module.exports = {
  STARS_CURRENCY,
  PAY_SUPPORT_TEXT,
  DoraemonStarsError,
  normalizeStarsConfig,
  privatePurchaseContext,
  upgradeInvoicePayload,
  parseInvoiceIntent,
  buildStarsInvoice,
  decidePreCheckout,
  preCheckoutAnswerRequest,
  extractSuccessfulPayment,
  extractRefundedPayment,
  createSupabaseStarsEntitlementWriter,
  createSupabaseStarsRevocationWriter,
  refundRequest,
  executeStarsRefund,
  paysupportReply,
  createDoraemonStarsService,
};

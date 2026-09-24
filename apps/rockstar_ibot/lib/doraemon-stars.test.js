"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  STARS_CURRENCY,
  normalizeStarsConfig,
  buildStarsInvoice,
  upgradeInvoicePayload,
  parseInvoiceIntent,
  decidePreCheckout,
  extractSuccessfulPayment,
  createSupabaseStarsEntitlementWriter,
  createSupabaseStarsRevocationWriter,
  refundRequest,
  createDoraemonStarsService,
  paysupportReply,
} = require("./doraemon-stars.js");

const config = { amount: 999, payload: "dora-os-lifetime-v1" };
const privateContext = { chatType: "private", chatId: "123456", userId: "123456" };
const query = (extra = {}) => ({
  id: "pcq_1",
  from: { id: 123456 },
  currency: STARS_CURRENCY,
  total_amount: 999,
  invoice_payload: "dora-os-lifetime-v1",
  ...extra,
});
const paidMessage = (extra = {}) => ({
  chat: { id: 123456, type: "private" },
  from: { id: 123456 },
  successful_payment: {
    currency: STARS_CURRENCY,
    total_amount: 999,
    invoice_payload: "dora-os-lifetime-v1",
    telegram_payment_charge_id: "charge_telegram_1",
    provider_payment_charge_id: "",
    ...extra,
  },
});

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("normal flow sends an XTR invoice, approves pre-checkout, and grants paid entitlement", async () => {
  const telegramCalls = [];
  const payments = [];
  const service = createDoraemonStarsService({
    config,
    telegramApi: async (method, body) => {
      telegramCalls.push({ method, body });
      return { ok: true };
    },
    markPaid: async (payment) => {
      payments.push(payment);
      return { paid: true, duplicate: false };
    },
  });

  await service.sendInvoice(privateContext);
  const decision = await service.handlePreCheckoutQuery(query(), privateContext);
  const result = await service.handleSuccessfulPayment(paidMessage());

  assert.equal(telegramCalls[0].method, "sendInvoice");
  assert.equal(telegramCalls[0].body.currency, "XTR");
  assert.equal(telegramCalls[0].body.provider_token, "");
  assert.deepEqual(telegramCalls[0].body.prices, [{ label: "avocadomini", amount: 999 }]);
  assert.deepEqual(telegramCalls[1], {
    method: "answerPreCheckoutQuery",
    body: { pre_checkout_query_id: "pcq_1", ok: true },
  });
  assert.equal(decision.ok, true);
  assert.deepEqual(result, { paid: true, duplicate: false, connectorKey: null });
  assert.equal(payments[0].telegramPaymentChargeId, "charge_telegram_1");
  assert.equal(payments[0].userId, "123456");
});

test("a fourth-tool invoice carries a validated connector intent through payment", async () => {
  const calls = [];
  const service = createDoraemonStarsService({
    config,
    telegramApi: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
    markPaid: async () => ({ paid: true, duplicate: false }),
  });
  await service.sendInvoice(privateContext, { connectorKey: "email" });
  const payload = upgradeInvoicePayload(config, "email");
  assert.equal(payload, "dora-os-lifetime-v1:tool:email");
  assert.deepEqual(parseInvoiceIntent(payload, config), { payload, connectorKey: "email" });
  assert.equal(calls[0].body.payload, payload);

  const decision = await service.handlePreCheckoutQuery(query({ invoice_payload: payload }), privateContext);
  assert.equal(decision.ok, true);
  assert.equal(decision.connectorKey, "email");
  const result = await service.handleSuccessfulPayment(paidMessage({ invoice_payload: payload }));
  assert.deepEqual(result, { paid: true, duplicate: false, connectorKey: "email" });
});

test("unknown tool intents and payloads over Telegram's limit fail closed", () => {
  assert.equal(parseInvoiceIntent("dora-os-lifetime-v1:tool:not-real", config), null);
  assert.throws(() => upgradeInvoicePayload({ amount: 1, payload: "x".repeat(120) }, "telegram-stars"),
    (error) => error.code === "stars_configuration_invalid");
});

test("currency is fixed to XTR and non-XTR configuration fails closed", () => {
  assert.equal(normalizeStarsConfig(config).currency, "XTR");
  assert.throws(() => normalizeStarsConfig({ ...config, currency: "USD" }), (error) => error.code === "stars_configuration_invalid");
});

test("amount, currency, and payload mismatches are rejected at pre-checkout", () => {
  for (const [field, value, reason] of [
    ["total_amount", 998, "amount_mismatch"],
    ["currency", "USD", "currency_mismatch"],
    ["invoice_payload", "other-product", "payload_mismatch"],
  ]) {
    const decision = decidePreCheckout(query({ [field]: value }), privateContext, config);
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, reason);
  }
});

test("a rejected pre-checkout is answered through the injected Telegram API", async () => {
  const calls = [];
  const service = createDoraemonStarsService({
    config,
    telegramApi: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
    markPaid: async () => ({ paid: true, duplicate: false }),
  });
  const decision = await service.handlePreCheckoutQuery(query({ total_amount: 1 }), privateContext);
  assert.equal(decision.reason, "amount_mismatch");
  assert.deepEqual(calls, [{
    method: "answerPreCheckoutQuery",
    body: {
      pre_checkout_query_id: "pcq_1",
      ok: false,
      error_message: "購入内容を確認できませんでした。請求を作り直してください。",
    },
  }]);
});

test("successful payment revalidates amount, currency, and payload before DB access", async () => {
  for (const [field, value, code] of [
    ["total_amount", 1, "stars_amount_mismatch"],
    ["currency", "USD", "stars_currency_mismatch"],
    ["invoice_payload", "wrong", "stars_payload_mismatch"],
  ]) {
    assert.throws(() => extractSuccessfulPayment(paidMessage({ [field]: value }), config), (error) => error.code === code);
  }
});

test("group chats and mismatched chat/user identities cannot invoice, pre-checkout, or grant", () => {
  const group = { chatType: "group", chatId: "-1001", userId: "123456" };
  assert.throws(() => buildStarsInvoice(group, config), (error) => error.code === "stars_private_chat_required");
  assert.equal(decidePreCheckout(query(), group, config).reason, "private_chat_required");
  assert.throws(
    () => extractSuccessfulPayment({ ...paidMessage(), chat: { id: -1001, type: "group" } }, config),
    (error) => error.code === "stars_private_chat_required",
  );
  assert.throws(
    () => buildStarsInvoice({ chatType: "private", chatId: "123456", userId: "654321" }, config),
    (error) => error.code === "stars_private_chat_required",
  );
});

test("Supabase RPC stores charge evidence and reports an exact retry as duplicate", async () => {
  const calls = [];
  const replies = [
    { status: "paid", created: true, telegram_user_id: "123456", telegram_payment_charge_id: "charge_telegram_1" },
    { status: "already_paid", created: false, telegram_user_id: "123456", telegram_payment_charge_id: "charge_telegram_1" },
  ];
  const markPaid = createSupabaseStarsEntitlementWriter({
    supaUrl: "https://db.example/",
    supaKey: "service-role-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response(replies[calls.length - 1]);
    },
  });
  const payment = extractSuccessfulPayment(paidMessage(), config);

  assert.deepEqual(await markPaid(payment), { paid: true, duplicate: false });
  assert.deepEqual(await markPaid(payment), { paid: true, duplicate: true });
  assert.equal(calls[0].url, "https://db.example/rest/v1/rpc/lm_mark_doraemon_stars_paid");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.p_telegram_payment_charge_id, "charge_telegram_1");
  assert.equal(body.p_currency, "XTR");
  assert.equal(body.p_total_amount, 999);
  assert.equal(JSON.stringify(calls).includes("service-role-secret"), true);
});

test("DB failure is fail-closed and does not call Telegram or log secrets/PII", async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    const writer = createSupabaseStarsEntitlementWriter({
      supaUrl: "https://db.example",
      supaKey: "top-secret",
      fetchImpl: async () => response({ message: "contains-sensitive-provider-detail" }, 503),
    });
    const service = createDoraemonStarsService({ config, telegramApi: async () => ({ ok: true }), markPaid: writer });
    await assert.rejects(() => service.handleSuccessfulPayment(paidMessage()), (error) => {
      assert.equal(error.code, "stars_entitlement_write_failed");
      assert.equal(error.message.includes("top-secret"), false);
      assert.equal(error.message.includes("123456"), false);
      return true;
    });
    assert.deepEqual(logs, []);
  } finally {
    console.log = originalLog;
  }
});

test("paysupport copy and refund request are pure while execution remains injectable", async () => {
  assert.match(paysupportReply(), /個別チャット/);
  assert.match(paysupportReply(), /返金/);
  assert.deepEqual(refundRequest({ userId: "123456", telegramPaymentChargeId: "charge_telegram_1" }), {
    method: "refundStarPayment",
    body: { user_id: "123456", telegram_payment_charge_id: "charge_telegram_1" },
  });
  const calls = [];
  const service = createDoraemonStarsService({
    config,
    telegramApi: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
    markPaid: async () => ({ paid: true, duplicate: false }),
  });
  assert.deepEqual(await service.refund({ userId: "123456", telegramPaymentChargeId: "charge_telegram_1" }), { refunded: true });
  assert.deepEqual(calls[0], refundRequest({ userId: "123456", telegramPaymentChargeId: "charge_telegram_1" }));
});

test("refunded_payment revokes the exact Stars entitlement idempotently", async () => {
  const calls = [];
  const markRefunded = createSupabaseStarsRevocationWriter({
    supaUrl: "https://db.example",
    supaKey: "service-role-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({ status: calls.length === 1 ? "refunded" : "already_refunded" });
    },
  });
  const service = createDoraemonStarsService({
    config,
    telegramApi: async () => ({ ok: true }),
    markPaid: async () => ({ paid: true, duplicate: false }),
    markRefunded,
  });
  const refunded = { ...paidMessage() };
  refunded.refunded_payment = { ...refunded.successful_payment };
  delete refunded.successful_payment;
  assert.deepEqual(await service.handleRefundedPayment(refunded), { revoked: true, duplicate: false });
  assert.deepEqual(await service.handleRefundedPayment(refunded), { revoked: true, duplicate: true });
  assert.match(calls[0].url, /lm_mark_doraemon_stars_refunded$/);
});

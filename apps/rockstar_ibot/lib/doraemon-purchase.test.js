"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  paymentLink,
  cookieValue,
  createPurchaseClaim,
  verifyPurchaseObject,
  checkoutPurchase,
  applyDoraemonCheckout,
  revokeDoraemonEntitlement,
  purchaseStatus,
  telegramClaimToken,
  consumePurchaseClaim,
  sha256,
} = require("./doraemon-purchase.js");

const token = Buffer.alloc(32, 7).toString("base64url");
const purchaseEnv = {
  LM_DORAEMON_PAYMENT_LINK_ID: "plink_doraemon",
  LM_DORAEMON_AMOUNT_TOTAL: "3000",
  LM_DORAEMON_CURRENCY: "jpy",
};
const paidSession = (referenceId, extra = {}) => ({
  id: "cs_test_1",
  client_reference_id: referenceId,
  payment_status: "paid",
  payment_link: "plink_doraemon",
  amount_total: 3000,
  currency: "jpy",
  customer: "cus_1",
  payment_intent: "pi_1",
  ...extra,
});

test("paymentLink only accepts an owned Stripe Payment Link shape", () => {
  assert.equal(paymentLink({ LM_DORAEMON_PAYMENT_LINK: "https://buy.stripe.com/test_abc" }).hostname, "buy.stripe.com");
  assert.equal(paymentLink({ LM_DORAEMON_PAYMENT_LINK: "https://evil.example/pay" }), null);
});

test("createPurchaseClaim stores only a token hash and returns a reconciled Stripe URL", async () => {
  let inserted;
  const result = await createPurchaseClaim({
    env: { LM_DORAEMON_PAYMENT_LINK: "https://buy.stripe.com/test_abc" },
    supaUrl: "https://db.example",
    supaKey: "service-role",
    randomBytes: (size) => size === 16 ? Buffer.alloc(16, 1) : Buffer.alloc(32, 7),
    now: () => new Date("2026-09-01T00:00:00.000Z"),
    fetchImpl: async (_url, options) => { inserted = JSON.parse(options.body); return { ok: true, status: 201 }; },
  });
  assert.match(result.referenceId, /^dm_[a-f0-9]{32}$/);
  assert.equal(inserted.token_hash, sha256(token));
  assert.equal(JSON.stringify(inserted).includes(token), false);
  assert.equal(new URL(result.checkoutUrl).searchParams.get("client_reference_id"), result.referenceId);
  assert.equal(cookieValue(result.cookie), token);
});

test("checkoutPurchase recognizes only Doraemon references", () => {
  const event = { type: "checkout.session.completed", created: 1, data: { object: {
    ...paidSession(`dm_${"a".repeat(32)}`),
  } } };
  assert.equal(checkoutPurchase(event, { env: purchaseEnv }).paid, true);
  assert.equal(checkoutPurchase({ ...event, data: { object: { ...event.data.object, client_reference_id: "ordinary-user" } } }, { env: purchaseEnv }), null);
});

test("checkoutPurchase grants only paid sessions matching configured identity, amount, and currency", () => {
  const referenceId = `dm_${"f".repeat(32)}`;
  assert.equal(verifyPurchaseObject(paidSession(referenceId), purchaseEnv).ok, true);
  for (const object of [
    paidSession(referenceId, { payment_link: "plink_other" }),
    paidSession(referenceId, { amount_total: 1 }),
    paidSession(referenceId, { currency: "usd" }),
  ]) assert.equal(checkoutPurchase({ type: "checkout.session.completed", data: { object } }, { env: purchaseEnv }).paid, false);
  assert.equal(checkoutPurchase({ type: "checkout.session.completed", data: {
    object: paidSession(referenceId, { payment_status: "no_payment_required" }),
  } }, { env: purchaseEnv }).paid, false);
  assert.equal(checkoutPurchase({ type: "checkout.session.completed", data: { object: paidSession(referenceId) } }, { env: {} }).paid, false);
});

test("applyDoraemonCheckout marks exactly one pending claim paid", async () => {
  let patch;
  const event = { type: "checkout.session.completed", created: 1, data: { object: {
    ...paidSession(`dm_${"b".repeat(32)}`),
  } } };
  const result = await applyDoraemonCheckout(event, {
    env: purchaseEnv, supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options) => { patch = JSON.parse(options.body); return { ok: true, json: async () => [{ reference_id: event.data.object.client_reference_id }] }; },
  });
  assert.equal(result.action, "doraemon-paid");
  assert.equal(patch.status, "paid");
  assert.equal(patch.checkout_session_id, "cs_test_1");
  assert.equal(patch.stripe_payment_intent_id, "pi_1");
});

test("guest checkout stores payment_intent even when customer is null", async () => {
  let patch;
  await applyDoraemonCheckout({ type: "checkout.session.completed", data: { object:
    paidSession(`dm_${"8".repeat(32)}`, { customer: null, payment_intent: { id: "pi_guest" } }) } }, {
    env: purchaseEnv, supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options) => { patch = JSON.parse(options.body); return { ok: true, json: async () => [{}] }; },
  });
  assert.equal(patch.stripe_customer_id, null);
  assert.equal(patch.stripe_payment_intent_id, "pi_guest");
});

test("asynchronous payment success upgrades an incomplete claim", async () => {
  let request;
  const referenceId = `dm_${"c".repeat(32)}`;
  const result = await applyDoraemonCheckout({
    type: "checkout.session.async_payment_succeeded",
    created: 1,
    data: { object: {
      id: "cs_test_delayed",
      client_reference_id: referenceId,
      payment_status: "paid",
      payment_link: "plink_doraemon",
      amount_total: 3000,
      currency: "jpy",
      customer: "cus_delayed",
    } },
  }, {
    env: purchaseEnv,
    supaUrl: "https://db.example",
    supaKey: "service-role",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => [{ reference_id: referenceId }] };
    },
  });
  assert.match(request.url, /status=in\.\(pending,payment_incomplete\)/);
  assert.equal(JSON.parse(request.options.body).status, "paid");
  assert.equal(result.action, "doraemon-paid");
});

test("paid webhook redelivery succeeds when the claim is already paid", async () => {
  const referenceId = `dm_${"d".repeat(32)}`;
  let calls = 0;
  const result = await applyDoraemonCheckout({
    type: "checkout.session.completed", data: { object: paidSession(referenceId) },
  }, {
    env: purchaseEnv, supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options = {}) => {
      calls++;
      if (options.method === "PATCH") return { ok: true, json: async () => [] };
      return { ok: true, json: async () => [{ status: "paid", checkout_session_id: "cs_test_1" }] };
    },
  });
  assert.equal(result.action, "doraemon-paid");
  assert.equal(result.duplicate, true);
  assert.equal(calls, 2);
});

test("late paid webhook cannot restore a revoked claim", async () => {
  const referenceId = `dm_${"7".repeat(32)}`;
  const result = await applyDoraemonCheckout({
    type: "checkout.session.completed", data: { object: paidSession(referenceId) },
  }, {
    env: purchaseEnv, supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options = {}) => options.method === "PATCH"
      ? { ok: true, json: async () => [] }
      : { ok: true, json: async () => [{ status: "revoked", checkout_session_id: "cs_test_1" }] },
  });
  assert.equal(result.action, "doraemon-revoked");
  assert.equal(result.duplicate, true);
});

test("refund and dispute revoke by payment intent or charge, including guest customers", async () => {
  for (const [type, object, status] of [
    ["charge.refunded", { id: "ch_refund", refunded: true, payment_intent: "pi_guest", customer: null }, "refunded"],
    ["charge.dispute.created", { charge: "ch_dispute", payment_intent: "pi_guest" }, "disputed"],
  ]) {
    const patches = [];
    const result = await revokeDoraemonEntitlement({ type, data: { object } }, {
      supaUrl: "https://db.example", supaKey: "service-role",
      fetchImpl: async (url, options = {}) => {
        if (!options.method) {
          assert.match(url, /or=\(stripe_payment_intent_id\.eq\.pi_guest,stripe_charge_id\.eq\.ch_/);
          return { ok: true, json: async () => [{ reference_id: `dm_${"e".repeat(32)}`, telegram_chat_id: "123", stripe_customer_id: null }] };
        }
        patches.push({ url, body: JSON.parse(options.body) });
        return { ok: true, status: 204 };
      },
    });
    assert.equal(result.action, "doraemon-revoked");
    assert.equal(result.revoked, 1);
    assert.equal(result.usersRevoked, 1);
    assert.equal(patches.length, 2);
    assert.match(patches[0].url, /lm_users\?telegram_chat_id=eq\.123$/);
    assert.deepEqual(patches[0].body, { paid: false, plan_status: status });
    assert.match(patches[1].url, /lm_doraemon_purchase_claims\?reference_id=eq\.dm_/);
    assert.equal(patches[1].body.status, "revoked");
  }
});

test("refund revokes an unclaimed paid purchase so it cannot be connected later", async () => {
  const patches = [];
  const result = await revokeDoraemonEntitlement({
    type: "charge.refunded", data: { object: { id: "ch_guest", refunded: true, payment_intent: "pi_guest" } },
  }, {
    supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options = {}) => {
      if (!options.method) return { ok: true, json: async () => [{ reference_id: `dm_${"9".repeat(32)}`, telegram_chat_id: null }] };
      patches.push(JSON.parse(options.body));
      return { ok: true };
    },
  });
  assert.equal(result.revoked, 1);
  assert.equal(result.usersRevoked, 0);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, "revoked");
  assert.equal(patches[0].stripe_charge_id, "ch_guest");
});

test("purchaseStatus requires the same browser token before exposing Telegram link", async () => {
  const row = { token_hash: sha256(token), status: "paid", expires_at: "2099-01-01T00:00:00.000Z", claimed_at: null };
  const fetchImpl = async () => ({ ok: true, json: async () => [row] });
  const paid = await purchaseStatus({ sessionId: "cs_test_1", token }, {
    supaUrl: "https://db.example", supaKey: "service-role", botUsername: "doraemon_bot", fetchImpl,
  });
  assert.equal(paid.status, "paid");
  assert.equal(paid.telegramUrl, `https://t.me/doraemon_bot?start=doraemon_${token}`);
  const hidden = await purchaseStatus({ sessionId: "cs_test_1", token: Buffer.alloc(32, 8).toString("base64url") }, {
    supaUrl: "https://db.example", supaKey: "service-role", botUsername: "doraemon_bot", fetchImpl,
  });
  assert.equal(hidden.status, "pending");
});

test("purchaseStatus reports revoked even when the purchase was previously connected", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [{
    token_hash: sha256(token), status: "revoked", expires_at: "2099-01-01T00:00:00.000Z", claimed_at: "2026-09-01T00:00:00.000Z",
  }] });
  const result = await purchaseStatus({ sessionId: "cs_test_1", token }, {
    supaUrl: "https://db.example", supaKey: "service-role", botUsername: "doraemon_bot", fetchImpl,
  });
  assert.equal(result.status, "revoked");
});

test("Telegram deep link token is exact and consumed through the atomic RPC", async () => {
  assert.equal(telegramClaimToken(`/start doraemon_${token}`), token);
  assert.equal(telegramClaimToken(`/start doraemon_${token}x`), null);
  let body;
  const result = await consumePurchaseClaim({ token, chatId: "123", userId: "123", profileName: "Kai" }, {
    supaUrl: "https://db.example", supaKey: "service-role",
    fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => [{ status: "connected", uid: "lm_tg_1" }] }; },
  });
  assert.equal(result.status, "connected");
  assert.equal(body.p_token_hash, sha256(token));
  assert.equal(JSON.stringify(body).includes(token), false);
});

test("Telegram claim rejects groups, channels, and chat/user mismatches before RPC", async () => {
  let calls = 0;
  const opts = { supaUrl: "https://db.example", supaKey: "service-role", fetchImpl: async () => { calls++; } };
  assert.equal((await consumePurchaseClaim({ token, chatId: "-100123", userId: "123" }, opts)).status, "invalid");
  assert.equal((await consumePurchaseClaim({ token, chatId: "123", userId: "456" }, opts)).status, "invalid");
  assert.equal((await consumePurchaseClaim({ token, chatId: "123", userId: "123", chatType: "group" }, opts)).status, "invalid");
  assert.equal(calls, 0);
});

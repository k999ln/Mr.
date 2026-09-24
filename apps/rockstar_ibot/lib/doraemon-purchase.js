"use strict";

const crypto = require("node:crypto");

const CLAIM_COOKIE = "__Host-doraemon_claim";
const CLAIM_PREFIX = "dm_";
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const REFERENCE_RE = /^dm_[a-f0-9]{32}$/;
const STRIPE_ID_RE = /^(?:plink|prod|price)_[A-Za-z0-9_]+$/;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stripeId(value) {
  if (typeof value === "string") return value;
  return value && typeof value.id === "string" ? value.id : null;
}

function headers(key, prefer) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function paymentLink(env = process.env) {
  const value = String(env.LM_DORAEMON_PAYMENT_LINK || env.LM_STRIPE_PAYMENT_LINK || "").trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com" || url.username || url.password || url.pathname.length <= 1) return null;
    return url;
  } catch {
    return null;
  }
}

function claimCookie(token, maxAge = CLAIM_TTL_MS / 1000) {
  return `${CLAIM_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function cookieValue(header, name = CLAIM_COOKIE) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1 || part.slice(0, index).trim() !== name) continue;
    return part.slice(index + 1).trim();
  }
  return "";
}

async function createPurchaseClaim(opts = {}) {
  const env = opts.env || process.env;
  const link = paymentLink(env);
  if (!link) throw new Error("doraemon_payment_link_unavailable");
  if (!opts.supaUrl || !opts.supaKey) throw new Error("doraemon_purchase_store_unavailable");

  const randomBytes = opts.randomBytes || crypto.randomBytes;
  const now = opts.now ? opts.now() : new Date();
  const referenceId = `${CLAIM_PREFIX}${randomBytes(16).toString("hex")}`;
  const token = randomBytes(32).toString("base64url");
  const response = await (opts.fetchImpl || fetch)(`${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims`, {
    method: "POST",
    headers: headers(opts.supaKey, "return=minimal"),
    body: JSON.stringify({
      reference_id: referenceId,
      token_hash: sha256(token),
      status: "pending",
      expires_at: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`doraemon_purchase_claim_insert_failed:${response.status}`);
  link.searchParams.set("client_reference_id", referenceId);
  link.searchParams.set("locale", "ja");
  return { referenceId, token, checkoutUrl: link.toString(), cookie: claimCookie(token) };
}

function purchaseExpectations(env = process.env) {
  const amount = String(env.LM_DORAEMON_AMOUNT_TOTAL || "").trim();
  return {
    paymentLinkId: String(env.LM_DORAEMON_PAYMENT_LINK_ID || "").trim(),
    productId: String(env.LM_DORAEMON_PRODUCT_ID || "").trim(),
    priceId: String(env.LM_DORAEMON_PRICE_ID || "").trim(),
    amountTotal: /^\d+$/.test(amount) ? Number(amount) : null,
    currency: String(env.LM_DORAEMON_CURRENCY || "").trim().toLowerCase(),
  };
}

function checkoutLineIdentity(object) {
  const lines = object && object.line_items && object.line_items.data;
  const price = Array.isArray(lines) && lines[0] && lines[0].price;
  const metadata = (object && object.metadata) || {};
  return {
    productId: String((price && (price.product && price.product.id || price.product)) || metadata.doraemon_product_id || metadata.product_id || ""),
    priceId: String((price && price.id) || metadata.doraemon_price_id || metadata.price_id || ""),
  };
}

function verifyPurchaseObject(object, env = process.env) {
  const expected = purchaseExpectations(env);
  const actual = checkoutLineIdentity(object);
  const configuredIds = [expected.paymentLinkId, expected.productId, expected.priceId].filter(Boolean);
  const validConfig = configuredIds.length > 0 && configuredIds.every((id) => STRIPE_ID_RE.test(id)) &&
    Number.isSafeInteger(expected.amountTotal) && expected.amountTotal >= 0 && /^[a-z]{3}$/.test(expected.currency);
  if (!validConfig) return { ok: false, reason: "purchase_configuration_invalid" };

  const identityMatches =
    (!!expected.paymentLinkId && String(object.payment_link || "") === expected.paymentLinkId) ||
    (!!expected.productId && actual.productId === expected.productId) ||
    (!!expected.priceId && actual.priceId === expected.priceId);
  if (!identityMatches) return { ok: false, reason: "purchase_identity_mismatch" };
  if (Number(object.amount_total) !== expected.amountTotal) return { ok: false, reason: "purchase_amount_mismatch" };
  if (String(object.currency || "").toLowerCase() !== expected.currency) return { ok: false, reason: "purchase_currency_mismatch" };
  return { ok: true, reason: null };
}

function checkoutPurchase(event, opts = {}) {
  const supported = event && (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  );
  const object = supported && event.data && event.data.object;
  const referenceId = object && String(object.client_reference_id || "");
  if (!REFERENCE_RE.test(referenceId)) return null;
  const verification = verifyPurchaseObject(object, opts.env || process.env);
  return {
    referenceId,
    sessionId: String(object.id || ""),
    customerId: stripeId(object.customer),
    subscriptionId: stripeId(object.subscription),
    paymentIntentId: stripeId(object.payment_intent),
    chargeId: stripeId(object.charge),
    paymentStatus: String(object.payment_status || ""),
    paid: object.payment_status === "paid" && verification.ok,
    verified: verification.ok,
    verificationReason: verification.reason,
    eventCreated: event.created ? new Date(Number(event.created) * 1000).toISOString() : new Date().toISOString(),
  };
}

async function applyDoraemonCheckout(event, opts = {}) {
  if (isDoraemonRevocationEvent(event)) return revokeDoraemonEntitlement(event, opts);
  const purchase = checkoutPurchase(event, opts);
  if (!purchase) return null;
  if (!opts.supaUrl || !opts.supaKey) throw new Error("doraemon_purchase_store_unavailable");
  const response = await (opts.fetchImpl || fetch)(
    `${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims?reference_id=eq.${encodeURIComponent(purchase.referenceId)}&status=in.(pending,payment_incomplete)`,
    {
      method: "PATCH",
      headers: headers(opts.supaKey, "return=representation"),
      body: JSON.stringify({
        status: purchase.paid ? "paid" : "payment_incomplete",
        checkout_session_id: purchase.sessionId || null,
        stripe_customer_id: purchase.customerId,
        stripe_subscription_id: purchase.subscriptionId,
        stripe_payment_intent_id: purchase.paymentIntentId,
        stripe_charge_id: purchase.chargeId,
        payment_status: purchase.paymentStatus,
        paid_at: purchase.paid ? purchase.eventCreated : null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error(`doraemon_purchase_claim_patch_failed:${response.status}`);
  const rows = await response.json().catch(() => []);
  if (Array.isArray(rows) && rows.length === 1) {
    return {
      action: purchase.paid ? "doraemon-paid" : "doraemon-payment-incomplete",
      referenceId: purchase.referenceId,
      reason: purchase.verificationReason,
    };
  }
  const existing = await existingClaim(purchase, opts);
  if (purchase.paid && existing && (existing.status === "paid" || existing.status === "connected") &&
      (!existing.checkout_session_id || existing.checkout_session_id === purchase.sessionId)) {
    return { action: "doraemon-paid", referenceId: purchase.referenceId, duplicate: true };
  }
  if (existing && existing.status === "revoked") {
    return { action: "doraemon-revoked", referenceId: purchase.referenceId, duplicate: true };
  }
  throw new Error("doraemon_purchase_claim_not_found");
}

async function existingClaim(purchase, opts) {
  const response = await (opts.fetchImpl || fetch)(
    `${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims?reference_id=eq.${encodeURIComponent(purchase.referenceId)}&select=status,checkout_session_id&limit=1`,
    { headers: headers(opts.supaKey) },
  );
  if (!response.ok) throw new Error(`doraemon_purchase_claim_read_failed:${response.status}`);
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

function isDoraemonRevocationEvent(event) {
  const object = event && event.data && event.data.object;
  if (event && event.type === "charge.dispute.created") return !!object;
  return !!(event && event.type === "charge.refunded" && object && object.refunded === true);
}

async function revokeDoraemonEntitlement(event, opts = {}) {
  if (!isDoraemonRevocationEvent(event)) return null;
  if (!opts.supaUrl || !opts.supaKey) throw new Error("doraemon_purchase_store_unavailable");
  const object = event.data.object;
  const expandedCharge = object.charge && typeof object.charge === "object" ? object.charge : null;
  const chargeId = String((expandedCharge && expandedCharge.id) ||
    (typeof object.charge === "string" && object.charge) ||
    (event.type === "charge.refunded" && object.id) || "");
  const paymentIntentId = String((expandedCharge && expandedCharge.payment_intent) || object.payment_intent || "");
  if (!paymentIntentId && !chargeId) return { action: "doraemon-revocation-orphan" };

  const fetchImpl = opts.fetchImpl || fetch;
  const identityFilters = [];
  if (paymentIntentId) identityFilters.push(`stripe_payment_intent_id.eq.${encodeURIComponent(paymentIntentId)}`);
  if (chargeId) identityFilters.push(`stripe_charge_id.eq.${encodeURIComponent(chargeId)}`);
  const claimsResponse = await fetchImpl(
    `${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims?or=(${identityFilters.join(",")})&status=in.(paid,connected)&select=reference_id,telegram_chat_id,stripe_customer_id&limit=100`,
    { headers: headers(opts.supaKey) },
  );
  if (!claimsResponse.ok) throw new Error(`doraemon_revoke_claim_read_failed:${claimsResponse.status}`);
  const claims = await claimsResponse.json().catch(() => []);
  const matchedClaims = Array.isArray(claims) ? claims : [];
  const chatIds = [...new Set(matchedClaims.map((row) => String(row.telegram_chat_id || "")).filter(Boolean))];
  for (const claim of matchedClaims) {
    const chatId = String(claim.telegram_chat_id || "");
    if (chatId) {
      const userResponse = await fetchImpl(
        `${opts.supaUrl}/rest/v1/lm_users?telegram_chat_id=eq.${encodeURIComponent(chatId)}`,
        {
          method: "PATCH",
          headers: headers(opts.supaKey, "return=minimal"),
          body: JSON.stringify({ paid: false, plan_status: event.type === "charge.dispute.created" ? "disputed" : "refunded" }),
        },
      );
      if (!userResponse.ok) throw new Error(`doraemon_entitlement_revoke_failed:${userResponse.status}`);
    }
    const claimPatch = { status: "revoked", updated_at: new Date().toISOString() };
    if (chargeId) claimPatch.stripe_charge_id = chargeId;
    const claimResponse = await fetchImpl(
      `${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims?reference_id=eq.${encodeURIComponent(claim.reference_id)}`,
      {
        method: "PATCH",
        headers: headers(opts.supaKey, "return=minimal"),
        body: JSON.stringify(claimPatch),
      },
    );
    if (!claimResponse.ok) throw new Error(`doraemon_claim_revoke_failed:${claimResponse.status}`);
  }
  return {
    action: "doraemon-revoked",
    paymentIntentId: paymentIntentId || null,
    chargeId: chargeId || null,
    revoked: matchedClaims.length,
    usersRevoked: chatIds.length,
  };
}

async function purchaseStatus({ sessionId, token }, opts = {}) {
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(String(sessionId || "")) || !TOKEN_RE.test(String(token || ""))) {
    return { status: "invalid" };
  }
  if (!opts.supaUrl || !opts.supaKey) return { status: "unavailable" };
  const select = "reference_id,token_hash,status,expires_at,claimed_at,telegram_chat_id";
  const response = await (opts.fetchImpl || fetch)(
    `${opts.supaUrl}/rest/v1/lm_doraemon_purchase_claims?checkout_session_id=eq.${encodeURIComponent(sessionId)}&select=${select}&limit=1`,
    { headers: headers(opts.supaKey) },
  );
  if (!response.ok) return { status: "unavailable" };
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.token_hash !== sha256(token)) return { status: "pending" };
  if (row.status === "revoked") return { status: "revoked" };
  if (Date.parse(row.expires_at) <= Date.now() && !row.claimed_at) return { status: "expired" };
  if (row.claimed_at) return { status: "connected" };
  if (row.status !== "paid") return { status: row.status === "payment_incomplete" ? "payment_incomplete" : "pending" };
  const botUsername = String(opts.botUsername || "").replace(/^@/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername)) return { status: "bot_unavailable" };
  return { status: "paid", telegramUrl: `https://t.me/${botUsername}?start=doraemon_${token}` };
}

function telegramClaimToken(text) {
  const match = String(text || "").trim().match(/^\/start(?:@[A-Za-z0-9_]+)?\s+doraemon_([A-Za-z0-9_-]{43})$/i);
  return match ? match[1] : null;
}

async function consumePurchaseClaim({ token, chatId, userId, profileName, chatType }, opts = {}) {
  if (!TOKEN_RE.test(String(token || "")) || !/^[1-9][0-9]{0,19}$/.test(String(chatId || "")) ||
      !/^[1-9][0-9]{0,19}$/.test(String(userId || "")) || String(chatId) !== String(userId) ||
      (chatType != null && chatType !== "private")) {
    return { status: "invalid" };
  }
  if (!opts.supaUrl || !opts.supaKey) return { status: "unavailable" };
  const response = await (opts.fetchImpl || fetch)(`${opts.supaUrl}/rest/v1/rpc/consume_lm_doraemon_purchase_claim`, {
    method: "POST",
    headers: headers(opts.supaKey),
    body: JSON.stringify({
      p_token_hash: sha256(token),
      p_chat_id: String(chatId),
      p_user_id: String(userId),
      p_profile_name: String(profileName || "").trim().slice(0, 120),
    }),
  });
  if (!response.ok) return { status: "unavailable" };
  const value = await response.json().catch(() => []);
  const row = Array.isArray(value) ? value[0] : value;
  return row && row.status ? { status: String(row.status), uid: row.uid ? String(row.uid) : null } : { status: "invalid" };
}

module.exports = {
  CLAIM_COOKIE,
  CLAIM_PREFIX,
  CLAIM_TTL_MS,
  sha256,
  paymentLink,
  claimCookie,
  cookieValue,
  createPurchaseClaim,
  purchaseExpectations,
  verifyPurchaseObject,
  checkoutPurchase,
  applyDoraemonCheckout,
  isDoraemonRevocationEvent,
  revokeDoraemonEntitlement,
  purchaseStatus,
  telegramClaimToken,
  consumePurchaseClaim,
};

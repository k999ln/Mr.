"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  MAX_MINOR_UNITS,
  OBSERVATION_TYPES,
  buildOfferVersion,
  buildPromiseVersion,
  buildCommerceObservation,
  createCommerceAssuranceStore,
} = require("./commerce-assurance-store.js");

const SQL = fs.readFileSync(path.join(
  __dirname, "../migrations/2026-08-31-lm-commerce-assurance-core.sql",
), "utf8");
const MERCHANT = "commerce://merchant/mrc_alpha";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const INBOX_ID = "8c6fbd77-6086-4bf8-9870-9c129d71a9ee";
const LEASE_ID = "b8b545ea-1aa9-4985-9da5-83292ea74c01";

function offer(overrides = {}) {
  return {
    uid: "tenant-1",
    merchantRef: MERCHANT,
    offerRef: `${MERCHANT}/offer/pro_monthly`,
    offerVersionRef: `${MERCHANT}/offer/pro_monthly/version/1`,
    version: 1,
    priceMinor: 1299,
    currency: "USD",
    termsRef: `artifact://commerce/offer/pro_monthly/sha256/${HASH_A}`,
    contentSha256: HASH_A,
    effectiveAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function promise(overrides = {}) {
  return {
    uid: "tenant-1",
    merchantRef: MERCHANT,
    promiseRef: `${MERCHANT}/promise/pro_access`,
    promiseVersionRef: `${MERCHANT}/promise/pro_access/version/1`,
    version: 1,
    offerVersionRef: `${MERCHANT}/offer/pro_monthly/version/1`,
    promiseType: "access",
    specificationRef: `artifact://commerce/promise/pro_access/sha256/${HASH_B}`,
    contentSha256: HASH_B,
    effectiveAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    observationRef: `${MERCHANT}/observation/obs_payment_1`,
    uid: "tenant-1",
    merchantRef: MERCHANT,
    observationType: "payment",
    amountMinor: 1299,
    currency: "USD",
    provider: "stripe",
    providerAccountId: "acct_platform_1",
    providerEventId: "evt_payment_1",
    providerPaymentId: "pi_1",
    observedAt: "2026-08-31T00:01:00.000Z",
    offerVersionRef: `${MERCHANT}/offer/pro_monthly/version/1`,
    promiseVersionRef: `${MERCHANT}/promise/pro_access/version/1`,
    inboxId: INBOX_ID,
    evidenceRef: `provider://stripe/accounts/acct_platform_1/events/evt_payment_1/sha256/${HASH_A}`,
    ...overrides,
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("migration creates merchant-scoped immutable canonical offer and promise versions", () => {
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.lm_commerce_offer_versions/i);
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.lm_commerce_promise_versions/i);
  assert.match(SQL, /PRIMARY KEY \(uid, merchant_ref, offer_version_ref\)/i);
  assert.match(SQL, /UNIQUE \(uid, merchant_ref, offer_ref, version\)/i);
  assert.match(SQL, /offer_version_ref = offer_ref \|\| '\/version\/' \|\| version::text/i);
  assert.match(SQL, /FOREIGN KEY \(uid, merchant_ref, offer_version_ref\)[\s\S]*lm_commerce_offer_versions/i);
  assert.match(SQL, /BEFORE UPDATE OR DELETE ON public\.lm_commerce_offer_versions/i);
  assert.match(SQL, /BEFORE UPDATE OR DELETE ON public\.lm_commerce_promise_versions/i);
  assert.match(SQL, /offer_version_collision/);
  assert.match(SQL, /promise_version_collision/);
  assert.match(SQL, /FOREIGN KEY \(uid, merchant_ref, supersedes_offer_version_ref\)[\s\S]*?DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(SQL, /FOREIGN KEY \(uid, merchant_ref, supersedes_promise_version_ref\)[\s\S]*?DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(SQL, /IF NOT EXISTS \([\s\S]*?lm_commerce_offer_supersedes_fk[\s\S]*?ALTER TABLE public\.lm_commerce_offer_versions/i);
  assert.match(SQL, /IF NOT EXISTS \([\s\S]*?lm_commerce_promise_supersedes_fk[\s\S]*?ALTER TABLE public\.lm_commerce_promise_versions/i);
  assert.match(SQL, /prior\.version < \(p_record->>'version'\)::integer/i);
  assert.match(SQL, /invalid_supersedes_offer_version_ref/i);
  assert.match(SQL, /invalid_supersedes_promise_version_ref/i);
});

test("migration enforces typed immutable observations, exact links, money, provider evidence, and reversals", () => {
  for (const type of OBSERVATION_TYPES) assert.match(SQL, new RegExp(`'${type}'`));
  assert.match(SQL, /amount_minor bigint NOT NULL CHECK \(amount_minor BETWEEN 0 AND 9007199254740991\)/i);
  assert.match(SQL, /currency text NOT NULL CHECK \(currency ~ '\^\[A-Z\]\{3\}\$'\)/i);
  assert.match(SQL, /provider_account_id text NOT NULL/i);
  assert.match(SQL, /provider_event_id text NOT NULL/i);
  assert.match(SQL, /provider_payment_id text/i);
  assert.match(SQL, /reverses_observation_ref text/i);
  assert.match(SQL, /observed_at timestamptz NOT NULL/i);
  assert.match(SQL, /ingested_at timestamptz NOT NULL DEFAULT clock_timestamp\(\)/i);
  assert.match(SQL, /FOREIGN KEY \(uid, merchant_ref, promise_version_ref\)/i);
  assert.match(SQL, /UNIQUE \(uid, merchant_ref, provider, provider_account_id, provider_event_id, observation_type\)/i);
  assert.match(SQL, /observation_collision/);
  assert.match(SQL, /BEFORE UPDATE OR DELETE ON public\.lm_commerce_observations/i);
  assert.match(SQL, /original\.observation_type <> 'payment'/i);
  assert.match(SQL, /v_original\.provider_account_id <> p_record->>'provider_account_id'/i);
  assert.match(SQL, /v_original\.provider_payment_id <> p_record->>'provider_payment_id'/i);
  assert.match(SQL, /v_original\.currency <> p_record->>'currency'/i);
  assert.match(SQL, /reversal\.observation_type IN \('refund', 'chargeback'\)/i);
  assert.match(SQL, /payment_reversal_exceeded/i);
  assert.match(SQL, /SELECT original\.\* INTO v_original[\s\S]*?FOR UPDATE/i);
});

test("migration is RLS protected and service-only mutation occurs through atomic RPCs", () => {
  for (const table of ["lm_commerce_offer_versions", "lm_commerce_promise_versions", "lm_commerce_observations", "lm_commerce_webhook_inbox"]) {
    assert.match(SQL, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
  }
  assert.match(SQL, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(SQL, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/i);
  for (const rpc of ["lm_put_commerce_offer_version", "lm_put_commerce_promise_version", "lm_append_commerce_observation"]) {
    assert.match(SQL, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}[^;]+ TO service_role`, "i"));
  }
  assert.doesNotMatch(SQL, /GRANT[^;]+TO (?:anon|authenticated)/i);
});

test("builders produce canonical immutable records with exact merchant-local version links", () => {
  const builtOffer = buildOfferVersion(offer());
  const builtPromise = buildPromiseVersion(promise());
  const builtObservation = buildCommerceObservation(observation());
  assert.ok(Object.isFrozen(builtOffer));
  assert.ok(Object.isFrozen(builtPromise));
  assert.ok(Object.isFrozen(builtObservation));
  assert.equal(builtOffer.price_minor, 1299);
  assert.equal(builtPromise.offer_version_ref, builtOffer.offer_version_ref);
  assert.equal(builtObservation.promise_version_ref, builtPromise.promise_version_ref);
  assert.equal(builtObservation.amount_minor, 1299);
});

test("supersedes references must be earlier versions of the exact same entity", () => {
  const offerV2 = offer({
    version: 2,
    offerVersionRef: `${MERCHANT}/offer/pro_monthly/version/2`,
    supersedesOfferVersionRef: `${MERCHANT}/offer/pro_monthly/version/1`,
  });
  const promiseV2 = promise({
    version: 2,
    promiseVersionRef: `${MERCHANT}/promise/pro_access/version/2`,
    supersedesPromiseVersionRef: `${MERCHANT}/promise/pro_access/version/1`,
  });
  assert.equal(buildOfferVersion(offerV2).supersedes_offer_version_ref,
    `${MERCHANT}/offer/pro_monthly/version/1`);
  assert.equal(buildPromiseVersion(promiseV2).supersedes_promise_version_ref,
    `${MERCHANT}/promise/pro_access/version/1`);
  for (const ref of [
    `${MERCHANT}/offer/pro_monthly/version/2`,
    `${MERCHANT}/offer/pro_monthly/version/3`,
    `${MERCHANT}/offer/other/version/1`,
    "commerce://merchant/mrc_other/offer/pro_monthly/version/1",
  ]) assert.throws(() => buildOfferVersion({ ...offerV2, supersedesOfferVersionRef: ref }), /earlier version/i);
  for (const ref of [
    `${MERCHANT}/promise/pro_access/version/2`,
    `${MERCHANT}/promise/pro_access/version/3`,
    `${MERCHANT}/promise/other/version/1`,
    "commerce://merchant/mrc_other/promise/pro_access/version/1",
  ]) assert.throws(() => buildPromiseVersion({ ...promiseV2, supersedesPromiseVersionRef: ref }), /earlier version/i);
});

test("currency and integer minor-unit validation fail closed", () => {
  for (const bad of [-1, 1.2, MAX_MINOR_UNITS + 1, "1.2", "01", null]) {
    assert.throws(() => buildCommerceObservation(observation({ amountMinor: bad })), /amount_minor|minor units/i);
  }
  for (const bad of ["usd", "US", "USDT", "12A", null]) {
    assert.throws(() => buildCommerceObservation(observation({ currency: bad })), /currency/i);
  }
  assert.throws(() => buildOfferVersion(offer({ priceMinor: 9.99 })), /price_minor|minor units/i);
  assert.throws(() => buildOfferVersion(offer({ currency: "usd" })), /currency/i);
});

test("refunds and chargebacks require exact reversal and payment linkage", () => {
  for (const type of ["refund", "chargeback"]) {
    assert.throws(() => buildCommerceObservation(observation({ observationType: type })), /reversal/i);
    const built = buildCommerceObservation(observation({
      observationType: type,
      observationRef: `${MERCHANT}/observation/${type}_1`,
      providerEventId: `evt_${type}_1`,
      evidenceRef: `provider://stripe/accounts/acct_platform_1/events/evt_${type}_1/sha256/${HASH_A}`,
      reversesObservationRef: `${MERCHANT}/observation/obs_payment_1`,
    }));
    assert.equal(built.reverses_observation_ref, `${MERCHANT}/observation/obs_payment_1`);
  }
  assert.throws(() => buildCommerceObservation(observation({ providerPaymentId: null })), /provider_payment_id/i);
  assert.throws(() => buildCommerceObservation(observation({
    reversesObservationRef: `${MERCHANT}/observation/obs_other`,
  })), /reversal/i);
});

test("raw secrets, PII, loose evidence, and cross-merchant references never reach storage", async () => {
  let fetches = 0;
  const store = createCommerceAssuranceStore({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async () => { fetches += 1; return response({}); },
  });
  for (const unsafe of [
    { ...observation(), rawPayload: "{}" },
    { ...observation(), customerEmail: "person@example.test" },
    { ...observation(), apiKey: "sk_live_secret" },
    observation({ evidenceRef: "provider://stripe/events/evt_payment_1" }),
    observation({ offerVersionRef: "commerce://merchant/mrc_other/offer/pro/version/1" }),
    observation({ promiseVersionRef: "commerce://merchant/mrc_other/promise/pro/version/1" }),
  ]) await assert.rejects(() => store.appendObservation(unsafe), /privacy|field|evidence|merchant/i);
  assert.equal(fetches, 0);
});

test("100 identical provider replays yield one observation and exact retries return the original", async () => {
  const rows = new Map();
  let inserts = 0;
  const store = createCommerceAssuranceStore({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (_url, init) => {
      const record = JSON.parse(init.body).p_record;
      const key = [record.uid, record.merchant_ref, record.provider, record.provider_account_id,
        record.provider_event_id, record.observation_type].join("|");
      let stored = rows.get(key);
      const created = !stored;
      if (!stored) {
        inserts += 1;
        stored = { ...record, ingested_at: "2026-08-31T00:02:00.000Z" };
        rows.set(key, stored);
      } else if (JSON.stringify(record) !== JSON.stringify(Object.fromEntries(
        Object.keys(record).map((field) => [field, stored[field]]),
      ))) return response({ message: "observation_collision", detail: "hidden" }, 409);
      return response({ created, observation: stored });
    },
  });
  const results = await Promise.all(Array.from({ length: 100 },
    () => store.appendObservation(observation(), LEASE_ID)));
  assert.equal(inserts, 1);
  assert.equal(rows.size, 1);
  assert.equal(results.filter((item) => item.created).length, 1);
  assert.equal(results[99].observation.provider_event_id, "evt_payment_1");
  await assert.rejects(() => store.appendObservation(observation({ amountMinor: 1300 }), LEASE_ID),
    (error) => error.code === "observation_collision" && !error.message.includes("hidden"));
});

test("observation append supplies a validated lease separately from immutable payload", async () => {
  const calls = [];
  const store = createCommerceAssuranceStore({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      return response({ created: true, observation: {
        ...body.p_record, ingested_at: "2026-08-31T00:02:00.000Z",
      } });
    },
  });
  await store.appendObservation(observation(), LEASE_ID);
  assert.equal(calls[0].p_lease_token, LEASE_ID);
  assert.equal(Object.hasOwn(calls[0].p_record, "lease_token"), false);
  await assert.rejects(() => store.appendObservation(observation(), "stale"), /lease_token/i);
  assert.equal(calls.length, 1);
  assert.match(SQL, /lm_append_commerce_observation\(p_record jsonb, p_lease_token uuid\)/i);
  assert.match(SQL, /DROP FUNCTION IF EXISTS public\.lm_append_commerce_observation\(jsonb\)/i);
  assert.doesNotMatch(SQL, /GRANT EXECUTE ON FUNCTION public\.lm_append_commerce_observation\(jsonb\) TO service_role/i);
  assert.match(SQL, /FOR UPDATE;[\s\S]*?v_inbox\.state <> 'processing'[\s\S]*?v_inbox\.lease_token <> p_lease_token[\s\S]*?v_inbox\.lease_expires_at <= v_now/i);
  assert.match(SQL, /SET state = 'completed'[\s\S]*?completion_lease_token = p_lease_token/i);
  assert.match(SQL, /v_inbox\.state = 'completed' AND v_inbox\.completion_lease_token = p_lease_token/i);
  assert.match(SQL, /digest\(convert_to\(p_record::text, 'UTF8'\), 'sha256'\)/i);
  assert.doesNotMatch(SQL, /digest\([^;]*p_lease_token/i);
});

test("authoritative RPC counts refunds and chargebacks once against one payment budget", () => {
  assert.match(SQL, /v_reversed_minor \+ \(p_record->>'amount_minor'\)::bigint > v_original\.amount_minor/i);
  assert.match(SQL, /reverses_observation_ref = v_original\.observation_ref/i);
  assert.match(SQL, /invalid_payment_reversal/i);
  assert.match(SQL, /payment_reversal_exceeded/i);
});

test("store sends normalized records only to dedicated atomic RPCs and rejects readback drift", async () => {
  const calls = [];
  const store = createCommerceAssuranceStore({
    supaUrl: "https://db.invalid/", supaKey: "service",
    fetchImpl: async (url, init) => {
      const record = JSON.parse(init.body).p_record;
      calls.push({ url: String(url), record });
      return response({ created: true, record: { ...record, recorded_at: "2026-08-31T00:03:00.000Z" } });
    },
  });
  await store.putOfferVersion(offer());
  await store.putPromiseVersion(promise());
  assert.match(calls[0].url, /rpc\/lm_put_commerce_offer_version$/);
  assert.match(calls[1].url, /rpc\/lm_put_commerce_promise_version$/);
  assert.deepEqual(Object.keys(calls[0].record), Object.keys(buildOfferVersion(offer())));

  const drift = createCommerceAssuranceStore({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (_url, init) => {
      const record = JSON.parse(init.body).p_record;
      return response({ created: true, record: { ...record, uid: "tenant-2" } });
    },
  });
  await assert.rejects(() => drift.putOfferVersion(offer()), /boundary/i);
});

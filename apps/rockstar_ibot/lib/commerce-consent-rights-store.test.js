"use strict";
const { test } = require("node:test"); const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path");
const { createCommerceConsentRightsStore, normalizeRecord } = require("./commerce-consent-rights-store.js");
const OPTS = { supaUrl: "https://supa.invalid", supaKey: "service" };
const BASE = { uid: "u1", merchantRef: "merchant-a", subjectRef: "local-subject-3", purpose: "order_updates", scope: "transactional", channel: "sms", noticeVersion: "notice-4", policyVersion: "policy-8", evidenceReference: "consent-receipt://r-1", effectiveAt: "2026-08-31T00:00:00Z", reasonCode: "explicit_choice", idempotencyKey: "idem-1", revisionKey: "v1", recordedAt: "2026-08-31T00:01:00Z" };
function response(body, status = 200) { return { ok: status < 300, status, json: async () => body }; }

test("rights records require purpose/scope/channel, versions, evidence, and valid withdrawal timing", () => {
  const row = normalizeRecord({ ...BASE, rightState: "granted", expiresAt: "2026-09-30T00:00:00Z" });
  assert.equal(row.notice_version, "notice-4"); assert.equal(row.expires_at, "2026-09-30T00:00:00.000Z");
  assert.throws(() => normalizeRecord({ ...BASE, rightState: "withdrawn" }), /withdrawnAt/);
  assert.throws(() => normalizeRecord({ ...BASE, rightState: "granted", token: "secret" }), /not accepted/);
});

test("withdrawal blocks the exact purpose/channel while permission RPC remains merchant scoped", async () => {
  const calls = []; const store = createCommerceConsentRightsStore({ ...OPTS, fetchImpl: async (url, init) => { calls.push({ url, payload: JSON.parse(init.body) }); return response({ permitted: false, reason_code: "withdrawn", evidence_reference: "consent-receipt://withdraw-1" }); } });
  await assert.rejects(() => store.assertContactPermitted({ uid: "u1", merchantRef: "merchant-a", subjectRef: "local-subject-3", purpose: "marketing", scope: "campaign", channel: "sms", at: "2026-08-31T01:00:00Z" }), (error) => error.code === "commerce_contact_suppressed" && error.reasonCode === "withdrawn");
  assert.match(calls[0].url, /rpc\/lm_commerce_contact_permission$/); assert.equal(calls[0].payload.p_merchant_ref, "merchant-a"); assert.equal(calls[0].payload.p_purpose, "marketing");
});

test("append RPC returns idempotent duplicate and rejects changed-payload collision", async () => {
  const event = normalizeRecord({ ...BASE, rightState: "granted" }); let count = 0;
  const store = createCommerceConsentRightsStore({ ...OPTS, fetchImpl: async () => response({ created: count++ === 0, event }) });
  assert.equal((await store.recordRight({ ...BASE, rightState: "granted" })).created, true); assert.equal((await store.recordRight({ ...BASE, rightState: "granted" })).created, false);
  const collision = createCommerceConsentRightsStore({ ...OPTS, fetchImpl: async () => response({ message: "idempotency_collision" }, 409) });
  await assert.rejects(() => collision.recordRight({ ...BASE, rightState: "denied" }), (error) => error.code === "idempotency_collision");
});

test("migration enforces append-only service-only history and database suppression", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../migrations/2026-08-31-lm-commerce-rights-entitlements-decisions.sql"), "utf8");
  assert.match(sql, /lm_commerce_consent_rights is append-only/i); assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.lm_commerce_consent_rights FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.lm_commerce_consent_rights TO service_role/i);
  assert.match(sql, /lm_commerce_contact_permission/); assert.match(sql, /right_state = 'granted'/);
});

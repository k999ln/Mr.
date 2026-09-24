"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildWebhookEnvelope,
  createCommerceWebhookInbox,
} = require("./commerce-webhook-inbox.js");

const SQL = fs.readFileSync(path.join(
  __dirname, "../migrations/2026-08-31-lm-commerce-assurance-core.sql",
), "utf8");
const MERCHANT = "commerce://merchant/mrc_alpha";
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const INBOX_ID = "8c6fbd77-6086-4bf8-9870-9c129d71a9ee";
const LEASE_ID = "b8b545ea-1aa9-4985-9da5-83292ea74c01";

function envelope(overrides = {}) {
  return {
    uid: "tenant-1",
    merchantRef: MERCHANT,
    provider: "stripe",
    providerAccountId: "acct_platform_1",
    providerEventId: "evt_1",
    payloadSha256: HASH,
    evidenceRef: `provider://stripe/accounts/acct_platform_1/events/evt_1/sha256/${HASH}`,
    receivedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function row(overrides = {}) {
  const record = buildWebhookEnvelope(envelope());
  return {
    inbox_id: INBOX_ID,
    ...record,
    state: "received",
    attempt_count: 0,
    available_at: "2026-08-31T00:00:00.000Z",
    lease_token: null,
    lease_expires_at: null,
    last_error_code: null,
    processing_started_at: null,
    completed_at: null,
    failed_at: null,
    updated_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("migration defines durable merchant-scoped inbox states, indexes, collision detection, and no delete path", () => {
  assert.match(SQL, /CREATE TABLE IF NOT EXISTS public\.lm_commerce_webhook_inbox/i);
  assert.match(SQL, /state IN \('received', 'processing', 'completed', 'failed'\)/i);
  assert.match(SQL, /UNIQUE \(uid, merchant_ref, provider, provider_account_id, provider_event_id\)/i);
  assert.match(SQL, /payload_sha256 text NOT NULL/i);
  assert.match(SQL, /webhook_event_collision/i);
  assert.match(SQL, /FOR UPDATE SKIP LOCKED/i);
  assert.match(SQL, /state = 'processing' AND lease_expires_at <= clock_timestamp\(\)/i);
  assert.match(SQL, /SET state = CASE WHEN p_succeeded THEN 'completed' ELSE 'failed' END/i);
  assert.match(SQL, /state = 'processing' AND lease_token = p_lease_token\s+AND lease_expires_at > clock_timestamp\(\)/i);
  assert.match(SQL, /failed_at = CASE WHEN p_succeeded THEN failed_at ELSE clock_timestamp\(\) END/i);
  assert.doesNotMatch(SQL, /DELETE FROM public\.lm_commerce_webhook_inbox/i);
  assert.match(SQL, /lm_commerce_webhook_claim_idx/i);
  assert.match(SQL, /lm_commerce_webhook_recovery_idx/i);
});

test("envelopes retain hashes and exact evidence refs but reject raw payloads, PII, and secrets", () => {
  const built = buildWebhookEnvelope(envelope());
  assert.ok(Object.isFrozen(built));
  assert.equal(built.payload_sha256, HASH);
  assert.equal(built.evidence_ref, envelope().evidenceRef);
  for (const unsafe of [
    { ...envelope(), rawPayload: "{}" },
    { ...envelope(), body: { id: "evt_1" } },
    { ...envelope(), customerEmail: "person@example.test" },
    { ...envelope(), signingSecret: "raw" },
    { ...envelope(), evidenceRef: "provider://stripe/events/evt_1" },
    { ...envelope(), evidenceRef: `provider://paypal/events/evt_1/sha256/${HASH}` },
    { ...envelope(), evidenceRef: `provider://stripe/accounts/acct_other/events/evt_1/sha256/${HASH}` },
    { ...envelope(), payloadSha256: "ABC" },
  ]) assert.throws(() => buildWebhookEnvelope(unsafe), /privacy|PII|secret|field|evidence|sha256/i);
});

test("100 deliveries of one provider event create one durable inbox row", async () => {
  const durable = new Map();
  let inserts = 0;
  const inbox = createCommerceWebhookInbox({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (_url, init) => {
      const record = JSON.parse(init.body).p_record;
      const key = [record.uid, record.merchant_ref, record.provider,
        record.provider_account_id, record.provider_event_id].join("|");
      const existing = durable.get(key);
      if (existing && (existing.payload_sha256 !== record.payload_sha256
          || existing.evidence_ref !== record.evidence_ref)) {
        return response({ message: "webhook_event_collision", detail: "do not leak" }, 409);
      }
      if (!existing) {
        inserts += 1;
        durable.set(key, row());
      }
      return response({ created: !existing, inbox: durable.get(key) });
    },
  });
  const results = await Promise.all(Array.from({ length: 100 }, () => inbox.receive(envelope())));
  assert.equal(inserts, 1);
  assert.equal(durable.size, 1);
  assert.equal(results.filter((item) => item.created).length, 1);
  await assert.rejects(() => inbox.receive(envelope({
    payloadSha256: OTHER_HASH,
    evidenceRef: `provider://stripe/accounts/acct_platform_1/events/evt_1/sha256/${OTHER_HASH}`,
  })), (error) => error.code === "webhook_event_collision" && !error.message.includes("do not leak"));
});

test("claim is tenant/merchant scoped and accepts recovered expired processing rows", async () => {
  const calls = [];
  const inbox = createCommerceWebhookInbox({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return response([row({
        state: "processing", attempt_count: 2, lease_token: LEASE_ID,
        lease_expires_at: "2026-08-31T00:02:00.000Z",
        processing_started_at: "2026-08-31T00:00:00.000Z",
      })]);
    },
  });
  const claimed = await inbox.claim({
    uid: "tenant-1", merchantRef: MERCHANT, workerId: "worker-b", limit: 5, leaseSeconds: 90,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].attempt_count, 2);
  assert.deepEqual(calls[0].body, {
    p_uid: "tenant-1", p_merchant_ref: MERCHANT, p_worker_id: "worker-b",
    p_limit: 5, p_lease_seconds: 90,
  });
  assert.match(calls[0].url, /rpc\/lm_claim_commerce_webhooks$/);
});

test("failed processing is retained with retry metadata and can later complete", async () => {
  const calls = [];
  const inbox = createCommerceWebhookInbox({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.p_succeeded) return response(row({
        state: "completed", attempt_count: 2, completed_at: "2026-08-31T00:05:00.000Z",
      }));
      return response(row({
        state: "failed", attempt_count: 1, last_error_code: "provider_timeout",
        failed_at: "2026-08-31T00:01:00.000Z", available_at: "2026-08-31T00:02:00.000Z",
      }));
    },
  });
  const scope = {
    uid: "tenant-1", merchantRef: MERCHANT, inboxId: INBOX_ID, leaseToken: LEASE_ID,
  };
  const failed = await inbox.fail({ ...scope, errorCode: "provider_timeout", retrySeconds: 60 });
  assert.equal(failed.state, "failed");
  assert.equal(failed.inbox_id, INBOX_ID);
  assert.equal(failed.last_error_code, "provider_timeout");
  assert.ok(failed.failed_at);
  const completed = await inbox.complete(scope);
  assert.equal(completed.state, "completed");
  assert.equal(completed.inbox_id, INBOX_ID);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].p_succeeded, false);
  assert.equal(calls[1].p_succeeded, true);
});

test("scope drift, bad leases, and unsafe failure details fail closed", async () => {
  let fetches = 0;
  const drift = createCommerceWebhookInbox({
    supaUrl: "https://db.invalid", supaKey: "service",
    fetchImpl: async () => {
      fetches += 1;
      return response([row({ uid: "tenant-2", state: "processing", lease_token: LEASE_ID,
        lease_expires_at: "2026-08-31T00:02:00.000Z" })]);
    },
  });
  await assert.rejects(() => drift.claim({
    uid: "tenant-1", merchantRef: MERCHANT, workerId: "worker-b",
  }), /boundary/i);
  await assert.rejects(() => drift.fail({
    uid: "tenant-1", merchantRef: MERCHANT, inboxId: INBOX_ID,
    leaseToken: "not-a-uuid", errorCode: "provider_timeout",
  }), /lease_token/i);
  await assert.rejects(() => drift.fail({
    uid: "tenant-1", merchantRef: MERCHANT, inboxId: INBOX_ID,
    leaseToken: LEASE_ID, errorCode: "Bearer raw-secret",
  }), /error_code|format|privacy|secret|PII/i);
  assert.equal(fetches, 1);
});

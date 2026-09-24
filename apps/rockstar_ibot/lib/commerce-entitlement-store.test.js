"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createCommerceEntitlementStore,
  normalizeCredentialReference,
} = require("./commerce-entitlement-store.js");

const OPTIONS = { supaUrl: "https://supa.invalid/", supaKey: "service-role-test" };
const ROW = Object.freeze({
  uid: "tenant-1",
  connector_key: "stripe",
  active: true,
  connection_state: "selected",
  credential_reference: "vault://tenants/tenant-1/stripe",
  runtime_adapter_reference: null,
  selected_at: "2026-08-31T00:00:00.000Z",
  connected_at: null,
  disconnected_at: null,
  updated_at: "2026-08-31T00:00:00.000Z",
});

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(handler) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      const call = { url: String(url), init };
      calls.push(call);
      return handler(call, calls.length - 1);
    },
  };
}

test("select sends only uid, normalized connector key, and a credential reference to the atomic RPC", async () => {
  const stub = stubFetch(() => jsonResponse([ROW]));
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  const selected = await store.selectTool({
    uid: " tenant-1 ", connectorKey: " STRIPE ",
    credentialReference: "vault://tenants/tenant-1/stripe",
  });
  assert.equal(selected.connectorKey, "stripe");
  assert.equal(selected.connectionState, "selected");
  assert.equal(selected.credentialReference, "vault://tenants/tenant-1/stripe");
  assert.equal(stub.calls[0].url, "https://supa.invalid/rest/v1/rpc/lm_select_commerce_tool");
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
    p_uid: "tenant-1",
    p_connector_key: "stripe",
    p_credential_reference: "vault://tenants/tenant-1/stripe",
  });
  assert.doesNotMatch(stub.calls[0].init.body, /sk_live|password|access_token/);
});

test("raw secret-shaped inputs are rejected before fetch", async () => {
  const stub = stubFetch(() => { throw new Error("must not fetch"); });
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  for (const input of [
    { uid: "tenant-1", connectorKey: "stripe", credentials: { api_key: "raw" } },
    { uid: "tenant-1", connectorKey: "stripe", apiKey: "raw" },
    { uid: "tenant-1", connectorKey: "stripe", credentialReference: "sk_live_raw_secret" },
    { uid: "tenant-1", connectorKey: "stripe", credentialReference: "https://user:pass@example.test" },
  ]) {
    await assert.rejects(() => store.selectTool(input), /credential|secret-store reference/);
  }
  assert.equal(stub.calls.length, 0);
  assert.equal(normalizeCredentialReference("env://TENANT_STRIPE_CREDENTIAL"), "env://TENANT_STRIPE_CREDENTIAL");
});

test("disconnect uses the atomic RPC and returns an inactive disconnected selection", async () => {
  const disconnected = {
    ...ROW, active: false, connection_state: "disconnected", credential_reference: null,
    disconnected_at: "2026-08-31T01:00:00.000Z",
  };
  const stub = stubFetch(() => jsonResponse([disconnected]));
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  const result = await store.disconnectCommerceTool("tenant-1", "stripe");
  assert.equal(result.active, false);
  assert.equal(result.connectionState, "disconnected");
  assert.equal(result.credentialReference, null);
  assert.equal(stub.calls[0].url, "https://supa.invalid/rest/v1/rpc/lm_disconnect_commerce_tool");
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
    p_uid: "tenant-1", p_connector_key: "stripe",
  });
});

test("provider verification, not selection, marks a tool connected with adapter evidence", async () => {
  const connected = {
    ...ROW,
    connection_state: "connected",
    runtime_adapter_reference: "provider://commerce-adapter/stripe/v1",
    connected_at: "2026-08-31T01:00:00.000Z",
  };
  const stub = stubFetch(() => jsonResponse([connected]));
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  const result = await store.markToolConnected({
    uid: "tenant-1",
    connectorKey: "stripe",
    credentialReference: "vault://tenants/tenant-1/stripe",
    runtimeAdapterReference: "provider://commerce-adapter/stripe/v1",
  });
  assert.equal(result.connectionState, "connected");
  assert.equal(result.runtimeAdapterReference, "provider://commerce-adapter/stripe/v1");
  assert.match(stub.calls[0].url, /rpc\/lm_mark_commerce_tool_connected$/);
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), {
    p_uid: "tenant-1",
    p_connector_key: "stripe",
    p_credential_reference: "vault://tenants/tenant-1/stripe",
    p_runtime_adapter_reference: "provider://commerce-adapter/stripe/v1",
  });
});

test("connection refuses missing or non-provider runtime evidence before fetch", async () => {
  const stub = stubFetch(() => { throw new Error("must not fetch"); });
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  await assert.rejects(() => store.markToolConnected({
    uid: "tenant-1",
    connectorKey: "stripe",
    credentialReference: "vault://tenants/tenant-1/stripe",
  }), /evidence|required/);
  await assert.rejects(() => store.markToolConnected({
    uid: "tenant-1",
    connectorKey: "stripe",
    credentialReference: "vault://tenants/tenant-1/stripe",
    runtimeAdapterReference: "vault://not-an-adapter",
  }), /provider reference/);
  assert.equal(stub.calls.length, 0);
});

test("entitlement read is tenant-filtered and counts only active unique selections", async () => {
  const disconnected = {
    ...ROW, connector_key: "email", active: false, connection_state: "disconnected",
    credential_reference: null,
  };
  const stub = stubFetch((call) => {
    if (call.url.includes("/lm_users?")) return jsonResponse([{ uid: "tenant-1", paid: false }]);
    return jsonResponse([ROW, disconnected]);
  });
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  const result = await store.getEntitlement("tenant-1");
  assert.deepEqual(result.activeToolKeys, ["stripe"]);
  assert.equal(result.active_tool_limit, 3);
  assert.match(stub.calls[0].url, /uid=eq\.tenant-1&select=uid,paid&limit=2$/);
  assert.match(stub.calls[1].url, /lm_commerce_tool_selections\?uid=eq\.tenant-1/);
});

test("free limit errors are preserved without leaking provider response details", async () => {
  const stub = stubFetch(() => jsonResponse({ message: "free_tool_limit_reached", details: "internal" }, 400));
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  await assert.rejects(
    () => store.selectTool({ uid: "tenant-1", connectorKey: "lms" }),
    (error) => error.code === "free_tool_limit_reached" && error.status === 400
      && !error.message.includes("internal"),
  );
});

test("store rejects a row returned across the requested tenant boundary", async () => {
  const stub = stubFetch(() => jsonResponse([{ ...ROW, uid: "tenant-2" }]));
  const store = createCommerceEntitlementStore({ ...OPTIONS, fetchImpl: stub.fetchImpl });
  await assert.rejects(
    () => store.selectTool({ uid: "tenant-1", connectorKey: "stripe" }),
    /crossed the tenant boundary/,
  );
});

test("migration pins text tenant identity, unique tools, three-free atomicity, and reference-only storage", () => {
  const migration = fs.readFileSync(path.join(
    __dirname, "../migrations/2026-08-31-lm-commerce-tool-selections.sql",
  ), "utf8");
  assert.match(migration, /uid text NOT NULL REFERENCES public\.lm_users\(uid\)/);
  assert.match(migration, /PRIMARY KEY \(uid, connector_key\)/);
  assert.match(migration, /FROM public\.lm_users[\s\S]*FOR UPDATE/);
  assert.match(migration, /WHERE selection\.uid = p_uid[\s\S]*AND selection\.active/);
  assert.match(migration, /IF NOT v_paid AND v_active_count >= 3/);
  assert.match(migration, /ON CONFLICT \(uid, connector_key\) DO UPDATE/);
  assert.match(migration, /credential_reference text/);
  assert.match(migration, /runtime_adapter_reference text/);
  assert.match(migration, /lm_mark_commerce_tool_connected/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.lm_commerce_tool_selections TO service_role/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*FROM service_role/);
  assert.doesNotMatch(migration, /\b(api_key|access_token|refresh_token|client_secret|password|private_key)\b/i);
  assert.match(migration, /SET active = false,[\s\S]*connection_state = 'disconnected'/);
});

"use strict";

const {
  requireCommerceConnector,
} = require("./commerce-connector-catalog.js");
const {
  activeCommerceToolKeys,
  commerceEntitlementFor,
} = require("./commerce-entitlement-policy.js");

const CREDENTIAL_REFERENCE_PATTERN = /^(?:credential|vault|secret|keychain|env|managed|provider|composio|artifact):\/\/[A-Za-z0-9][A-Za-z0-9._~:/@+-]{0,510}$/;
const SELECTION_COLUMNS = [
  "uid",
  "connector_key",
  "active",
  "connection_state",
  "credential_reference",
  "runtime_adapter_reference",
  "selected_at",
  "connected_at",
  "disconnected_at",
  "updated_at",
].join(",");
const FORBIDDEN_INPUT_FIELDS = new Set([
  "credentials", "credential", "secret", "password", "apiKey", "api_key",
  "accessToken", "access_token", "refreshToken", "refresh_token", "clientSecret", "client_secret",
]);

class CommerceEntitlementStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "CommerceEntitlementStoreError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new CommerceEntitlementStoreError(code, message, details);
}

function tenantUid(value) {
  const uid = typeof value === "string" ? value.trim() : "";
  if (!uid || uid.length > 256) fail("invalid_tenant_uid", "commerce tenant uid is required");
  return uid;
}

function rejectSecretInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_FIELDS.has(key)) {
      fail("credential_secret_rejected", `use credentialReference instead of ${key}`);
    }
  }
}

function normalizeCredentialReference(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim() !== value
    || !CREDENTIAL_REFERENCE_PATTERN.test(value)) {
    fail("invalid_credential_reference", "credentials must be represented by a secret-store reference URI");
  }
  return value;
}

function normalizeRuntimeAdapterReference(value) {
  if (value == null || value === "") return null;
  const reference = normalizeCredentialReference(value);
  if (!/^(?:provider|managed|composio):\/\//.test(reference)) {
    fail("invalid_runtime_adapter_reference", "runtime adapters must use a provider reference URI");
  }
  return reference;
}

function normalizeSelection(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    fail("storage_error", "commerce selection store returned an invalid row");
  }
  const connector = requireCommerceConnector(row.connector_key);
  if (typeof row.active !== "boolean") fail("storage_error", "commerce selection row has invalid active state");
  const state = row.connection_state;
  if (!new Set(["selected", "connected", "disconnected"]).has(state)) {
    fail("storage_error", "commerce selection row has invalid connection state");
  }
  const stateIsActive = state === "selected" || state === "connected";
  if (row.active !== stateIsActive) {
    fail("storage_error", "commerce selection active and connection state disagree");
  }
  const credentialReference = normalizeCredentialReference(row.credential_reference);
  const runtimeAdapterReference = normalizeRuntimeAdapterReference(row.runtime_adapter_reference);
  return Object.freeze({
    uid: tenantUid(row.uid),
    connectorKey: connector.key,
    active: row.active,
    connectionState: state,
    credentialReference,
    runtimeAdapterReference,
    selectedAt: row.selected_at || null,
    connectedAt: row.connected_at || null,
    disconnectedAt: row.disconnected_at || null,
    updatedAt: row.updated_at || null,
  });
}

function credentials(options = {}) {
  const supaUrl = String(options.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = options.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") {
    fail("storage_unavailable", "commerce entitlement store needs Supabase credentials and fetch");
  }
  return { supaUrl, supaKey, fetchImpl };
}

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function responseJson(response, label) {
  if (!response || !response.ok) {
    const status = response && response.status;
    const body = response && typeof response.json === "function"
      ? await response.json().catch(() => null)
      : null;
    const providerCode = body && typeof body.message === "string" ? body.message : "";
    const code = providerCode === "free_tool_limit_reached" ? providerCode : "storage_error";
    fail(code, `${label} failed`, { status });
  }
  return response.json().catch(() => fail("storage_error", `${label} returned invalid JSON`));
}

function exactlyOneRow(body, label, expectedUid) {
  const row = Array.isArray(body) ? (body.length === 1 ? body[0] : null) : body;
  if (!row || typeof row !== "object") fail("storage_error", `${label} did not return exactly one row`);
  const selection = normalizeSelection(row);
  if (expectedUid && selection.uid !== expectedUid) {
    fail("storage_error", `${label} crossed the tenant boundary`);
  }
  return selection;
}

function selectionInput(input, connectorKey, credentialReference) {
  if (typeof input === "string") {
    return { uid: input, connectorKey, credentialReference };
  }
  return input || {};
}

function createCommerceEntitlementStore(options = {}) {
  const client = credentials(options);

  async function rpc(name, payload) {
    const response = await client.fetchImpl(`${client.supaUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: headers(client.supaKey),
      body: JSON.stringify(payload),
    }).catch(() => null);
    return responseJson(response, `commerce entitlement RPC ${name}`);
  }

  async function listSelections(uidInput) {
    const uid = tenantUid(typeof uidInput === "object" && uidInput ? uidInput.uid : uidInput);
    const url = `${client.supaUrl}/rest/v1/lm_commerce_tool_selections`
      + `?uid=eq.${encodeURIComponent(uid)}`
      + `&select=${SELECTION_COLUMNS}&order=connector_key.asc`;
    const response = await client.fetchImpl(url, { headers: headers(client.supaKey) }).catch(() => null);
    const rows = await responseJson(response, "commerce selection read");
    if (!Array.isArray(rows)) fail("storage_error", "commerce selection read returned a non-array body");
    const selections = rows.map(normalizeSelection);
    if (selections.some((selection) => selection.uid !== uid)) {
      fail("storage_error", "commerce selection read crossed the tenant boundary");
    }
    return Object.freeze(selections);
  }

  async function selectTool(input, connectorKey, credentialReference) {
    const value = selectionInput(input, connectorKey, credentialReference);
    rejectSecretInput(value);
    const uid = tenantUid(value.uid);
    const connector = requireCommerceConnector(value.connectorKey || value.connector_key);
    const reference = normalizeCredentialReference(
      value.credentialReference === undefined ? value.credential_reference : value.credentialReference,
    );
    const body = await rpc("lm_select_commerce_tool", {
      p_uid: uid,
      p_connector_key: connector.key,
      p_credential_reference: reference,
    });
    return exactlyOneRow(body, "commerce tool selection", uid);
  }

  async function disconnectTool(input, connectorKey) {
    const value = selectionInput(input, connectorKey);
    rejectSecretInput(value);
    const uid = tenantUid(value.uid);
    const connector = requireCommerceConnector(value.connectorKey || value.connector_key);
    const body = await rpc("lm_disconnect_commerce_tool", {
      p_uid: uid,
      p_connector_key: connector.key,
    });
    return exactlyOneRow(body, "commerce tool disconnect", uid);
  }

  // Only a provider-specific connection flow should call this after it has verified both the
  // tenant setup reference and the adapter it will execute through. Selecting a button is never
  // treated as proof of connection.
  async function markToolConnected(input) {
    const value = input || {};
    rejectSecretInput(value);
    const uid = tenantUid(value.uid);
    const connector = requireCommerceConnector(value.connectorKey || value.connector_key);
    const reference = normalizeCredentialReference(
      value.credentialReference === undefined ? value.credential_reference : value.credentialReference,
    );
    const runtimeReference = normalizeRuntimeAdapterReference(
      value.runtimeAdapterReference === undefined
        ? value.runtime_adapter_reference
        : value.runtimeAdapterReference,
    );
    if (!reference || !runtimeReference) {
      fail("connection_evidence_missing", "verified setup and runtime adapter references are required");
    }
    const body = await rpc("lm_mark_commerce_tool_connected", {
      p_uid: uid,
      p_connector_key: connector.key,
      p_credential_reference: reference,
      p_runtime_adapter_reference: runtimeReference,
    });
    return exactlyOneRow(body, "commerce tool connection", uid);
  }

  async function getEntitlement(uidInput) {
    const uid = tenantUid(typeof uidInput === "object" && uidInput ? uidInput.uid : uidInput);
    const userUrl = `${client.supaUrl}/rest/v1/lm_users?uid=eq.${encodeURIComponent(uid)}`
      + "&select=uid,paid&limit=2";
    const response = await client.fetchImpl(userUrl, { headers: headers(client.supaKey) }).catch(() => null);
    const users = await responseJson(response, "commerce tenant entitlement read");
    if (!Array.isArray(users) || users.length !== 1 || users[0].uid !== uid) {
      fail("tenant_not_found", "commerce tenant lookup did not resolve exactly one row");
    }
    const selections = await listSelections(uid);
    const entitlement = commerceEntitlementFor(users[0]);
    return Object.freeze({
      ...entitlement,
      uid,
      activeToolKeys: activeCommerceToolKeys(selections),
      selections,
    });
  }

  return Object.freeze({
    listSelections,
    listCommerceToolSelections: listSelections,
    selectTool,
    selectCommerceTool: selectTool,
    disconnectTool,
    disconnectCommerceTool: disconnectTool,
    markToolConnected,
    markCommerceToolConnected: markToolConnected,
    getEntitlement,
    getCommerceEntitlement: getEntitlement,
  });
}

module.exports = {
  CREDENTIAL_REFERENCE_PATTERN,
  CommerceEntitlementStoreError,
  normalizeCredentialReference,
  normalizeRuntimeAdapterReference,
  normalizeSelection,
  createCommerceEntitlementStore,
  createStore: createCommerceEntitlementStore,
};

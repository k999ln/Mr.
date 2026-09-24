"use strict";

const manifest = require("../config/commerce-connectors.json");

const CATALOG_SCHEMA_VERSION = 1;
const EFFECT_CLASSES = new Set(["none", "publish", "message", "money"]);
const SETUP_MODES = new Set([
  "artifact_reference",
  "credential_reference",
  "managed_reference",
]);
const AVAILABILITY_STATUSES = new Set(["available", "limited", "planned", "unavailable"]);
const CONNECTOR_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
const FORBIDDEN_SECRET_FIELDS = /^(?:api_?key|access_?token|refresh_?token|client_?secret|password|private_?key|secret)$/i;

function invalid(reason) {
  throw new Error(`commerce connector catalog invalid: ${reason}`);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function nonEmptyText(value, label, max = 1000) {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > max) {
    invalid(label);
  }
  return value;
}

function assertSecretFree(value, path = "catalog") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${path}[${index}]`));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_FIELDS.test(key)) invalid(`${path}.${key} must not hold secret material`);
    assertSecretFree(item, `${path}.${key}`);
  }
}

function validateAvailability(value, key) {
  if (!plainObject(value)) invalid(`${key}.availability`);
  if (!AVAILABILITY_STATUSES.has(value.status)) invalid(`${key}.availability.status`);
  if (typeof value.selectable !== "boolean" || typeof value.runtime_ready !== "boolean") {
    invalid(`${key}.availability flags`);
  }
  nonEmptyText(value.note, `${key}.availability.note`, 1000);
  if (value.status === "planned" && value.runtime_ready) invalid(`${key}.availability is contradictory`);
  if (value.runtime_ready && !value.selectable) invalid(`${key}.availability runtime cannot be selected`);
  if (value.status === "available" && !value.runtime_ready) invalid(`${key}.availability is not runtime ready`);
  if (value.status === "unavailable" && value.selectable) invalid(`${key}.availability is selectable`);
}

function validateConnector(value, seen) {
  if (!plainObject(value)) invalid("connector entry");
  const key = nonEmptyText(value.key, "connector key", 80);
  if (!CONNECTOR_KEY_PATTERN.test(key) || seen.has(key)) invalid(`connector key ${key}`);
  seen.add(key);
  nonEmptyText(value.name, `${key}.name`, 120);
  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0) {
    invalid(`${key}.capabilities`);
  }
  const capabilities = new Set();
  for (const capability of value.capabilities) {
    nonEmptyText(capability, `${key}.capability`, 120);
    if (!CAPABILITY_PATTERN.test(capability) || capabilities.has(capability)) {
      invalid(`${key}.capability ${capability}`);
    }
    capabilities.add(capability);
  }
  if (!EFFECT_CLASSES.has(value.effect_class)) invalid(`${key}.effect_class`);
  if (typeof value.approval_required !== "boolean") invalid(`${key}.approval_required`);
  if (typeof value.readback_required !== "boolean") invalid(`${key}.readback_required`);
  if (value.effect_class !== "none" && (!value.approval_required || !value.readback_required)) {
    invalid(`${key}.effect safety contract`);
  }
  if (!SETUP_MODES.has(value.setup_mode)) invalid(`${key}.setup_mode`);
  validateAvailability(value.availability, key);
  if (!Array.isArray(value.limitations)) invalid(`${key}.limitations`);
  value.limitations.forEach((item) => nonEmptyText(item, `${key}.limitation`, 1000));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validateManifest(value) {
  if (!plainObject(value) || value.schema_version !== CATALOG_SCHEMA_VERSION) {
    invalid("schema version");
  }
  if (!Array.isArray(value.connectors) || value.connectors.length === 0) {
    invalid("connectors");
  }
  assertSecretFree(value);
  const seen = new Set();
  value.connectors.forEach((connector) => validateConnector(connector, seen));
  return value;
}

const validatedManifest = validateManifest(manifest);
const COMMERCE_CONNECTOR_CATALOG = deepFreeze(validatedManifest.connectors);
const CONNECTORS_BY_KEY = new Map(COMMERCE_CONNECTOR_CATALOG.map((connector) => [
  connector.key,
  connector,
]));
const COMMERCE_CONNECTOR_KEYS = Object.freeze([...CONNECTORS_BY_KEY.keys()]);

function normalizeConnectorKey(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CONNECTOR_KEY_PATTERN.test(key) ? key : "";
}

function listCommerceConnectors() {
  return COMMERCE_CONNECTOR_CATALOG;
}

function getCommerceConnector(value) {
  return CONNECTORS_BY_KEY.get(normalizeConnectorKey(value)) || null;
}

function requireCommerceConnector(value) {
  const connector = getCommerceConnector(value);
  if (!connector) throw new Error("commerce connector key invalid");
  return connector;
}

function isCommerceConnectorKey(value) {
  return getCommerceConnector(value) !== null;
}

function isCommerceConnectorSelectable(value) {
  const connector = getCommerceConnector(value);
  return Boolean(connector && connector.availability.selectable);
}

function isCommerceConnectorRuntimeReady(value) {
  const connector = getCommerceConnector(value);
  return Boolean(connector && connector.availability.runtime_ready);
}

// Catalog readiness and tenant connection are deliberately separate. A connector can be offered
// for selection before its adapter is production-ready, and selecting it never proves that a
// tenant credential has been connected. Consumers can use this projection without inventing either
// state from the other.
function commerceConnectorReadiness(value, selection = null) {
  const connector = requireCommerceConnector(value);
  const state = selection && typeof selection === "object"
    ? selection.connection_state || selection.connectionState || selection.state || null
    : null;
  const active = Boolean(selection && typeof selection === "object" && selection.active === true);
  const selected = active && state !== "disconnected";
  const connected = selected && state === "connected";
  const runtimeReady = connector.availability.runtime_ready;
  return Object.freeze({
    connectorKey: connector.key,
    selectable: connector.availability.selectable,
    selected,
    connected,
    runtimeReady,
    executable: connected && runtimeReady,
  });
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  COMMERCE_CONNECTOR_CATALOG,
  COMMERCE_CONNECTOR_KEYS,
  // Short aliases keep consumers concise while retaining domain-specific exports.
  CONNECTORS: COMMERCE_CONNECTOR_CATALOG,
  CONNECTOR_KEYS: COMMERCE_CONNECTOR_KEYS,
  listCommerceConnectors,
  listConnectors: listCommerceConnectors,
  getCommerceConnector,
  getConnector: getCommerceConnector,
  requireCommerceConnector,
  isCommerceConnectorKey,
  isCommerceConnectorSelectable,
  isCommerceConnectorRuntimeReady,
  commerceConnectorReadiness,
  validateManifest,
};

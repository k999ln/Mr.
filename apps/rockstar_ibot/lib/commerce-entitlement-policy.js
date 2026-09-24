"use strict";

const {
  requireCommerceConnector,
  isCommerceConnectorSelectable,
} = require("./commerce-connector-catalog.js");

const FREE_ACTIVE_TOOL_LIMIT = 3;

function paidValue(value) {
  if (value && typeof value === "object") return value.paid === true;
  return value === true;
}

function commerceEntitlementFor(value) {
  const paid = paidValue(value);
  return Object.freeze({
    plan: paid ? "paid" : "free",
    paid,
    active_tool_limit: paid ? null : FREE_ACTIVE_TOOL_LIMIT,
    all_catalog_tools: paid,
  });
}

function selectionKey(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.connector_key || value.connectorKey || value.key || "";
}

function selectionIsActive(value) {
  if (typeof value === "string") return true;
  if (!value || typeof value !== "object") return false;
  const state = value.connection_state || value.connectionState || value.status || value.state;
  // A disconnected row never consumes a slot, even if a stale caller also supplied active=true.
  if (state === "disconnected" || state === "inactive" || state === "revoked") return false;
  if (Object.prototype.hasOwnProperty.call(value, "active")) return value.active === true;
  if (state != null) return state === "connected" || state === "active" || state === "selected";
  if (Object.prototype.hasOwnProperty.call(value, "connected")) return value.connected === true;
  return false;
}

function activeCommerceToolKeys(selections = []) {
  if (!Array.isArray(selections)) throw new TypeError("commerce tool selections must be an array");
  const keys = new Set();
  for (const selection of selections) {
    if (!selectionIsActive(selection)) continue;
    const connector = requireCommerceConnector(selectionKey(selection));
    keys.add(connector.key);
  }
  return Object.freeze([...keys]);
}

function inputSelections(input) {
  if (!input || typeof input !== "object") return [];
  if (input.activeConnectorKeys !== undefined) return input.activeConnectorKeys;
  if (input.activeToolKeys !== undefined) return input.activeToolKeys;
  return input.selections || [];
}

function evaluateCommerceToolSelection(input = {}) {
  const connector = requireCommerceConnector(input.connectorKey || input.connector_key);
  const entitlement = commerceEntitlementFor(input);
  const activeKeys = activeCommerceToolKeys(inputSelections(input));
  const alreadySelected = activeKeys.includes(connector.key);
  const activeCount = activeKeys.length;
  const resultingActiveCount = activeCount + (alreadySelected ? 0 : 1);
  let allowed = false;
  let reason;

  if (!isCommerceConnectorSelectable(connector.key)) {
    reason = "connector_unavailable";
  } else if (alreadySelected) {
    allowed = true;
    reason = "already_selected";
  } else if (entitlement.paid) {
    allowed = true;
    reason = "paid_catalog_access";
  } else if (resultingActiveCount <= FREE_ACTIVE_TOOL_LIMIT) {
    allowed = true;
    reason = "free_slot_available";
  } else {
    reason = "free_tool_limit_reached";
  }

  const remaining = entitlement.active_tool_limit == null
    ? null
    : Math.max(0, entitlement.active_tool_limit - (allowed ? resultingActiveCount : activeCount));
  return Object.freeze({
    allowed,
    reason,
    connectorKey: connector.key,
    alreadySelected,
    activeCount,
    resultingActiveCount: allowed ? resultingActiveCount : activeCount,
    limit: entitlement.active_tool_limit,
    remaining,
    paid: entitlement.paid,
    plan: entitlement.plan,
  });
}

function canSelectCommerceTool(input) {
  return evaluateCommerceToolSelection(input).allowed;
}

function assertCommerceToolSelection(input) {
  const decision = evaluateCommerceToolSelection(input);
  if (decision.allowed) return decision;
  const error = new Error(decision.reason);
  error.code = decision.reason;
  error.decision = decision;
  throw error;
}

module.exports = {
  FREE_ACTIVE_TOOL_LIMIT,
  FREE_TOOL_LIMIT: FREE_ACTIVE_TOOL_LIMIT,
  commerceEntitlementFor,
  entitlementForCommerce: commerceEntitlementFor,
  activeCommerceToolKeys,
  activeToolKeys: activeCommerceToolKeys,
  selectionIsActive,
  evaluateCommerceToolSelection,
  evaluateToolSelection: evaluateCommerceToolSelection,
  canSelectCommerceTool,
  assertCommerceToolSelection,
};

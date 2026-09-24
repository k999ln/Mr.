"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  FREE_ACTIVE_TOOL_LIMIT,
  activeCommerceToolKeys,
  commerceEntitlementFor,
  evaluateCommerceToolSelection,
} = require("./commerce-entitlement-policy.js");

const THREE = ["telegram", "x", "stripe"];

test("free tenants receive three active tools while paid tenants have no catalog limit", () => {
  assert.equal(FREE_ACTIVE_TOOL_LIMIT, 3);
  assert.deepEqual(commerceEntitlementFor({ paid: false }), {
    plan: "free", paid: false, active_tool_limit: 3, all_catalog_tools: false,
  });
  assert.deepEqual(commerceEntitlementFor({ paid: true }), {
    plan: "paid", paid: true, active_tool_limit: null, all_catalog_tools: true,
  });
});

test("one unique active connector key is one tool and reselect is idempotent", () => {
  const selections = [
    ...THREE.map((connector_key) => ({ connector_key, active: true, connection_state: "selected" })),
    { connector_key: "telegram", active: true, connection_state: "connected" },
  ];
  assert.deepEqual(activeCommerceToolKeys(selections), THREE);
  assert.deepEqual(evaluateCommerceToolSelection({
    paid: false, connectorKey: "telegram", selections,
  }), {
    allowed: true,
    reason: "already_selected",
    connectorKey: "telegram",
    alreadySelected: true,
    activeCount: 3,
    resultingActiveCount: 3,
    limit: 3,
    remaining: 0,
    paid: false,
    plan: "free",
  });
});

test("a fourth active free tool is denied and the same selection is allowed for paid", () => {
  const free = evaluateCommerceToolSelection({ paid: false, connectorKey: "lms", activeToolKeys: THREE });
  assert.equal(free.allowed, false);
  assert.equal(free.reason, "free_tool_limit_reached");
  assert.equal(free.resultingActiveCount, 3);
  const paid = evaluateCommerceToolSelection({ paid: true, connectorKey: "lms", activeToolKeys: THREE });
  assert.equal(paid.allowed, true);
  assert.equal(paid.reason, "paid_catalog_access");
  assert.equal(paid.resultingActiveCount, 4);
  assert.equal(paid.limit, null);
});

test("disconnect does not count even when stale input also says active", () => {
  const selections = THREE.map((connector_key) => ({
    connector_key,
    active: true,
    connection_state: connector_key === "telegram" ? "disconnected" : "selected",
  }));
  assert.deepEqual(activeCommerceToolKeys(selections), THREE.slice(1));
  const decision = evaluateCommerceToolSelection({ paid: false, connectorKey: "lms", selections });
  assert.equal(decision.allowed, true);
  assert.equal(decision.activeCount, 2);
  assert.equal(decision.resultingActiveCount, 3);
});

test("invalid and inactive rows cannot silently distort entitlement counts", () => {
  assert.deepEqual(activeCommerceToolKeys([
    { connector_key: "stripe", active: false, connection_state: "selected" },
    { connector_key: "email", connection_state: "disconnected" },
  ]), []);
  assert.throws(() => activeCommerceToolKeys(["not-a-catalog-tool"]), /connector key invalid/);
  assert.throws(() => activeCommerceToolKeys({}), /must be an array/);
});

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  COMMERCE_CONNECTOR_CATALOG,
  COMMERCE_CONNECTOR_KEYS,
  commerceConnectorReadiness,
  getCommerceConnector,
  isCommerceConnectorRuntimeReady,
  isCommerceConnectorSelectable,
  validateManifest,
} = require("./commerce-connector-catalog.js");

const EXPECTED_KEYS = [
  "telegram", "x", "telegram-stars", "stripe", "email", "landing-page", "lms",
  "software-license", "community", "brain-import",
];

test("catalog exposes all ten unique selectable commerce tools and their safety contract", () => {
  assert.deepEqual(COMMERCE_CONNECTOR_KEYS, EXPECTED_KEYS);
  assert.equal(COMMERCE_CONNECTOR_CATALOG.length, 10);
  for (const connector of COMMERCE_CONNECTOR_CATALOG) {
    assert.ok(connector.capabilities.length > 0);
    assert.match(connector.effect_class, /^(none|publish|message|money)$/);
    assert.equal(typeof connector.approval_required, "boolean");
    assert.equal(typeof connector.readback_required, "boolean");
    assert.match(connector.setup_mode, /_reference$/);
    assert.equal(typeof connector.availability.selectable, "boolean");
    assert.equal(typeof connector.availability.runtime_ready, "boolean");
    assert.equal(isCommerceConnectorSelectable(connector.key), true);
  }
  assert.equal(isCommerceConnectorRuntimeReady("telegram"), false);
  assert.equal(COMMERCE_CONNECTOR_CATALOG.filter((item) => item.availability.runtime_ready).length, 0);
});

test("catalog lookups normalize keys, stay immutable, and reject unknown keys", () => {
  assert.equal(getCommerceConnector("  STRIPE ").key, "stripe");
  assert.equal(getCommerceConnector("not-drafted"), null);
  assert.ok(Object.isFrozen(COMMERCE_CONNECTOR_CATALOG));
  assert.ok(Object.isFrozen(getCommerceConnector("stripe")));
  assert.throws(() => COMMERCE_CONNECTOR_CATALOG.push({}), TypeError);
});

test("readiness does not confuse selectable, selected, connected, and runtime ready", () => {
  assert.deepEqual(commerceConnectorReadiness("telegram"), {
    connectorKey: "telegram",
    selectable: true,
    selected: false,
    connected: false,
    runtimeReady: false,
    executable: false,
  });
  assert.deepEqual(commerceConnectorReadiness("telegram", {
    active: true,
    connection_state: "selected",
  }), {
    connectorKey: "telegram",
    selectable: true,
    selected: true,
    connected: false,
    runtimeReady: false,
    executable: false,
  });
  assert.equal(commerceConnectorReadiness("telegram", {
    active: true,
    connection_state: "connected",
  }).executable, false);
  assert.equal(commerceConnectorReadiness("stripe", {
    active: true,
    connection_state: "connected",
  }).executable, false, "a tenant connection cannot make an unwired adapter runtime-ready");
});

test("manifest validation fails closed on secret fields and dishonest runtime claims", () => {
  const base = JSON.parse(JSON.stringify({ schema_version: 1, connectors: [getCommerceConnector("telegram")] }));
  assert.throws(() => validateManifest({
    ...base,
    connectors: [{ ...base.connectors[0], api_key: "do-not-store" }],
  }), /must not hold secret material/);
  assert.throws(() => validateManifest({
    ...base,
    connectors: [{
      ...base.connectors[0],
      availability: {
        ...base.connectors[0].availability,
        runtime_ready: true,
        selectable: false,
      },
    }],
  }), /runtime cannot be selected/);
  assert.throws(() => validateManifest({
    ...base,
    connectors: [{ ...base.connectors[0], readback_required: false }],
  }), /effect safety contract/);
});

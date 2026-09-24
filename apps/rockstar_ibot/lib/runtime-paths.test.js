"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveDataRoot, resolveRuntimePaths } = require("./runtime-paths.js");

test("resolves local runtime directories beneath Rockstar_ibot-owned absolute roots", () => {
  const env = {
    LM_MODE: "local",
    LM_DATA_DIR: "/var/lib/rockstar_ibot",
    LM_CACHE_DIR: "/var/cache/rockstar_ibot",
  };

  assert.deepEqual(resolveRuntimePaths(env), {
    dataDir: "/var/lib/rockstar_ibot",
    cacheDir: "/var/cache/rockstar_ibot",
    objectDir: "/var/lib/rockstar_ibot/objects",
    receiptDir: "/var/lib/rockstar_ibot/receipts",
    logDir: "/var/lib/rockstar_ibot/logs",
  });
});

test("cloud mode uses the same runtime path contract", () => {
  assert.deepEqual(resolveRuntimePaths({
    LM_MODE: "cloud",
    LM_DATA_DIR: "/srv/rockstar_ibot/data",
    LM_CACHE_DIR: "/srv/rockstar_ibot/cache",
  }), {
    dataDir: "/srv/rockstar_ibot/data",
    cacheDir: "/srv/rockstar_ibot/cache",
    objectDir: "/srv/rockstar_ibot/data/objects",
    receiptDir: "/srv/rockstar_ibot/data/receipts",
    logDir: "/srv/rockstar_ibot/data/logs",
  });
});

test("fails closed when mode is unset or unsupported", () => {
  assert.throws(
    () => resolveRuntimePaths({
      LM_DATA_DIR: "/var/lib/rockstar_ibot",
      LM_CACHE_DIR: "/var/cache/rockstar_ibot",
    }),
    /LM_MODE/,
  );
  assert.throws(
    () => resolveRuntimePaths({
      LM_MODE: "hybrid",
      LM_DATA_DIR: "/var/lib/rockstar_ibot",
      LM_CACHE_DIR: "/var/cache/rockstar_ibot",
    }),
    /LM_MODE/,
  );
});

test("rejects missing or relative runtime roots", () => {
  assert.throws(
    () => resolveRuntimePaths({
      LM_MODE: "local",
      LM_DATA_DIR: "state",
      LM_CACHE_DIR: "/var/cache/rockstar_ibot",
    }),
    /LM_DATA_DIR.*absolute/i,
  );
  assert.throws(
    () => resolveRuntimePaths({
      LM_MODE: "local",
      LM_DATA_DIR: "/var/lib/rockstar_ibot",
    }),
    /LM_CACHE_DIR.*absolute/i,
  );
});

test("rejects legacy execution roots and traversal into them", () => {
  const forbidden = [
    "/Users/operator/.openclaw/state",
    "/Users/operator/profitable-claude/state",
    "/Users/operator/anicca/state",
    "/srv/anicca/state",
    "/Users/operator/life-manager-v0/state",
    "/srv/rockstar_ibot/allowed/../../profitable-claude/cache",
  ];

  for (const candidate of forbidden) {
    assert.throws(
      () => resolveRuntimePaths({
        LM_MODE: "local",
        LM_DATA_DIR: candidate,
        LM_CACHE_DIR: "/var/cache/rockstar_ibot",
      }),
      /legacy runtime root/i,
      candidate,
    );
  }
});

test("resolveDataRoot prefers LM_DATA_DIR and falls back to the portable state root", () => {
  assert.equal(
    resolveDataRoot({ LM_DATA_DIR: "/var/lib/rockstar_ibot" }),
    "/var/lib/rockstar_ibot",
  );
  assert.equal(
    resolveDataRoot({ HOME: "/Users/operator" }),
    "/Users/operator/.local/state/rockstar_ibot",
  );
});

test("resolveDataRoot fails closed on relative overrides and legacy roots", () => {
  assert.throws(
    () => resolveDataRoot({ LM_DATA_DIR: "state" }),
    /absolute/i,
  );
  assert.throws(
    () => resolveDataRoot({ LM_DATA_DIR: "/Users/operator/.openclaw/state" }),
    /legacy runtime root/i,
  );
  assert.throws(
    () => resolveDataRoot({ HOME: "/srv/anicca" }),
    /legacy runtime root/i,
  );
});

test("allows a username named anicca when the runtime is outside the legacy anicca repository", () => {
  assert.equal(resolveRuntimePaths({
    LM_MODE: "local",
    LM_DATA_DIR: "/Users/operator/Library/Application Support/Rockstar_ibot",
    LM_CACHE_DIR: "/Users/operator/Library/Caches/Rockstar_ibot",
  }).dataDir, "/Users/operator/Library/Application Support/Rockstar_ibot");
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { assertKaiCoreBoundary } = require("./owner-runtime-boundary.js");

test("Core starts only against the Kai-owned repository and service identities", () => {
  const policy = assertKaiCoreBoundary();
  assert.equal(policy.canonicalRepository, "https://github.com/k999ln/Mr.");
  assert.equal(policy.activeServices.telegramBotUsername, "avocadominibot");
  assert.equal(policy.mode, "core_only");
  assert.equal(policy.autonomousRuntimeActivation, false);
});

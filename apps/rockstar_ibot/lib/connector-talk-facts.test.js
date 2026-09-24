"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { readConnectorTalkFacts } = require("./connector-talk-facts.js");

test("public talk facts are bounded, reference-only, and include one exact speaker bio", () => {
  const facts = readConnectorTalkFacts(path.join(__dirname, "../config/connector/rockstar_ibot-talk-facts.json"));
  assert.equal(Object.isFrozen(facts), true);
  assert.ok(facts.some((row) => row.evidence_ref.endsWith("speaker-bio") && /Rockstar_ibot/.test(row.fact)));
  assert.doesNotMatch(JSON.stringify(facts), /@|password|cookie|api.?key|secret|token/i);
});

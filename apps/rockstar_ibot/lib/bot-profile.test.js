"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROFILE_IDS,
  STYLE_CODES,
  ROCKSTAR_WORKSPACE,
  ROLE_DIRECTORY,
  getProfile,
  profileLabel,
  resolveProfileCommand,
  styleMenuMessage,
  roleDirectoryMessage,
  selectedProfileMessage,
  saveBotProfile,
} = require("./bot-profile.js");

test("one public Mr. Bot exposes exactly twenty internal profiles", () => {
  assert.equal(PROFILE_IDS.length, 20);
  assert.equal(new Set(PROFILE_IDS).size, 20);
  assert.equal(STYLE_CODES.length, 16);
  assert.equal(getProfile("mr-bot").publicUsername, "avocadominibot");
  assert.equal(profileLabel("missing"), "Mr. Bot");
});

test("role commands and style codes resolve to internal profiles", () => {
  assert.equal(resolveProfileCommand("main").id, "mr-bot");
  assert.equal(resolveProfileCommand("mother").id, "bot-mother");
  assert.equal(resolveProfileCommand("baby").id, "baby");
  assert.equal(resolveProfileCommand("guard").id, "life-guard");
  assert.equal(resolveProfileCommand("style", "ENTP").id, "entp");
  assert.equal(resolveProfileCommand("style", "unknown"), null);
  assert.match(styleMenuMessage(), /\/style entp/);
  assert.match(selectedProfileMessage(getProfile("entp")), /話し方だけ|心理診断/);
  assert.match(selectedProfileMessage(getProfile("baby")), /外部の仕事・案件/);
  assert.match(selectedProfileMessage(getProfile("baby")), /自分の商品販売.*Rockstar_ibot/);
});

test("one public bot shows four profiles and one separate commerce workspace without overlap", () => {
  assert.equal(ROLE_DIRECTORY.length, 5);
  assert.equal(new Set(ROLE_DIRECTORY.map((entry) => entry.id)).size, 5);
  assert.equal(new Set(ROLE_DIRECTORY.map((entry) => entry.command)).size, 5);
  assert.equal(ROCKSTAR_WORKSPACE.kind, "workspace");
  assert.equal(PROFILE_IDS.includes(ROCKSTAR_WORKSPACE.id), false);
  const text = roleDirectoryMessage();
  for (const entry of ROLE_DIRECTORY) {
    assert.ok(text.includes(entry.displayName));
    assert.ok(text.includes(entry.command));
  }
  assert.match(text, /Telegram Botは1つ/);
  assert.match(text, /話し方だけ/);
});

test("profile persistence validates the id and requires a confirmed database response", async () => {
  const calls = [];
  const ok = await saveBotProfile("u1", "entp", "https://db.test", "key", async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body).lm_bot_profile_id, "entp");
  assert.equal(await saveBotProfile("u1", "not-real", "https://db.test", "key", async () => ({ ok: true })), false);
  assert.equal(await saveBotProfile("u1", "entp", "https://db.test", "key", async () => ({ ok: false })), false);
});

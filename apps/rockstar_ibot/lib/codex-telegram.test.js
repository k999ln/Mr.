"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCodexCommand,
  allowedChatIds,
  isAllowedOwner,
  handleCodexMessage,
} = require("./codex-telegram.js");

test("Codex commands default to read-only and support explicit edit mode", () => {
  assert.deepEqual(parseCodexCommand("/codex 調査して"), { mode: "read-only", prompt: "調査して" });
  assert.deepEqual(parseCodexCommand("/codex ask git statusを確認"), { mode: "read-only", prompt: "git statusを確認" });
  assert.deepEqual(parseCodexCommand("/codex@avocadominibot edit READMEを更新"), { mode: "workspace-write", prompt: "READMEを更新" });
  assert.deepEqual(parseCodexCommand("/codex"), { mode: null, prompt: "" });
  assert.equal(parseCodexCommand("codex 調査して"), null);
});

test("owner allowlist accepts comma and whitespace separated private chat ids", () => {
  assert.deepEqual([...allowedChatIds(" 100,200\n300 ")], ["100", "200", "300"]);
  assert.equal(isAllowedOwner("200", "100, 200"), true);
  assert.equal(isAllowedOwner("201", "100, 200"), false);
});

test("Codex intake is owner-only and does not enqueue an unallowed chat", async () => {
  const sent = [];
  let enqueues = 0;
  const result = await handleCodexMessage({
    text: "/codex do something",
    chatId: "999",
    chatType: "private",
    userId: "999",
    messageId: "1",
    updateId: "2",
  }, {
    enabled: true,
    allowedChatIds: "100",
    telegramToken: "fixture-token",
    store: { enqueue: async () => { enqueues += 1; return { created: true, job: { id: "never" } }; } },
    sendMessage: async (_token, _chat, text) => { sent.push(text); return { ok: true }; },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "owner_not_allowed");
  assert.equal(enqueues, 0);
  assert.match(sent[0], /利用できません/);
});

test("Codex intake enqueues once and acknowledges the selected execution mode", async () => {
  const sent = [];
  const result = await handleCodexMessage({
    text: "/codex edit READMEを更新して",
    chatId: "100",
    chatType: "private",
    userId: "100",
    messageId: "1",
    updateId: "2",
  }, {
    enabled: true,
    allowedChatIds: "100",
    telegramToken: "fixture-token",
    store: {
      enqueue: async (job) => {
        assert.equal(job.chatId, "100");
        assert.equal(job.mode, "workspace-write");
        assert.equal(job.prompt, "READMEを更新して");
        return { created: true, job: { id: "00000000-0000-4000-8000-000000000001" } };
      },
    },
    sendMessage: async (_token, _chat, text) => { sent.push(text); return { ok: true, result: { message_id: 3 } }; },
  });
  assert.equal(result.accepted, true);
  assert.equal(result.created, true);
  assert.match(sent[0], /編集モード/);
  assert.match(sent[0], /00000000-0000-4000-8000-000000000001/);
});

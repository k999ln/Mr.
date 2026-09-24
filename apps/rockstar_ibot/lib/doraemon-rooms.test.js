"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FEATURE_KEYS } = require("./doraemon-feature-selection.js");
const {
  FEATURE_ROOMS,
  WORK_PROFILES,
  keysToMask,
  maskToKeys,
  mainRoomMessage,
  mainRoomKeyboard,
  roomKeyboard,
  allToolsMessage,
  selectionKeyboard,
  parseRoomCallback,
} = require("./doraemon-rooms.js");
const {
  handleDoraemonRoomCallback,
  parseDoraemonShortcutCommand,
  handleDoraemonShortcutCommand,
} = require("./doraemon-room-handler.js");

test("all ten website tools have a complete Telegram room", () => {
  assert.deepEqual(Object.keys(FEATURE_ROOMS), FEATURE_KEYS);
  for (const key of FEATURE_KEYS) {
    for (const field of ["emoji", "summary", "input", "output", "example", "firstStep", "notices"]) {
      assert.ok(FEATURE_ROOMS[key][field], `${key}.${field}`);
    }
  }
  const text = allToolsMessage(["request"]);
  for (const key of FEATURE_KEYS) assert.match(text, new RegExp(FEATURE_ROOMS[key].summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("room callback state preserves one to three selected tools", () => {
  for (const keys of [["request"], ["course", "pay"], ["store", "promote", "measure"]]) {
    const mask = keysToMask(keys).toString(36);
    assert.deepEqual(maskToKeys(mask), FEATURE_KEYS.filter((key) => keys.includes(key)));
    assert.deepEqual(parseRoomCallback(`dora:home:${mask}`).keys, FEATURE_KEYS.filter((key) => keys.includes(key)));
  }
  assert.equal(maskToKeys("0"), null);
  assert.equal(parseRoomCallback("dora:done:0"), null);
});

test("all callback data stays within Telegram's 64-byte limit", () => {
  const keyboards = [
    mainRoomKeyboard(["request", "course", "check"]),
    selectionKeyboard(["request", "course"]),
    roomKeyboard("request", ["request"]),
  ];
  for (const keyboard of keyboards) {
    for (const row of keyboard.inline_keyboard) {
      for (const button of row) assert.ok(Buffer.byteLength(button.callback_data) <= 64, button.callback_data);
    }
  }
});

test("opening a selected room starts a ForceReply intake", async () => {
  const sent = [];
  const result = await handleDoraemonRoomCallback("dora:start:nurture", {
    token: "token", chatType: "private", chatId: "7", actorId: "7", messageId: "8", callbackQueryId: "9",
  }, {
    loadSelection: async () => ({ uid: "lm_tg_7", keys: ["nurture"] }),
    answerCallbackQuery: async () => ({ ok: true }),
    sendMessage: async (...args) => { sent.push(args); return { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.match(sent[0][2], /見込み客を育てるに頼む/);
  assert.equal(sent[0][3].reply_markup.force_reply, true);
});

test("home and room callbacks use the latest database selection, not a stale mask", async () => {
  const edited = [];
  await handleDoraemonRoomCallback(`dora:home:${keysToMask(["request"]).toString(36)}`, {
    token: "token", chatType: "private", chatId: "7", actorId: "7", messageId: "8", callbackQueryId: "9",
  }, {
    loadSelection: async () => ({ uid: "lm_tg_7", keys: ["course", "nurture"] }),
    answerCallbackQuery: async () => ({ ok: true }),
    editMessageText: async (...args) => { edited.push(args); return { ok: true }; },
  });
  assert.match(edited[0][3], /教材を作る/);
  assert.match(edited[0][3], /見込み客を育てる/);
  assert.doesNotMatch(edited[0][3], /依頼を整理/);
});

test("website selection lands in the command room without consent or reselection copy", () => {
  const text = mainRoomMessage(["course", "pay"], { fromWebsite: true });
  assert.match(text, /総合司令室/);
  assert.match(text, /サイトで選んだ内容を反映しました/);
  assert.doesNotMatch(text, /同意|サイトで選ぶ|利用条件|プライバシー/);
});

test("job choice recommends three editable tools", () => {
  for (const profile of Object.values(WORK_PROFILES)) assert.equal(profile.keys.length, 3);
  const edited = [];
  return handleDoraemonRoomCallback("dora:job:teacher", {
    token: "token", chatType: "private", chatId: "7", actorId: "7", messageId: "8", callbackQueryId: "9",
  }, {
    answerCallbackQuery: async () => ({ ok: true }),
    editMessageText: async (...args) => { edited.push(args); return { ok: true }; },
  }).then((result) => {
    assert.equal(result.ok, true);
    assert.deepEqual(result.keys, ["course", "nurture", "deliver"]);
    assert.match(edited[0][3], /現在 3\/3種類/);
  });
});

test("finishing a Telegram selection persists it before opening the command room", async () => {
  const events = [];
  const keys = ["request", "check"];
  const result = await handleDoraemonRoomCallback(`dora:done:${keysToMask(keys).toString(36)}`, {
    token: "token", chatType: "private", chatId: "7", actorId: "7", messageId: "8", callbackQueryId: "9",
  }, {
    startFreeTier: async () => { events.push("start"); return { uid: "lm_tg_7" }; },
    featureStore: { replace: async ({ featureKeys }) => events.push(`save:${featureKeys.join(",")}`) },
    answerCallbackQuery: async () => events.push("answer"),
    editMessageText: async (_token, _chat, _message, text) => { events.push("edit"); assert.match(text, /総合司令室/); },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events, ["start", "save:request,check", "answer", "edit"]);
});

test("revision and completion require the same tenant and a delivered terminal job", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const sent = [];
  const baseInput = {
    token: "token", chatType: "private", chatId: "7", actorId: "7", messageId: "8", callbackQueryId: "9",
  };
  const baseDeps = {
    loadSelection: async () => ({ uid: "lm_tg_7", keys: ["course", "nurture"] }),
    answerCallbackQuery: async () => ({ ok: true }),
    sendMessage: async (...args) => { sent.push(args); return { ok: true }; },
  };

  const wrongTenant = await handleDoraemonRoomCallback(`dora:accept:${id}`, baseInput, {
    ...baseDeps,
    codexStore: { read: async () => ({ id, uid: "lm_tg_8", telegram_chat_id: "8", job_kind: "doraemon_command", status: "completed" }), accept: async () => { throw new Error("must not accept"); } },
  });
  assert.equal(wrongTenant.reason, "job_not_authorized");

  const commandJob = { id, uid: "lm_tg_7", telegram_chat_id: "7", job_kind: "doraemon_command", status: "completed", telegram_result_message_id: 99 };
  const revised = await handleDoraemonRoomCallback(`dora:revise:${id}`, baseInput, {
    ...baseDeps, codexStore: { read: async () => commandJob },
  });
  assert.equal(revised.ok, true);
  assert.match(sent.at(-1)[2], /avocadomini司令修正/);
  assert.equal(sent.at(-1)[3].reply_markup.force_reply, true);

  const accepted = await handleDoraemonRoomCallback(`dora:accept:${id}`, baseInput, {
    ...baseDeps,
    codexStore: { read: async () => commandJob, accept: async () => ({ ...commandJob, accepted_at: "2026-09-05T00:00:00Z" }) },
  });
  assert.equal(accepted.ok, true);
  assert.match(sent.at(-1)[2], /総合司令室.*完了/);

  const sentCount = sent.length;
  const replay = await handleDoraemonRoomCallback(`dora:accept:${id}`, baseInput, {
    ...baseDeps,
    codexStore: { read: async () => ({ ...commandJob, accepted_at: "2026-09-05T00:00:00Z" }), accept: async () => { throw new Error("must not accept twice"); } },
  });
  assert.equal(replay.alreadyAccepted, true);
  assert.equal(sent.length, sentCount);
});

test("public shortcuts always use the latest selection and never fall into legacy commands", async () => {
  for (const raw of ["/home", "/tools@avocadominibot", "/jobs", "/today", "/help"]) {
    assert.ok(parseDoraemonShortcutCommand(raw), raw);
  }
  assert.equal(parseDoraemonShortcutCommand("/commerce"), null);

  const sent = [];
  const shared = {
    token: "token", chatType: "private", chatId: "7", actorId: "7",
  };
  const dependencies = {
    loadSelection: async () => ({ uid: "lm_tg_7", keys: ["course", "nurture"] }),
    runToday: async () => { sent.push(["today"]); },
    sendMessage: async (...args) => { sent.push(args); return { ok: true }; },
  };

  const home = await handleDoraemonShortcutCommand("/home", shared, dependencies);
  assert.equal(home.handled, true);
  assert.match(sent.at(-1)[2], /総合司令室/);
  assert.match(sent.at(-1)[2], /教材を作る/);

  await handleDoraemonShortcutCommand("/tools", shared, dependencies);
  assert.match(sent.at(-1)[2], /avocadominiの10種類/);

  await handleDoraemonShortcutCommand("/help", shared, dependencies);
  for (const name of ["/home", "/tools", "/jobs", "/today", "/help"]) {
    assert.match(sent.at(-1)[2], new RegExp(name.replace("/", "\\/")));
  }

  await handleDoraemonShortcutCommand("/today", shared, dependencies);
  assert.deepEqual(sent.at(-1), ["today"]);
});

test("shortcuts guide a direct Telegram user before any tool is selected", async () => {
  const sent = [];
  const result = await handleDoraemonShortcutCommand("/tools", {
    token: "token", chatType: "private", chatId: "7", actorId: "7",
  }, {
    loadSelection: async () => ({ uid: null, keys: [] }),
    sendMessage: async (...args) => { sent.push(args); return { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.match(sent[0][2], /使いたい道具を選ぶ/);
  assert.match(sent[0][2], /1〜3種類/);
});

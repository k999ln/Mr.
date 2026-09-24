"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCommerceCallback,
  handleCommerceCallback,
} = require("./commerce-callback.js");
const { routeCallbackData } = require("./telegram.js");

const UID = "tenant-1";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let sequence = 1;

function uuid() {
  return `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
}

function memoryStore(seed = []) {
  const rows = seed.map((row) => ({ uid: UID, ...row }));
  return {
    rows,
    async create(uid, kind, status, data) {
      const row = { id: uuid(), uid, kind, status, data };
      rows.unshift(row);
      return row;
    },
    async get(uid, id) {
      return rows.find((row) => row.uid === uid && row.id === id) || null;
    },
    async list(uid, kind, limit = 20) {
      return rows.filter((row) => row.uid === uid && row.kind === kind).slice(0, limit);
    },
    async transition(uid, id, fromStatus, toStatus, data) {
      const row = rows.find((item) => item.uid === uid && item.id === id && item.status === fromStatus);
      if (!row) return null;
      row.status = toStatus;
      row.data = data;
      return row;
    },
    async update(uid, id, patch) {
      const row = rows.find((item) => item.uid === uid && item.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
  };
}

function entitlementStore() {
  const active = new Set(["telegram"]);
  return {
    active,
    async selectTool({ connectorKey }) { active.add(connectorKey); },
    async disconnectTool({ connectorKey }) { active.delete(connectorKey); },
    async getEntitlement() {
      return {
        paid: false,
        active_tool_limit: 3,
        activeToolKeys: [...active].sort(),
        selections: [...active].map((key) => ({
          connectorKey: key,
          active: true,
          connectionState: key === "telegram" ? "connected" : "selected",
          credentialReference: null,
        })),
      };
    },
  };
}

test("callback grammar stays below Telegram's button limit and routes through the commerce prefix", async () => {
  const values = [
    "commerce:t:stripe",
    "commerce:d:telegram-stars",
    "commerce:tools:refresh",
    `commerce:w:l:${PRODUCT_ID}`,
    `commerce:a:${PRODUCT_ID}`,
    `commerce:c:${PRODUCT_ID}`,
  ];
  values.forEach((value) => {
    assert.ok(Buffer.byteLength(value) <= 64);
    assert.ok(parseCommerceCallback(value));
  });
  assert.equal(parseCommerceCallback("commerce:unknown"), null);
  const routed = await routeCallbackData("commerce:t:stripe", {
    commerce: async (data) => ({ handled: true, data }),
  });
  assert.deepEqual(routed, { handled: true, data: "commerce:t:stripe" });
});

test("tool refresh callback opens the current three-tool free selection", async () => {
  const edits = [];
  const result = await handleCommerceCallback("commerce:tools:refresh", {
    row: { uid: UID, tg_chat_id: "42" }, token: "token", chatId: "42",
    actorId: "42", messageId: "9",
  }, {
    entitlementStore: entitlementStore(),
    commerceStore: memoryStore(),
    editMessageText: async (...args) => edits.push(args),
    sendMessage: async () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.action, "refresh_tools");
  assert.match(edits[0][3], /選択中: 1\/3/);
});

test("the fourth free tool offers a priced button that opens the Stars invoice directly", async () => {
  const sent = [];
  const limitedStore = entitlementStore();
  limitedStore.selectTool = async () => {
    const error = new Error("free_tool_limit_reached");
    error.code = "free_tool_limit_reached";
    throw error;
  };
  const result = await handleCommerceCallback("commerce:t:email", {
    row: { uid: UID, tg_chat_id: "42" }, token: "token", chatId: "42",
    actorId: "42", messageId: "9",
  }, {
    entitlementStore: limitedStore,
    commerceStore: memoryStore(),
    starsAmount: 120,
    editMessageText: async () => {},
    sendMessage: async (...args) => sent.push(args),
  });
  assert.equal(result.reason, "free_tool_limit_reached");
  assert.match(sent[0][2], /今回のDORA利用料：120 Stars/);
  assert.match(sent[0][2], /最初の利用同意.*課金されません/);
  assert.equal(sent[0][3].reply_markup.inline_keyboard[0][0].text, "⭐️ 120 Starsで購入して追加");
  assert.equal(sent[0][3].reply_markup.inline_keyboard[0][0].callback_data, "dora:upgrade:email");
});

test("one tap selects and disconnects a tool, refreshing the shared tool screen", async () => {
  const entitlements = entitlementStore();
  const edits = [];
  const deps = {
    entitlementStore: entitlements,
    commerceStore: memoryStore(),
    editMessageText: async (...args) => edits.push(args),
    sendMessage: async () => {},
  };
  const input = {
    row: { uid: UID, tg_chat_id: "42" }, token: "token", chatId: "42",
    actorId: "42", messageId: "9",
  };
  const selected = await handleCommerceCallback("commerce:t:stripe", input, deps);
  assert.equal(selected.ok, true);
  assert.deepEqual([...entitlements.active].sort(), ["stripe", "telegram"]);
  assert.match(edits.at(-1)[3], /選択中: 2\/3/);

  const disconnected = await handleCommerceCallback("commerce:d:stripe", input, deps);
  assert.equal(disconnected.ok, true);
  assert.deepEqual([...entitlements.active], ["telegram"]);
  assert.match(edits.at(-1)[3], /選択中: 1\/3/);
});

test("group members and mismatched tenant rows cannot press owner commerce buttons", async () => {
  let selections = 0;
  const deps = {
    entitlementStore: {
      selectTool: async () => { selections += 1; },
      getEntitlement: async () => ({ activeToolKeys: [], selections: [] }),
    },
    commerceStore: memoryStore(),
  };
  const group = await handleCommerceCallback("commerce:t:stripe", {
    row: { uid: UID, tg_chat_id: "-100" },
    chatId: "-100",
    actorId: "42",
  }, deps);
  assert.equal(group.reason, "scope_mismatch");
  const drift = await handleCommerceCallback("commerce:t:stripe", {
    row: { uid: UID, tg_chat_id: "99" },
    chatId: "42",
    actorId: "42",
  }, deps);
  assert.equal(drift.reason, "row_chat_mismatch");
  assert.equal(selections, 0);
});

test("product launch button creates an honest blocked plan when selected tools are not connected", async () => {
  const store = memoryStore([{
    id: PRODUCT_ID,
    kind: "product",
    status: "draft",
    data: { name: "講座", productType: "教材", price: 4980 },
  }]);
  const sent = [];
  const result = await handleCommerceCallback(
    `commerce:w:l:${PRODUCT_ID}`,
    { row: { uid: UID, tg_chat_id: "42" }, token: "token", chatId: "42", actorId: "42" },
    {
      commerceStore: store,
      entitlementStore: entitlementStore(),
      eventLedger: { append: async () => ({ created: true }) },
      sendMessage: async (...args) => sent.push(args),
      editMessageText: async () => {},
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(store.rows[0].kind, "workflow");
  assert.equal(store.rows[0].status, "needs_information");
  assert.match(sent[0][2], /接続・入力待ち/);
  assert.match(sent[0][2], /実行しません/);
});

test("standalone approval button fails honestly until a typed runtime exists", async () => {
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const store = memoryStore([{
    id: jobId,
    kind: "job",
    status: "approval_required",
    data: { jobType: "content" },
  }]);
  const edits = [];
  const sent = [];
  const deps = {
    commerceStore: store,
    entitlementStore: entitlementStore(),
    eventLedger: { append: async () => ({ created: true }) },
    sendMessage: async (...args) => sent.push(args),
    editMessageText: async (...args) => edits.push(args),
  };
  const input = {
    row: { uid: UID, tg_chat_id: "42" }, token: "token", chatId: "42",
    messageId: "9", actorId: "42",
  };
  const first = await handleCommerceCallback(`commerce:a:${jobId}`, input, deps);
  const second = await handleCommerceCallback(`commerce:a:${jobId}`, input, deps);
  assert.equal(first.ok, false);
  assert.equal(second.ok, false);
  assert.equal(first.reason, "runtime_not_ready");
  assert.equal(store.rows[0].status, "approval_required");
  assert.equal(edits.length, 0);
  assert.match(sent[0][2], /adapter/);
});

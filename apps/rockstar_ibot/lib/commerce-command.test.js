"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  COMMERCE_COMMANDS,
  menuMessage,
  parseProductArgs,
  handleCommerceCommand,
} = require("./commerce-command.js");

const UID = "11111111-1111-4111-8111-111111111111";
let sequence = 1;

function uuid() {
  return `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
}

function memoryStore(seed = []) {
  const rows = seed.map((row) => ({ uid: UID, ...row }));
  return {
    rows,
    async create(uid, kind, status, data) {
      const row = { id: uuid(), uid, kind, status, data, created_at: new Date().toISOString() };
      rows.unshift(row);
      return row;
    },
    async list(uid, kind, limit = 20) {
      return rows.filter((row) => row.uid === uid && row.kind === kind).slice(0, limit);
    },
    async get(uid, id) {
      return rows.find((row) => row.uid === uid && row.id === id) || null;
    },
    async update(uid, id, patch) {
      const row = rows.find((candidate) => candidate.uid === uid && candidate.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
    async transition(uid, id, fromStatus, toStatus, data) {
      const row = rows.find((candidate) => (
        candidate.uid === uid && candidate.id === id && candidate.status === fromStatus
      ));
      if (!row) return null;
      row.status = toStatus;
      row.data = data;
      return row;
    },
  };
}

function harness(store) {
  const messages = [];
  const events = [];
  return {
    messages,
    events,
    deps: {
      token: "test",
      chatId: "42",
      actorId: "42",
      commerceStore: store,
      eventLedger: {
        append: async (event) => { events.push(event); return { created: true, event }; },
      },
      send: async (_token, _chatId, text) => messages.push(text),
    },
  };
}

test("commerce exposes the operating functions behind one clearly bounded menu", () => {
  assert.match(menuMessage(), /Rockstar_ibot.*Mr\. Bot内の販売担当/);
  assert.match(menuMessage(), /外部案件で稼ぐ相談は \/baby/);
  assert.match(menuMessage(), /\/delivery は単独案、deliver_order は.*統合フロー/);
  assert.match(menuMessage(), /ツール選択だけでは接続・課金・外部実行は行われません/);
  assert.deepEqual(COMMERCE_COMMANDS, [
    "commerce", "product", "factcheck", "content", "campaign",
    "tools", "workflow", "today", "approve", "orders", "customers",
    "delivery", "analytics", "pause",
  ]);
  assert.deepEqual(parseProductArgs("X集客講座 | 教材 | 4,980円"), {
    name: "X集客講座", productType: "教材", price: 4980,
  });
  assert.equal(parseProductArgs(" | 教材 | 1000"), null);
  assert.equal(parseProductArgs("商品 | 教材 | 無料"), null);
});

test("tools exposes three-free selection state without charging workflow runs", async () => {
  const store = memoryStore();
  const { deps, messages } = harness(store);
  const result = await handleCommerceCommand(
    { name: "tools", args: "" },
    { uid: UID, paid: false },
    {
      ...deps,
      entitlementStore: {
        getEntitlement: async () => ({
          paid: false,
          active_tool_limit: 3,
          activeToolKeys: ["telegram", "stripe"],
          selections: [
            { connectorKey: "telegram", active: true, connectionState: "connected" },
            { connectorKey: "stripe", active: true, connectionState: "selected" },
          ],
        }),
      },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.activeToolKeys, ["telegram", "stripe"]);
  assert.match(messages.at(-1), /選択中: 2\/3/);
  assert.match(messages.at(-1), /接続待ち/);
});

test("workflow reverse-plans every selected relevant tool and approval uses the shared runtime queue", async () => {
  const store = memoryStore();
  const { deps, events } = harness(store);
  const product = await handleCommerceCommand(
    { name: "product", args: "統合講座 | 教材 | 4980" },
    { uid: UID },
    deps,
  );
  const entitlementStore = {
    getEntitlement: async () => ({
      paid: false,
      active_tool_limit: 3,
      activeToolKeys: ["stripe", "telegram"],
      selections: [
        {
          connectorKey: "stripe", active: true, connectionState: "connected",
          credentialReference: "vault://tenant/stripe",
          runtimeAdapterReference: "provider://commerce-adapter/stripe/v1",
        },
        {
          connectorKey: "telegram", active: true, connectionState: "connected",
          credentialReference: "managed://telegram/merchant-channel",
          runtimeAdapterReference: "provider://commerce-adapter/telegram/v1",
        },
      ],
    }),
  };
  const proposal = await handleCommerceCommand(
    { name: "workflow", args: `launch_offer | ${product.id} | 2026-09-02T12:00:00Z` },
    { uid: UID },
    { ...deps, entitlementStore },
  );
  assert.equal(proposal.ready, true);
  const workflow = await store.get(UID, proposal.id);
  assert.equal(workflow.kind, "workflow");
  assert.deepEqual(workflow.data.plan.relevant_tool_keys, ["stripe", "telegram"]);
  assert.equal(workflow.data.plan.selection.tool_selection_count, 2);
  assert.equal(workflow.data.plan.selection.workflow_run_count, 1);
  assert.deepEqual(events.map((event) => event.eventKind), ["decision_proposed"]);

  const enqueued = [];
  const approved = await handleCommerceCommand(
    { name: "approve", args: proposal.id },
    { uid: UID },
    {
      ...deps,
      entitlementStore,
      nowMs: Date.parse("2026-08-31T00:00:00Z"),
      enqueueWorkflow: async (plan) => {
        enqueued.push(plan.plan_id);
        return { status: "enqueued_awaiting_official_readback" };
      },
    },
  );
  assert.equal(approved.ok, true);
  assert.equal(enqueued.length, 1);
  assert.equal((await store.get(UID, proposal.id)).status, "queued");
  assert.equal(events.filter((event) => event.eventKind === "decision_approved").length, 1);
  assert.equal(
    events.filter((event) => event.eventKind === "action_enqueued").length,
    workflow.data.plan.steps.length,
  );
});

test("product draft leads to an approval-gated content job", async () => {
  const store = memoryStore();
  const { deps, messages } = harness(store);
  const product = await handleCommerceCommand(
    { name: "product", args: "X集客講座 | 教材 | 4980" },
    { uid: UID }, deps,
  );
  assert.equal(product.ok, true);
  assert.equal(store.rows[0].kind, "product");
  assert.equal(store.rows[0].status, "draft");

  const job = await handleCommerceCommand(
    { name: "content", args: product.id }, { uid: UID }, deps,
  );
  assert.equal(job.ok, true);
  assert.equal(store.rows[0].status, "approval_required");
  assert.deepEqual(store.rows[0].data, { jobType: "content", productId: product.id });
  assert.match(messages.at(-1), /\/approve/);

  const approved = await handleCommerceCommand(
    { name: "approve", args: job.id }, { uid: UID }, deps,
  );
  assert.equal(approved.ok, false);
  assert.equal(approved.reason, "runtime_not_ready");
  assert.equal(store.rows[0].status, "approval_required");
  assert.match(messages.at(-1), /adapter/);
});

test("delivery requires a tenant-owned order and remains approval-gated", async () => {
  const foreignOrder = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uid: "22222222-2222-4222-8222-222222222222", kind: "order", status: "paid", data: {} };
  const ownOrder = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "order", status: "paid", data: { order_number: "O-1" } };
  const store = memoryStore([foreignOrder, ownOrder]);
  const { deps } = harness(store);
  const denied = await handleCommerceCommand({ name: "delivery", args: foreignOrder.id }, { uid: UID }, deps);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "order_not_found");
  const accepted = await handleCommerceCommand({ name: "delivery", args: ownOrder.id }, { uid: UID }, deps);
  assert.equal(accepted.ok, true);
  assert.equal(store.rows[0].data.jobType, "delivery");
  assert.equal(store.rows[0].status, "approval_required");
});

test("analytics never fabricates revenue and pause is durable", async () => {
  const store = memoryStore([
    { id: uuid(), kind: "product", status: "draft", data: { name: "A" } },
    { id: uuid(), kind: "order", status: "paid", data: { order_number: "O-1" } },
  ]);
  const { deps, messages } = harness(store);
  const summary = await handleCommerceCommand({ name: "analytics", args: "" }, { uid: UID }, deps);
  assert.deepEqual(summary.counts, { product: 1, job: 0, order: 1, customer: 0 });
  assert.match(messages.at(-1), /決済receipt/);
  const paused = await handleCommerceCommand({ name: "pause", args: "" }, { uid: UID }, deps);
  assert.equal(paused.paused, true);
  const resumed = await handleCommerceCommand({ name: "pause", args: "" }, { uid: UID }, deps);
  assert.equal(resumed.paused, false);
});

test("pause blocks new approvals before anything enters the runtime queue", async () => {
  const store = memoryStore([{
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kind: "job",
    status: "approval_required",
    data: { jobType: "content" },
  }]);
  const { deps, messages } = harness(store);
  await handleCommerceCommand({ name: "pause", args: "" }, { uid: UID }, deps);
  const result = await handleCommerceCommand({
    name: "approve",
    args: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  }, { uid: UID }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "paused");
  assert.equal((await store.get(UID, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).status,
    "approval_required");
  assert.match(messages.at(-1), /停止中/);
});

test("approve and pause require the actual linked private-chat actor", async () => {
  const jobId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const store = memoryStore([{
    id: jobId, kind: "job", status: "approval_required", data: { jobType: "content" },
  }]);
  const { deps } = harness(store);

  for (const [name, actorId, chatId, rowChatId] of [
    ["approve", "", "42", "42"],
    ["approve", "99", "42", "42"],
    ["pause", "42", "-100", "-100"],
  ]) {
    const result = await handleCommerceCommand(
      { name, args: name === "approve" ? jobId : "" },
      { uid: UID, telegram_chat_id: rowChatId },
      { ...deps, actorId, chatId },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "actor_unauthorized");
  }
  assert.equal((await store.get(UID, jobId)).status, "approval_required");
  assert.equal((await store.list(UID, "setting")).length, 0);
});

test("unlinked users and store failures fail closed", async () => {
  const { deps, messages } = harness(memoryStore());
  const unlinked = await handleCommerceCommand({ name: "orders", args: "" }, null, deps);
  assert.equal(unlinked.reason, "unlinked");
  assert.match(messages.at(-1), /\/start/);
  const failed = await handleCommerceCommand({ name: "orders", args: "" }, { uid: UID }, {
    ...deps,
    commerceStore: { list: async () => { throw new Error("offline"); } },
  });
  assert.equal(failed.reason, "store_failed");
  assert.match(messages.at(-1), /外部操作は実行していません/);
});

test("commerce projection migration uses the repository text tenant identity and admits workflows", () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    "../migrations/2026-08-31-lm-commerce-os.sql",
  ), "utf8");
  assert.match(migration, /uid text NOT NULL REFERENCES public\.lm_users\(uid\)/);
  assert.match(migration, /'workflow'/);
  assert.match(migration, /jobs\.loop_id LIKE 'commerce\.workflow\.%'/);
  assert.match(migration, /settings\.data->>'paused'/);
  assert.match(migration, /workflow\.data->>'approvalRef' = jobs\.input_refs->>'approval_ref'/);
  assert.match(migration, /predecessor\.status = 'completed'/);
  assert.doesNotMatch(migration, /uid uuid NOT NULL/);
});

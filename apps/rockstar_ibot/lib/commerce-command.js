"use strict";

const { sendMessage } = require("./telegram.js");
const { ROCKSTAR_WORKSPACE } = require("./bot-profile.js");
const { createCommerceEntitlementStore } = require("./commerce-entitlement-store.js");
const { createCommerceEventLedger } = require("./commerce-event-ledger.js");
const {
  COMMERCE_WORKFLOW_TEMPLATE_KEYS,
} = require("./commerce-workflow-plan.js");
const {
  TARGET_KIND,
  parseWorkflowArgs,
  buildCommerceWorkflowProposal,
} = require("./commerce-workflow-service.js");
const { approveCommerceObject } = require("./commerce-approval.js");
const { persistCommerceWorkflowProposal } = require("./commerce-workflow-persistence.js");
const {
  escapeHtml,
  toolSelectionMessage,
  toolSelectionKeyboard,
  productActionsKeyboard,
  approvalKeyboard,
  workflowProposalMessage,
} = require("./commerce-telegram-ui.js");

const COMMERCE_COMMANDS = Object.freeze([
  "commerce", "product", "factcheck", "content", "campaign",
  "tools", "workflow", "today", "approve", "orders", "customers",
  "delivery", "analytics", "pause",
]);

const JOB_COMMANDS = new Set(["factcheck", "content", "campaign"]);
const ACTOR_AUTHORIZED_COMMANDS = new Set(["approve", "pause"]);
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

function menuMessage() {
  return [
    `🏪 <b>${ROCKSTAR_WORKSPACE.displayName}</b> — Mr. Bot内の販売担当`,
    `用途: ${ROCKSTAR_WORKSPACE.purpose}`,
    "外部案件で稼ぐ相談は /baby、生活・仕事全体へ戻るときは /main を使います。",
    "",
    "<b>商品と販売準備</b>",
    "  /product 商品名 | 種別 | 価格 — 商品下書き",
    "  /factcheck &lt;product-id&gt; — 商品の主張と根拠の確認案",
    "  /content &lt;product-id&gt; — X・Telegram・LP・メール原稿案",
    "  /campaign &lt;product-id&gt; — 誰に・何を・いつ届けるかの販売施策案",
    "",
    "<b>連携と実行</b>",
    "  /tools — 無料3個まで使用ツールを選択・状態確認",
    "  /workflow 種類 | 対象ID | 期限 — 複数ツールを使う工程を逆算",
    "  /today — 販売部門の承認待ち・接続待ち・再試行待ち",
    "  /approve &lt;job-id&gt; — 内容を確認して実行待ちへ進める",
    "  /pause — 新しい販売実行を停止・再開",
    "",
    "<b>注文・顧客・納品</b>",
    "  /orders — 注文一覧",
    "  /customers — 購入者・会員一覧",
    "  /delivery &lt;order-id&gt; — 単独の納品案",
    "  /analytics — receiptで確認できた販売実績",
    "",
    `workflow種類: ${COMMERCE_WORKFLOW_TEMPLATE_KEYS.join(", ")}`,
    "補足: 商品作成後の「発売まで自動で組む」は launch_offer の近道です。",
    "補足: /delivery は単独案、deliver_order は支払確認から通知までの統合フローです。",
    "ツール選択だけでは接続・課金・外部実行は行われません。",
    "外部公開・価格変更・一斉配信は、承認と接続adapterが揃うまで実行しません。",
  ].join("\n");
}

function parseProductArgs(args) {
  const parts = String(args || "").split("|").map((part) => part.trim());
  if (!parts[0]) return null;
  const price = parts[2] ? Number(parts[2].replace(/[,\s円¥￥]/g, "")) : null;
  if (parts[2] && (!Number.isSafeInteger(price) || price < 0)) return null;
  return { name: parts[0].slice(0, 160), productType: (parts[1] || "digital").slice(0, 40), price };
}

function validId(value) {
  return ID_PATTERN.test(String(value || "").trim());
}

function rowTelegramChatId(row) {
  const value = row && (row.telegram_chat_id ?? row.tg_chat_id);
  return value == null ? "" : String(value).trim();
}

function verifiedPrivateTelegramActor(row, deps) {
  const actorId = String(deps.actorId || "").trim();
  const chatId = String(deps.chatId || "").trim();
  const linkedChatId = rowTelegramChatId(row);
  return /^\d{1,20}$/.test(actorId)
    && actorId === chatId
    && (!linkedChatId || linkedChatId === chatId);
}

function compactId(id) {
  return String(id || "").slice(0, 8);
}

function formatRows(title, rows, empty) {
  if (!rows.length) return `${title}\n${empty}`;
  return [title, ...rows.slice(0, 10).map((row) => {
    const data = row.data || {};
    const label = data.name || data.email || data.product_name || data.order_number || row.kind;
    return `• ${compactId(row.id)}  ${escapeHtml(label)}  [${escapeHtml(row.status)}]`;
  })].join("\n");
}

function createCommerceStore(opts = {}) {
  const supaUrl = String(opts.supaUrl || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supaKey = opts.supaKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!supaUrl || !supaKey || typeof fetchImpl !== "function") throw new Error("commerce_store_unavailable");
  const table = `${supaUrl}/rest/v1/lm_commerce_objects`;
  const headers = (extra = {}) => ({ apikey: supaKey, Authorization: `Bearer ${supaKey}`, ...extra });

  async function json(response, code) {
    if (!response || !response.ok) throw new Error(`${code}:${response ? response.status : "no_response"}`);
    return response.json();
  }

  return {
    async create(uid, kind, status, data) {
      const rows = await json(await fetchImpl(table, {
        method: "POST",
        headers: headers({ "content-type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify({ uid, kind, status, data }),
      }), "commerce_create_failed");
      return rows[0];
    },
    async list(uid, kind, limit = 20) {
      const query = new URLSearchParams({ uid: `eq.${uid}`, kind: `eq.${kind}`, select: "*", order: "created_at.desc", limit: String(limit) });
      return json(await fetchImpl(`${table}?${query}`, { headers: headers() }), "commerce_list_failed");
    },
    async get(uid, id) {
      const query = new URLSearchParams({ uid: `eq.${uid}`, id: `eq.${id}`, select: "*", limit: "1" });
      const rows = await json(await fetchImpl(`${table}?${query}`, { headers: headers() }), "commerce_get_failed");
      return rows[0] || null;
    },
    async update(uid, id, patch) {
      const query = new URLSearchParams({ uid: `eq.${uid}`, id: `eq.${id}` });
      const rows = await json(await fetchImpl(`${table}?${query}`, {
        method: "PATCH",
        headers: headers({ "content-type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      }), "commerce_update_failed");
      return rows[0] || null;
    },
    async transition(uid, id, fromStatus, toStatus, data) {
      const query = new URLSearchParams({
        uid: `eq.${uid}`,
        id: `eq.${id}`,
        status: `eq.${fromStatus}`,
      });
      const rows = await json(await fetchImpl(`${table}?${query}`, {
        method: "PATCH",
        headers: headers({ "content-type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify({
          status: toStatus,
          data,
          updated_at: new Date().toISOString(),
        }),
      }), "commerce_transition_failed");
      return rows[0] || null;
    },
  };
}

async function handleCommerceCommand(parsed, row, deps = {}) {
  if (!parsed || !COMMERCE_COMMANDS.includes(parsed.name)) return { handled: false };
  const send = deps.send || sendMessage;
  const chatId = String(deps.chatId || "");
  const reply = (text, extra) => send(deps.token, chatId, text, extra);
  if (!row || !row.uid) {
    await reply(`Complete Rockstar_ibot setup with /start before using /${parsed.name}.`);
    return { handled: true, action: parsed.name, ok: false, reason: "unlinked" };
  }
  if (parsed.name === "commerce") {
    await reply(menuMessage());
    return { handled: true, action: "commerce", ok: true };
  }

  if (ACTOR_AUTHORIZED_COMMANDS.has(parsed.name)
      && !verifiedPrivateTelegramActor(row, deps)) {
    await reply("この操作は、連携済み所有者のTelegram個人チャットからのみ実行できます。");
    return { handled: true, action: parsed.name, ok: false, reason: "actor_unauthorized" };
  }

  let store;
  try {
    store = deps.commerceStore || createCommerceStore(deps);
    const uid = row.uid;
    if (parsed.name === "tools") {
      const entitlementStore = deps.entitlementStore || createCommerceEntitlementStore(deps);
      const entitlement = await entitlementStore.getEntitlement(uid);
      await reply(toolSelectionMessage(entitlement), toolSelectionKeyboard(entitlement));
      return {
        handled: true,
        action: "tools",
        ok: true,
        activeToolKeys: entitlement.activeToolKeys,
      };
    }

    if (parsed.name === "product") {
      const product = parseProductArgs(parsed.args);
      if (!product) {
        await reply("使い方: /product 商品名 | 種別 | 価格\n例: /product X集客講座 | 教材 | 4980");
        return { handled: true, action: "product", ok: false, reason: "invalid_args" };
      }
      const saved = await store.create(uid, "product", "draft", product);
      await reply(
        `📦 商品下書きを作成しました\nID: <code>${saved.id}</code>\n商品: ${escapeHtml(product.name)}\n次は下のボタンだけで、選択済みツールを使う発売工程を逆算します。`,
        productActionsKeyboard(saved.id),
      );
      return { handled: true, action: "product", ok: true, id: saved.id };
    }

    if (parsed.name === "workflow") {
      const request = parseWorkflowArgs(parsed.args);
      const kind = TARGET_KIND[request.templateKey.replace(/-/g, "_")];
      const target = validId(request.targetId) ? await store.get(uid, request.targetId) : null;
      if (!kind || !target || target.kind !== kind) {
        await reply([
          "使い方: /workflow 種類 | 対象ID | 期限（期限は省略可）",
          "例: /workflow launch_offer | 商品ID",
          `種類: ${COMMERCE_WORKFLOW_TEMPLATE_KEYS.join(", ")}`,
        ].join("\n"));
        return { handled: true, action: "workflow", ok: false, reason: "target_not_found" };
      }
      const entitlementStore = deps.entitlementStore || createCommerceEntitlementStore(deps);
      const entitlement = await entitlementStore.getEntitlement(uid);
      const plan = buildCommerceWorkflowProposal({
        templateKey: request.templateKey,
        target,
        entitlement,
        deadline: request.deadline,
        nowMs: deps.nowMs,
      });
      const eventLedger = deps.eventLedger || createCommerceEventLedger(deps);
      const workflow = await persistCommerceWorkflowProposal({
        store,
        eventLedger,
        uid,
        plan,
        targetId: target.id,
        nowMs: deps.nowMs,
      });
      await reply(
        workflowProposalMessage(workflow),
        plan.ready ? approvalKeyboard(workflow.id) : undefined,
      );
      return {
        handled: true,
        action: "workflow",
        ok: true,
        id: workflow.id,
        ready: plan.ready,
        missingRequirements: plan.missing_requirements,
      };
    }

    if (parsed.name === "today") {
      const [jobs, workflows] = await Promise.all([
        store.list(uid, "job", 100),
        store.list(uid, "workflow", 100),
      ]);
      const approvals = [...jobs, ...workflows].filter((item) => item.status === "approval_required");
      const blocked = workflows.filter((item) => item.status === "needs_information");
      const recoverable = workflows.filter((item) => item.status === "queueing");
      const entitlementStore = deps.entitlementStore || createCommerceEntitlementStore(deps);
      const entitlement = await entitlementStore.getEntitlement(uid);
      await reply([
        "☀️ <b>今日やること</b>",
        `承認待ち: ${approvals.length}件`,
        `接続・入力待ち: ${blocked.length}件`,
        `queue再試行待ち: ${recoverable.length}件`,
        `選択ツール: ${entitlement.activeToolKeys.length}/${entitlement.active_tool_limit == null ? "無制限" : entitlement.active_tool_limit}`,
        "",
        recoverable.length
          ? `次: /approve ${recoverable[0].id}（同じIDで安全に再試行）`
          : (approvals.length ? `次: /approve ${approvals[0].id}` : "今すぐ必要な承認はありません。"),
      ].join("\n"));
      return {
        handled: true,
        action: "today",
        ok: true,
        approvals: approvals.length,
        blocked: blocked.length,
        recoverable: recoverable.length,
      };
    }

    if (JOB_COMMANDS.has(parsed.name)) {
      const productId = String(parsed.args || "").trim();
      const product = validId(productId) ? await store.get(uid, productId) : null;
      if (!product || product.kind !== "product") {
        await reply(`使い方: /${parsed.name} <product-id>`);
        return { handled: true, action: parsed.name, ok: false, reason: "product_not_found" };
      }
      const job = await store.create(uid, "job", "approval_required", { jobType: parsed.name, productId });
      await reply(
        `✅ ${parsed.name}ジョブ案を作成しました\nID: <code>${job.id}</code>\nボタンで承認するまで実行しません。反応しない場合は /approve ${job.id}`,
        approvalKeyboard(job.id),
      );
      return { handled: true, action: parsed.name, ok: true, id: job.id };
    }

    if (parsed.name === "approve") {
      const id = String(parsed.args || "").trim();
      const job = validId(id) ? await store.get(uid, id) : null;
      if (!job || !new Set(["job", "workflow"]).has(job.kind)) {
        await reply("承認待ちのジョブが見つかりません。");
        return { handled: true, action: "approve", ok: false, reason: "job_not_approvable" };
      }
      const approved = await approveCommerceObject({
        uid,
        object: job,
        actorId: deps.actorId,
      }, {
        ...deps,
        store,
        eventLedger: job.kind === "workflow"
          ? (deps.eventLedger || createCommerceEventLedger(deps))
          : deps.eventLedger,
      });
      if (!approved.ok) {
        const approvalFailure = approved.reason === "requirements_missing"
          ? "接続・必須情報が不足しているため、まだ実行できません。"
          : (approved.reason === "paused"
            ? `⏸ ${ROCKSTAR_WORKSPACE.displayName}は停止中です。/pause で再開するまで新しい実行はキューに入れません。`
            : (approved.reason === "deadline_expired"
              ? "期限から逆算した開始時刻を過ぎています。新しい期限でワークフローを作り直してください。"
              : (approved.reason === "runtime_not_ready"
                ? "この単独ジョブの実行adapterはまだ接続されていません。統合 /workflow は接続済みツールだけを実行します。"
                : "承認待ちのジョブが見つかりません。")));
        await reply(approvalFailure);
        return { handled: true, action: "approve", ok: false, reason: approved.reason };
      }
      await reply(`✅ 承認し、実行待ちにしました\nID: <code>${id}</code>\n外部adapterのreceiptが返るまで完了とは扱いません。`);
      return { handled: true, action: "approve", ok: true, id };
    }

    if (parsed.name === "orders" || parsed.name === "customers") {
      const kind = parsed.name === "orders" ? "order" : "customer";
      const rows = await store.list(uid, kind);
      await reply(formatRows(parsed.name === "orders" ? "🧾 注文" : "👥 購入者・会員", rows, "まだ記録がありません。"));
      return { handled: true, action: parsed.name, ok: true, count: rows.length };
    }

    if (parsed.name === "delivery") {
      const orderId = String(parsed.args || "").trim();
      const order = validId(orderId) ? await store.get(uid, orderId) : null;
      if (!order || order.kind !== "order") {
        await reply("使い方: /delivery <order-id>");
        return { handled: true, action: "delivery", ok: false, reason: "order_not_found" };
      }
      const job = await store.create(uid, "job", "approval_required", { jobType: "delivery", orderId });
      await reply(
        `📦 納品案を作成しました\nID: <code>${job.id}</code>\nボタンで承認するまで実行しません。反応しない場合は /approve ${job.id}`,
        approvalKeyboard(job.id),
      );
      return { handled: true, action: "delivery", ok: true, id: job.id };
    }

    if (parsed.name === "analytics") {
      const kinds = ["product", "job", "order", "customer"];
      const rows = await Promise.all(kinds.map((kind) => store.list(uid, kind, 100)));
      const counts = Object.fromEntries(kinds.map((kind, index) => [kind, rows[index].length]));
      await reply([
        `📊 ${ROCKSTAR_WORKSPACE.displayName} summary`,
        `商品: ${counts.product}`,
        `ジョブ: ${counts.job}`,
        `注文: ${counts.order}`,
        `購入者・会員: ${counts.customer}`,
        "売上額は決済receiptが接続されるまで表示しません。",
      ].join("\n"));
      return { handled: true, action: "analytics", ok: true, counts };
    }

    const settings = await store.list(uid, "setting", 1);
    const paused = settings[0]?.data?.paused === true;
    const saved = await store.create(uid, "setting", "active", { paused: !paused });
    await reply(!paused
      ? `⏸ ${ROCKSTAR_WORKSPACE.displayName}を停止しました。新しい承認・キュー投入を拒否し、未開始の販売実行もclaimされません。`
      : `▶️ ${ROCKSTAR_WORKSPACE.displayName}を再開しました。承認済み工程は逆算時刻に従って再開できます。`);
    return { handled: true, action: "pause", ok: true, paused: saved.data.paused };
  } catch (error) {
    await reply("販売台帳を更新できませんでした。外部操作は実行していません。");
    return { handled: true, action: parsed.name, ok: false, reason: "store_failed", error: error.message };
  }
}

module.exports = {
  COMMERCE_COMMANDS,
  menuMessage,
  parseProductArgs,
  createCommerceStore,
  handleCommerceCommand,
};

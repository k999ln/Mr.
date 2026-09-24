"use strict";

const { sendMessage, editMessageText } = require("./telegram.js");
const { ROCKSTAR_WORKSPACE } = require("./bot-profile.js");
const { createCommerceEntitlementStore } = require("./commerce-entitlement-store.js");
const { createCommerceEventLedger } = require("./commerce-event-ledger.js");
const {
  createCommerceStore,
} = require("./commerce-command.js");
const {
  buildCommerceWorkflowProposal,
} = require("./commerce-workflow-service.js");
const { persistCommerceWorkflowProposal } = require("./commerce-workflow-persistence.js");
const {
  approveCommerceObject,
  cancelCommerceObject,
} = require("./commerce-approval.js");
const {
  toolSelectionMessage,
  toolSelectionKeyboard,
  workflowProposalMessage,
  approvalKeyboard,
} = require("./commerce-telegram-ui.js");

const UUID = "[0-9a-f]{8}-[0-9a-f-]{27}";

function parseCommerceCallback(value) {
  const text = String(value || "");
  if (text === "commerce:tools:refresh") return { action: "refresh_tools" };
  let match = /^commerce:([td]):([a-z][a-z0-9-]{0,79})$/.exec(text);
  if (match) return { action: match[1] === "t" ? "select_tool" : "disconnect_tool", connectorKey: match[2] };
  match = new RegExp(`^commerce:w:l:(${UUID})$`, "i").exec(text);
  if (match) return { action: "launch_offer", objectId: match[1] };
  match = new RegExp(`^commerce:([ac]):(${UUID})$`, "i").exec(text);
  if (match) return { action: match[1] === "a" ? "approve" : "cancel", objectId: match[2] };
  return null;
}

async function refreshTools(input, entitlementStore, edit) {
  const entitlement = await entitlementStore.getEntitlement(input.row.uid);
  await edit(
    input.token,
    input.chatId,
    input.messageId,
    toolSelectionMessage(entitlement),
    toolSelectionKeyboard(entitlement),
  );
  return entitlement;
}

async function handleCommerceCallback(data, input = {}, dependencies = {}) {
  const parsed = parseCommerceCallback(data);
  if (!parsed) return { handled: false };
  const row = input.row;
  if (!row || !row.uid) return { handled: true, ok: false, reason: "unlinked" };
  const entitlementStore = dependencies.entitlementStore
    || createCommerceEntitlementStore(dependencies);
  const store = dependencies.commerceStore || createCommerceStore(dependencies);
  const send = dependencies.sendMessage || sendMessage;
  const edit = dependencies.editMessageText || editMessageText;
  const common = {
    ...input,
    token: input.token || dependencies.token,
    chatId: String(input.chatId || dependencies.chatId || ""),
  };
  if (!input.actorId || String(input.actorId) !== common.chatId) {
    return { handled: true, ok: false, action: parsed.action, reason: "scope_mismatch" };
  }
  if (row.tg_chat_id != null && String(row.tg_chat_id) !== common.chatId) {
    return { handled: true, ok: false, action: parsed.action, reason: "row_chat_mismatch" };
  }

  try {
    if (parsed.action === "refresh_tools") {
      const entitlement = await refreshTools(common, entitlementStore, edit);
      return { handled: true, ok: true, action: parsed.action, activeCount: entitlement.activeToolKeys.length };
    }

    if (parsed.action === "select_tool" || parsed.action === "disconnect_tool") {
      if (parsed.action === "select_tool") {
        await entitlementStore.selectTool({ uid: row.uid, connectorKey: parsed.connectorKey });
      } else {
        await entitlementStore.disconnectTool({ uid: row.uid, connectorKey: parsed.connectorKey });
      }
      const entitlement = await refreshTools(common, entitlementStore, edit);
      return {
        handled: true,
        ok: true,
        action: parsed.action,
        connectorKey: parsed.connectorKey,
        activeCount: entitlement.activeToolKeys.length,
      };
    }

    if (parsed.action === "launch_offer") {
      const product = await store.get(row.uid, parsed.objectId);
      if (!product || product.kind !== "product") {
        return { handled: true, ok: false, action: parsed.action, reason: "product_not_found" };
      }
      const entitlement = await entitlementStore.getEntitlement(row.uid);
      const plan = buildCommerceWorkflowProposal({
        templateKey: "launch_offer",
        target: product,
        entitlement,
        nowMs: dependencies.nowMs,
      });
      const workflow = await persistCommerceWorkflowProposal({
        store,
        eventLedger: dependencies.eventLedger || createCommerceEventLedger(dependencies),
        uid: row.uid,
        plan,
        targetId: product.id,
        nowMs: dependencies.nowMs,
      });
      await send(
        common.token,
        common.chatId,
        workflowProposalMessage(workflow),
        plan.ready ? approvalKeyboard(workflow.id) : undefined,
      );
      return { handled: true, ok: true, action: parsed.action, id: workflow.id, ready: plan.ready };
    }

    const object = await store.get(row.uid, parsed.objectId);
    if (!object) return { handled: true, ok: false, action: parsed.action, reason: "object_not_found" };
    const result = parsed.action === "approve"
      ? await approveCommerceObject({
        uid: row.uid,
        object,
        actorId: input.actorId,
      }, {
        ...dependencies,
        store,
        eventLedger: object.kind === "workflow"
          ? (dependencies.eventLedger || createCommerceEventLedger(dependencies))
          : dependencies.eventLedger,
      })
      : await cancelCommerceObject({
        uid: row.uid,
        object,
        actorId: input.actorId,
      }, { ...dependencies, store });
    if (result.ok && common.messageId) {
      const text = parsed.action === "approve"
        ? "✅ 承認済み。Rockstar_ibot実行台帳に登録しました。公式readback待ちです。"
        : "✏️ 保留しました。外部操作は実行していません。";
      await edit(common.token, common.chatId, common.messageId, text);
    } else if (!result.ok) {
      const failureText = result.reason === "paused"
        ? `⏸ ${ROCKSTAR_WORKSPACE.displayName}は停止中です。/pause で再開するまで新しい実行はキューに入れません。`
        : (result.reason === "deadline_expired"
          ? "期限から逆算した開始時刻を過ぎています。期限を更新して再提案してください。"
          : (result.reason === "runtime_not_ready"
            ? "この単独ジョブの実行adapterはまだ接続されていません。外部操作はしていません。"
            : null));
      if (failureText) await send(common.token, common.chatId, failureText);
    }
    return { handled: true, action: parsed.action, ...result };
  } catch (error) {
    const reason = error && error.code === "free_tool_limit_reached"
      ? "free_tool_limit_reached"
      : "operation_failed";
    if (reason === "free_tool_limit_reached") {
      const starsAmount = Number.isSafeInteger(Number(dependencies.starsAmount))
        && Number(dependencies.starsAmount) > 0
        ? Number(dependencies.starsAmount)
        : null;
      const purchaseLabel = starsAmount
        ? `⭐️ ${starsAmount} Starsで購入して追加`
        : "⭐️ Starsで購入して追加";
      await send(
        common.token,
        common.chatId,
        [
          "<b>4つ目のツールを追加</b>",
          "",
          `追加するツール：${parsed.connectorKey}`,
          starsAmount ? `今回のDORA利用料：${starsAmount} Stars（都度購入）` : "今回のDORA利用料：Telegram購入確認に表示",
          "提供内容：10ツールの利用枠を解放し、選んだツールを追加",
          "提供時期：Telegramが支払成功を通知した直後",
          "",
          "下の有料ボタンからTelegram公式の購入確認を直接開きます。最初の利用同意や、この案内を表示しただけでは課金されません。",
        ].join("\n"),
        { reply_markup: { inline_keyboard: [[{
          text: purchaseLabel,
          callback_data: `dora:upgrade:${parsed.connectorKey}`,
        }]] } },
      );
    }
    return { handled: true, ok: false, action: parsed.action, reason, error: error.message };
  }
}

module.exports = { parseCommerceCallback, handleCommerceCallback };

"use strict";

const {
  listCommerceConnectors,
} = require("./commerce-connector-catalog.js");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function selectionMap(entitlement = {}) {
  return new Map((entitlement.selections || []).map((selection) => [
    selection.connectorKey,
    selection,
  ]));
}

function toolIcon(selection) {
  if (!selection || !selection.active) return "◻️";
  return selection.connectionState === "connected" ? "✅" : "🟡";
}

function toolSelectionMessage(entitlement = {}) {
  const selected = selectionMap(entitlement);
  const activeCount = Array.isArray(entitlement.activeToolKeys)
    ? entitlement.activeToolKeys.length
    : 0;
  const limit = entitlement.active_tool_limit == null
    ? "無制限"
    : String(entitlement.active_tool_limit);
  const lines = [
    "🔌 <b>連携ツール</b>",
    `選択中: ${activeCount}/${limit}（ワークフローの実行回数は課金対象外）`,
    "",
  ];
  for (const connector of listCommerceConnectors()) {
    const selection = selected.get(connector.key);
    const status = !selection || !selection.active
      ? "未選択"
      : (selection.connectionState === "connected" ? "接続済み" : "接続待ち");
    lines.push(`${toolIcon(selection)} <b>${escapeHtml(connector.name)}</b> — ${status}`);
  }
  if (entitlement.active_tool_limit != null && activeCount > entitlement.active_tool_limit) {
    lines.push(
      "",
      `⚠️ 現在のプラン上限を${activeCount - entitlement.active_tool_limit}個超えています。${entitlement.active_tool_limit}個以下に解除するまで新しいワークフローは実行できません。`,
    );
  }
  lines.push(
    "",
    "ボタンで選択／解除できます。選択したツールは同じ販売フロー内でまとめて使います。",
    entitlement.paid ? "有料枠：10ツールすべてを選択できます。" : "無料枠：3ツールまで。4つ目を選ぶとStarsの購入確認が開きます。",
    "🟡は利用枠を確保済みですが、OAuth・API・credential referenceの接続確認が必要です。",
  );
  return lines.join("\n");
}

function toolSelectionKeyboard(entitlement = {}) {
  const selected = selectionMap(entitlement);
  const buttons = listCommerceConnectors().map((connector) => {
    const selection = selected.get(connector.key);
    const active = Boolean(selection && selection.active);
    return {
      text: `${toolIcon(selection)} ${connector.name}`,
      callback_data: `commerce:${active ? "d" : "t"}:${connector.key}`,
    };
  });
  const rows = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return { reply_markup: { inline_keyboard: rows } };
}

function productActionsKeyboard(productId) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "🚀 発売まで自動で組む", callback_data: `commerce:w:l:${productId}` },
      ]],
    },
  };
}

function approvalKeyboard(objectId) {
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ 承認して実行待ちへ", callback_data: `commerce:a:${objectId}` },
        { text: "✏️ 保留", callback_data: `commerce:c:${objectId}` },
      ]],
    },
  };
}

function workflowProposalMessage(object) {
  const plan = object && object.data && object.data.plan;
  if (!plan) return "ワークフロー案を表示できません。";
  const lines = [
    "🧭 <b>逆算ワークフロー</b>",
    `ID: <code>${escapeHtml(object.id)}</code>`,
    `目的: ${escapeHtml(plan.terminal_outcome)}`,
    `期限: ${escapeHtml(plan.deadline)}`,
    `使用ツール: ${plan.relevant_tool_keys.map(escapeHtml).join(", ") || "なし"}`,
    `工程: ${plan.steps.length}`,
  ];
  if (!plan.ready) {
    lines.push(
      `\n⚠️ 接続・入力待ち: ${plan.missing_requirements.length}件`,
      ...plan.missing_requirements.slice(0, 6).map((item) => (
        `• ${escapeHtml(item.ref_key || item.phase_key || item.code)} — ${escapeHtml(item.code)}`
      )),
      "不足情報が埋まるまで外部操作は実行しません。",
    );
  } else {
    lines.push(
      "",
      "承認すると既存のRockstar_ibot実行台帳へ工程を登録します。",
      "providerの公式readbackが返るまで完了とは扱いません。",
    );
  }
  return lines.join("\n");
}

module.exports = {
  escapeHtml,
  toolSelectionMessage,
  toolSelectionKeyboard,
  productActionsKeyboard,
  approvalKeyboard,
  workflowProposalMessage,
};

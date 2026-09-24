// Telegram command boundary for the owner-only local Codex bridge.
"use strict";

const { createSupabaseCodexJobStore } = require("./codex-job-store.js");
const { sendMessage } = require("./telegram.js");

const COMMAND = /^\/codex(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i;
const MAX_PROMPT = 12_000;

function parseCodexCommand(value) {
  const match = COMMAND.exec(String(value || "").trim());
  if (!match) return null;
  const args = String(match[1] || "").trim();
  if (!args) return { mode: null, prompt: "" };
  const modeMatch = /^(ask|edit)\s+([\s\S]+)$/i.exec(args);
  const mode = modeMatch ? (modeMatch[1].toLowerCase() === "edit" ? "workspace-write" : "read-only") : "read-only";
  const prompt = (modeMatch ? modeMatch[2] : args).trim();
  return { mode, prompt };
}

function allowedChatIds(value) {
  return new Set(String(value || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
}

function isAllowedOwner(chatId, value) {
  return allowedChatIds(value).has(String(chatId || ""));
}

function helpText() {
  return [
    "Codexへの指示を受け付けます。",
    "",
    "通常：/codex <指示>（読み取り専用）",
    "編集：/codex edit <指示>（Mr.の作業ツリーを変更できます）",
    "",
    "指示はこのMacのCodexで実行し、結果をこのチャットへ返します。",
  ].join("\n");
}

async function handleCodexMessage(input = {}, options = {}) {
  const parsed = parseCodexCommand(input.text);
  if (!parsed) return { handled: false };
  const send = options.sendMessage || sendMessage;
  const chatId = String(input.chatId || "");
  if (input.chatType && input.chatType !== "private") {
    await send(options.telegramToken, chatId, "Codex連携は個人チャットでのみ使えます。");
    return { handled: true, accepted: false, reason: "private_chat_required" };
  }
  if (!isAllowedOwner(chatId, options.allowedChatIds || process.env.LM_CODEX_ALLOWED_CHAT_IDS)) {
    // Do not distinguish a non-owner from an unconfigured owner in a group or public chat.
    await send(options.telegramToken, chatId, "このCodex連携は利用できません。");
    return { handled: true, accepted: false, reason: "owner_not_allowed" };
  }
  if (options.enabled !== true) {
    await send(options.telegramToken, chatId, "Codex連携は現在準備中です。設定が完了したら使えるようになります。");
    return { handled: true, accepted: false, reason: "bridge_disabled" };
  }
  if (!parsed.prompt) {
    await send(options.telegramToken, chatId, helpText());
    return { handled: true, accepted: false, reason: "help" };
  }
  if (parsed.prompt.length > MAX_PROMPT) {
    await send(options.telegramToken, chatId, "指示が長すぎます。12,000文字以内で送ってください。");
    return { handled: true, accepted: false, reason: "prompt_too_long" };
  }
  if (!input.messageId || input.updateId == null || !input.userId) {
    await send(options.telegramToken, chatId, "Telegramのメッセージ情報を確認できないため、受け付けられませんでした。");
    return { handled: true, accepted: false, reason: "telegram_metadata_missing" };
  }
  const store = options.store || createSupabaseCodexJobStore(options);
  const queued = await store.enqueue({
    uid: input.uid || null,
    chatId,
    userId: input.userId,
    messageId: input.messageId,
    updateId: String(input.updateId),
    prompt: parsed.prompt,
    mode: parsed.mode,
  });
  const prefix = queued.created ? "受付しました" : "この指示はすでに受付済みです";
  const sent = await send(options.telegramToken, chatId,
    `${prefix}。${parsed.mode === "workspace-write" ? "編集モード" : "読み取り専用モード"}で実行します。\nJob: <code>${String(queued.job.id)}</code>`);
  return {
    handled: true,
    accepted: true,
    created: queued.created,
    jobId: String(queued.job.id),
    telegramMessageId: sent && sent.ok && sent.result ? sent.result.message_id : null,
  };
}

module.exports = {
  MAX_PROMPT,
  parseCodexCommand,
  allowedChatIds,
  isAllowedOwner,
  helpText,
  handleCodexMessage,
};

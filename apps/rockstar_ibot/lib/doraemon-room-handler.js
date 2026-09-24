"use strict";

const {
  WORK_PROFILES,
  parseRoomCallback,
  mainRoomMessage,
  mainRoomKeyboard,
  toolRoomMessage,
  roomKeyboard,
  allToolsMessage,
  allToolsKeyboard,
  selectionMessage,
  selectionKeyboard,
  jobsMessage,
  jobsKeyboard,
  helpMessage,
} = require("./doraemon-rooms.js");
const { FEATURE_NAMES } = require("./doraemon-feature-selection.js");
const {
  doraemonWelcomeMessage,
  doraemonWelcomeKeyboard,
} = require("./doraemon-welcome.js");
const {
  intakePromptMessage,
  intakeReplyMarkup,
  commandRevisionPromptMessage,
  commandRevisionReplyMarkup,
} = require("./doraemon-workflow.js");

async function handleDoraemonRoomCallback(value, input = {}, dependencies = {}) {
  const parsed = parseRoomCallback(value);
  if (!parsed) return { handled: false };
  const edit = dependencies.editMessageText;
  const send = dependencies.sendMessage;
  const answer = dependencies.answerCallbackQuery;
  const token = input.token || dependencies.token;
  const chatId = String(input.chatId || "");

  if (String(input.chatType || "private") !== "private" || String(input.actorId || "") !== chatId) {
    if (answer) await answer(token, input.callbackQueryId, "個人チャットで開いてください");
    return { handled: true, ok: false, reason: "private_chat_required" };
  }

  async function show(text, keyboard, toast) {
    if (answer) await answer(token, input.callbackQueryId, toast || "開きました");
    const extra = keyboard ? { reply_markup: keyboard } : undefined;
    if (edit && input.messageId) {
      await edit(token, chatId, input.messageId, text, extra);
    } else if (send) {
      await send(token, chatId, text, extra);
    }
  }

  async function loadSelection(fallback = []) {
    if (typeof dependencies.loadSelection !== "function") return { uid: null, keys: fallback };
    try {
      const current = await dependencies.loadSelection();
      if (current && Array.isArray(current.keys)) return { uid: current.uid || null, keys: current.keys };
    } catch {}
    return { uid: null, keys: fallback };
  }

  if (parsed.action === "jobs") {
    await show(jobsMessage(), jobsKeyboard(), "仕事内容を選んでください");
    return { handled: true, ok: true, action: "jobs" };
  }
  if (parsed.action === "job") {
    const keys = WORK_PROFILES[parsed.profileKey].keys;
    await show(selectionMessage(keys), selectionKeyboard(keys), "おすすめを入れました");
    return { handled: true, ok: true, action: "job", keys };
  }
  if (parsed.action === "pick") {
    let keys = parsed.keys;
    if (parsed.featureKey === "menu") keys = (await loadSelection(keys)).keys;
    if (parsed.featureKey !== "menu") {
      keys = keys.includes(parsed.featureKey)
        ? keys.filter((key) => key !== parsed.featureKey)
        : [...keys, parsed.featureKey];
      if (keys.length > 3) {
        if (answer) await answer(token, input.callbackQueryId, "無料で選べるのは3種類までです");
        return { handled: true, ok: false, action: "pick", reason: "selection_limit", keys: parsed.keys };
      }
    }
    await show(selectionMessage(keys), selectionKeyboard(keys), parsed.featureKey === "menu" ? "選び直せます" : "選択を更新しました");
    return { handled: true, ok: true, action: "pick", keys };
  }
  if (parsed.action === "start") {
    const current = await loadSelection([]);
    if (!current.uid || !current.keys.includes(parsed.roomKey)) {
      if (answer) await answer(token, input.callbackQueryId, "先にこの道具を選んでください");
      if (send) await send(token, chatId, `「${FEATURE_NAMES[parsed.roomKey]}」を現在の1〜3種類へ追加してから頼んでください。`);
      return { handled: true, ok: false, action: "start", reason: "feature_not_selected" };
    }
    if (answer) await answer(token, input.callbackQueryId, "入力欄を開きました");
    if (send) await send(token, chatId, intakePromptMessage(parsed.roomKey), {
      reply_markup: intakeReplyMarkup(parsed.roomKey),
    });
    return { handled: true, ok: true, action: "start", roomKey: parsed.roomKey, keys: current.keys };
  }
  if (parsed.action === "revise" || parsed.action === "accept") {
    const store = dependencies.codexStore;
    const current = await loadSelection([]);
    const job = store && typeof store.read === "function"
      ? await store.read(parsed.jobId).catch(() => null)
      : null;
    const isFeatureJob = job && job.job_kind === "doraemon_feature" && FEATURE_NAMES[job.feature_key];
    const isCommandJob = job && job.job_kind === "doraemon_command";
    const authorized = job
      && current.uid
      && String(job.telegram_chat_id || "") === chatId
      && String(job.uid || "") === String(current.uid)
      && (isFeatureJob || isCommandJob);
    if (!authorized) {
      if (answer) await answer(token, input.callbackQueryId, "この仕事を確認できません");
      return { handled: true, ok: false, action: parsed.action, reason: "job_not_authorized" };
    }
    if (parsed.action === "revise") {
      if (!["completed", "failed"].includes(job.status)) {
        if (answer) await answer(token, input.callbackQueryId, "まだ作業中です");
        return { handled: true, ok: false, action: "revise", reason: "job_not_terminal" };
      }
      if (answer) await answer(token, input.callbackQueryId, "修正内容を書いてください");
      if (send) await send(token, chatId,
        isCommandJob ? commandRevisionPromptMessage(job.id) : intakePromptMessage(job.feature_key, job.id), {
        reply_markup: isCommandJob ? commandRevisionReplyMarkup() : intakeReplyMarkup(job.feature_key),
      });
      return { handled: true, ok: true, action: "revise", jobId: job.id };
    }
    if (job.accepted_at) {
      if (answer) await answer(token, input.callbackQueryId, "すでに完了しています");
      return { handled: true, ok: true, action: "accept", jobId: job.id, alreadyAccepted: true };
    }
    const accepted = typeof store.accept === "function"
      ? await store.accept(job.id, chatId).catch(() => null)
      : null;
    if (!accepted) {
      const latest = store && typeof store.read === "function"
        ? await store.read(job.id).catch(() => null)
        : null;
      if (latest && latest.accepted_at) {
        if (answer) await answer(token, input.callbackQueryId, "すでに完了しています");
        return { handled: true, ok: true, action: "accept", jobId: job.id, alreadyAccepted: true };
      }
      if (answer) await answer(token, input.callbackQueryId, "結果のお届け後に完了にできます");
      return { handled: true, ok: false, action: "accept", reason: "job_not_delivered" };
    }
    if (answer) await answer(token, input.callbackQueryId, "完了にしました");
    if (send) await send(token, chatId, `✅ 「${isCommandJob ? "総合司令室" : FEATURE_NAMES[job.feature_key]}」の仕事を完了にしました。`);
    return { handled: true, ok: true, action: "accept", jobId: job.id };
  }
  if (parsed.action === "done") {
    const startFreeTier = dependencies.startFreeTier;
    const featureStore = dependencies.featureStore;
    if (!startFreeTier || !featureStore) {
      if (answer) await answer(token, input.callbackQueryId, "現在準備中です");
      if (send) await send(token, chatId, "選択内容を安全に保存できませんでした。時間を置いてやり直してください。");
      return { handled: true, ok: false, action: "done", reason: "storage_unavailable" };
    }
    try {
      const freeTier = await startFreeTier({
        chatType: "private",
        chatId,
        userId: String(input.actorId),
        profileName: input.profileName || "",
        termsVersion: "2026-09-04-telegram-rooms-v1",
      });
      await featureStore.replace({
        uid: freeTier.uid,
        featureKeys: parsed.keys,
        termsVersion: "2026-09-04-telegram-rooms-v1",
      });
      await show(mainRoomMessage(parsed.keys), mainRoomKeyboard(parsed.keys), "総合司令室を開きました");
      return { handled: true, ok: true, action: "done", keys: parsed.keys, uid: freeTier.uid };
    } catch {
      if (answer) await answer(token, input.callbackQueryId, "保存できませんでした");
      if (send) await send(token, chatId, "選択内容を保存できなかったため開始していません。時間を置いてやり直してください。");
      return { handled: true, ok: false, action: "done", reason: "storage_failed" };
    }
  }
  if (parsed.action === "today") {
    const current = await loadSelection(parsed.keys);
    if (answer) await answer(token, input.callbackQueryId, "今日やることを確認します");
    if (dependencies.runToday) await dependencies.runToday(current);
    else if (send) await send(token, chatId, "このチャットで /today を送ると、承認待ちと確認待ちをまとめて見られます。");
    return { handled: true, ok: true, action: "today", keys: current.keys };
  }
  const current = await loadSelection(parsed.keys);
  if (parsed.action === "home") {
    if (!current.keys.length) await show(selectionMessage([]), selectionKeyboard([]), "道具を選んでください");
    else await show(mainRoomMessage(current.keys), mainRoomKeyboard(current.keys), "総合司令室");
  } else if (parsed.action === "all") {
    await show(allToolsMessage(current.keys), allToolsKeyboard(current.keys), "10種類を表示しました");
  } else if (parsed.action === "room") {
    await show(toolRoomMessage(parsed.roomKey, current.keys), roomKeyboard(parsed.roomKey, current.keys), "道具の部屋を開きました");
  } else if (parsed.action === "help") {
    await show(helpMessage(current.keys), mainRoomKeyboard(current.keys), "使い方を表示しました");
  }
  return { handled: true, ok: true, action: parsed.action, keys: current.keys };
}

function parseDoraemonShortcutCommand(value) {
  const match = /^\/(home|tools|jobs|today|help)(?:@[A-Za-z0-9_]+)?$/i.exec(String(value || "").trim());
  return match ? match[1].toLowerCase() : null;
}

async function handleDoraemonShortcutCommand(value, input = {}, dependencies = {}) {
  const command = parseDoraemonShortcutCommand(value);
  if (!command) return { handled: false };
  const send = dependencies.sendMessage;
  const token = input.token || dependencies.token;
  const chatId = String(input.chatId || "");
  if (String(input.chatType || "private") !== "private" || String(input.actorId || "") !== chatId) {
    if (send) await send(token, chatId, "avocadominiはTelegramの個人チャットで使ってください。");
    return { handled: true, ok: false, action: command, reason: "private_chat_required" };
  }

  let current = { uid: null, keys: [], selectionUnavailable: false };
  if (command !== "jobs" && typeof dependencies.loadSelection === "function") {
    try {
      const loaded = await dependencies.loadSelection();
      if (loaded && Array.isArray(loaded.keys)) current = { uid: loaded.uid || null, keys: loaded.keys };
    } catch {
      if (command === "help") {
        current = { uid: null, keys: [], selectionUnavailable: true };
      } else {
        if (send) await send(token, chatId, "選択中の道具を確認できませんでした。少し待ってからもう一度お試しください。");
        return { handled: true, ok: false, action: command, reason: "selection_unavailable" };
      }
    }
  }

  const keys = current.keys;
  if (command === "today") {
    if (!keys.length) {
      if (send) await send(token, chatId, [
        "☀️ <b>今日やること</b>",
        "",
        "まだ道具を選んでいません。仕事に合う道具を選ぶと、依頼と結果をここで確認できます。",
      ].join("\n"), { reply_markup: doraemonWelcomeKeyboard() });
    } else if (typeof dependencies.runToday === "function") {
      await dependencies.runToday(current);
    } else if (send) {
      await send(token, chatId, "今日の仕事を確認できませんでした。少し待ってからもう一度お試しください。");
    }
    return { handled: true, ok: true, action: command, keys };
  }

  let message;
  let keyboard;
  if (command === "home") {
    message = keys.length ? mainRoomMessage(keys) : doraemonWelcomeMessage();
    keyboard = keys.length ? mainRoomKeyboard(keys) : doraemonWelcomeKeyboard();
  } else if (command === "tools") {
    message = keys.length ? allToolsMessage(keys) : selectionMessage([]);
    keyboard = keys.length ? allToolsKeyboard(keys) : selectionKeyboard([]);
  } else if (command === "jobs") {
    message = jobsMessage();
    keyboard = jobsKeyboard();
  } else {
    message = helpMessage(keys, { selectionUnavailable: current.selectionUnavailable });
    keyboard = keys.length ? mainRoomKeyboard(keys) : doraemonWelcomeKeyboard();
  }
  if (send) await send(token, chatId, message, { reply_markup: keyboard });
  return { handled: true, ok: true, action: command, keys };
}

module.exports = {
  handleDoraemonRoomCallback,
  parseDoraemonShortcutCommand,
  handleDoraemonShortcutCommand,
};

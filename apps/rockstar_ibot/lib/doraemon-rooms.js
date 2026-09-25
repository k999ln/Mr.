"use strict";

const {
  FEATURE_KEYS,
  FEATURE_NAMES,
  MAX_FEATURE_SELECTIONS,
} = require("./doraemon-feature-selection.js");
const { FEATURE_BY_KEY, featureStatus } = require("./doraemon-feature-catalog.js");

const FEATURE_ROOMS = Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key) => {
  const feature = FEATURE_BY_KEY[key];
  return [key, Object.freeze({
    emoji: feature.emoji,
    summary: feature.summary,
    input: feature.input,
    output: feature.output,
    example: feature.example,
    firstStep: feature.firstStep,
    notices: feature.notices,
  })];
})));

const WORK_PROFILES = Object.freeze({
  creator: Object.freeze({ label: "作品・発信を販売", keys: ["store", "promote", "measure"] }),
  teacher: Object.freeze({ label: "講師・コーチ", keys: ["course", "nurture", "deliver"] }),
  service: Object.freeze({ label: "相談・代行サービス", keys: ["request", "promote", "pay"] }),
  shop: Object.freeze({ label: "店舗・商品販売", keys: ["store", "pay", "deliver"] }),
  team: Object.freeze({ label: "チームで販売", keys: ["request", "measure", "split"] }),
  explore: Object.freeze({ label: "まだ決めていない", keys: ["request", "check", "measure"] }),
});

function normalizeKeys(keys) {
  return FEATURE_KEYS.filter((key) => Array.isArray(keys) && keys.includes(key));
}

function keysToMask(keys) {
  return normalizeKeys(keys).reduce((mask, key) => mask | (1 << FEATURE_KEYS.indexOf(key)), 0);
}

function maskToKeys(maskText, { allowEmpty = false } = {}) {
  const mask = Number.parseInt(String(maskText || "0"), 36);
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= (1 << FEATURE_KEYS.length)) return null;
  const keys = FEATURE_KEYS.filter((_, index) => (mask & (1 << index)) !== 0);
  if ((!allowEmpty && keys.length < 1) || keys.length > MAX_FEATURE_SELECTIONS) return null;
  return keys;
}

function mainRoomMessage(keys, options = {}) {
  const selected = normalizeKeys(keys);
  const source = options.fromWebsite ? "サイトで選んだ内容を反映しました。" : "使う道具を準備しました。";
  return [
    "🏠 <b>avocadomini 総合司令室</b>",
    "",
    source,
    ...selected.map((key) => `${FEATURE_ROOMS[key].emoji} ${FEATURE_NAMES[key]}`),
    "",
    "ここが全部の入口です。下の道具を押すと、その道具の説明・使い方・届く通知を確認できます。",
    "何から始めるか迷ったら、やりたいことを普通の文章でこのチャットへ送ってください。",
  ].join("\n");
}

function mainRoomKeyboard(keys) {
  const selected = normalizeKeys(keys);
  const mask = keysToMask(selected).toString(36);
  return {
    inline_keyboard: [
      ...selected.map((key) => [{
        text: `${FEATURE_ROOMS[key].emoji} ${FEATURE_NAMES[key]}の部屋`,
        callback_data: `dora:room:${key}:${mask}`,
      }]),
      [{ text: "☀️ 今日やること", callback_data: `dora:today:${mask}` }],
      [{ text: "🧰 10種類を全部見る", callback_data: `dora:all:${mask}` }],
      [{ text: "🔄 道具を追加・変更", callback_data: `dora:pick:${mask}:menu` }],
      [{ text: "❓ 使い方", callback_data: `dora:help:${mask}` }],
    ],
  };
}

function toolRoomMessage(key, keys) {
  const room = FEATURE_ROOMS[key];
  if (!room) return null;
  const feature = FEATURE_BY_KEY[key];
  const status = featureStatus(feature);
  const selected = normalizeKeys(keys).includes(key);
  return [
    `${room.emoji} <b>${FEATURE_NAMES[key]}の部屋</b>${selected ? "　✅ 選択中" : ""}`,
    "",
    room.summary,
    "",
    `<b>現在の状態</b>：${status.label}`,
    status.canDraft
      ? "Telegramから依頼を受けて、まず使える下書き・確認結果を返します。"
      : "説明と入力例を確認できます。実行基盤はまだ準備中です。",
    status.connectorKeys.length
      ? `<b>接続が必要な場合</b>：${status.connectorKeys.join(", ")}（未接続なら外部操作は行わず、下書きで止まります）`
      : "<b>外部接続</b>：不要（入力された内容だけで下書きできます）",
    "",
    `<b>送るもの</b>：${room.input}`,
    `<b>返ってくるもの</b>：${room.output}`,
    `<b>通知</b>：${room.notices}`,
    "",
    selected
      ? `${room.firstStep}\n下の「この道具に頼む」を押すと入力欄が開きます。`
      : "この道具を使うには、下のボタンで現在の1〜3種類へ追加してください。",
    room.example,
    "",
    "公開・配信・決済・送金など外部へ影響する操作は、確認なしに実行しません。",
  ].join("\n");
}

function roomKeyboard(key, keys) {
  const selected = normalizeKeys(keys);
  const mask = keysToMask(selected).toString(36);
  const rows = [[{ text: "🏠 総合司令室へ戻る", callback_data: `dora:home:${mask}` }]];
  rows.unshift(selected.includes(key)
    ? [{ text: "✍️ この道具に頼む", callback_data: `dora:start:${key}` }]
    : [{ text: "＋ この道具を選ぶ", callback_data: `dora:pick:${mask}:${key}` }]);
  return { inline_keyboard: rows };
}

function allToolsMessage(keys) {
  const selected = new Set(normalizeKeys(keys));
  return [
    "🧰 <b>avocadominiの10種類</b>",
    "",
    ...FEATURE_KEYS.map((key) => {
      const status = featureStatus(FEATURE_BY_KEY[key]);
      return `${selected.has(key) ? "✅" : "▫️"} ${FEATURE_ROOMS[key].emoji} <b>${FEATURE_NAMES[key]}</b> — ${status.label} — ${FEATURE_ROOMS[key].summary}`;
    }),
    "",
    "無料で同時に選べるのは1〜3種類です。名前を押すと、入力例・返ってくるもの・接続待ちの有無を確認できます。",
  ].join("\n");
}

function allToolsKeyboard(keys) {
  const mask = keysToMask(keys).toString(36);
  const rows = FEATURE_KEYS.map((key) => [{
    text: `${FEATURE_ROOMS[key].emoji} ${FEATURE_NAMES[key]}`,
    callback_data: `dora:room:${key}:${mask}`,
  }]);
  rows.push([{ text: "🔄 選び直す", callback_data: `dora:pick:${mask}:menu` }]);
  if (mask !== "0") rows.push([{ text: "🏠 総合司令室へ戻る", callback_data: `dora:home:${mask}` }]);
  return { inline_keyboard: rows };
}

function selectionMessage(keys) {
  const selected = normalizeKeys(keys);
  return [
    "🧰 <b>使いたい道具を選ぶ</b>",
    "",
    `現在 ${selected.length}/${MAX_FEATURE_SELECTIONS}種類`,
    selected.length ? selected.map((key) => `✅ ${FEATURE_NAMES[key]}`).join("\n") : "まだ選んでいません。",
    "",
    "1〜3種類を選べます。もう一度押すと外せます。選び終わったら一番下の「この内容で始める」を押してください。",
  ].join("\n");
}

function selectionKeyboard(keys) {
  const selected = normalizeKeys(keys);
  const selectedSet = new Set(selected);
  const mask = keysToMask(selected).toString(36);
  const rows = [];
  for (let index = 0; index < FEATURE_KEYS.length; index += 2) {
    rows.push(FEATURE_KEYS.slice(index, index + 2).map((key) => ({
      text: `${selectedSet.has(key) ? "✅" : "▫️"} ${FEATURE_NAMES[key]}`,
      callback_data: `dora:pick:${mask}:${key}`,
    })));
  }
  if (selected.length) rows.push([{ text: "▶️ この内容で始める", callback_data: `dora:done:${mask}` }]);
  rows.push([{ text: "💼 仕事内容からおすすめ", callback_data: "dora:jobs" }]);
  return { inline_keyboard: rows };
}

function jobsMessage() {
  return [
    "💼 <b>仕事に合う道具を探す</b>",
    "",
    "いちばん近いものを選んでください。おすすめの3種類を先に入れます。あとで自由に変えられます。",
  ].join("\n");
}

function jobsKeyboard() {
  return {
    inline_keyboard: [
      ...Object.entries(WORK_PROFILES).map(([key, profile]) => [{ text: profile.label, callback_data: `dora:job:${key}` }]),
      [{ text: "🧰 10種類から自分で選ぶ", callback_data: "dora:pick:0:menu" }],
    ],
  };
}

function helpMessage(keys, options = {}) {
  const selected = normalizeKeys(keys);
  const selectionUnavailable = options.selectionUnavailable === true;
  return [
    "❓ <b>使い方</b>",
    "",
    selectionUnavailable
      ? "選択中の道具は今確認できませんが、使い方は確認できます。少し待ってから /home を開き直してください。"
      : selected.length
      ? "このチャットへ、やりたいことを普通の文章で送るだけで始められます。"
      : "まだ道具を選んでいません。/jobs で仕事からおすすめを選ぶか、/tools で10種類を見てください。",
    "",
    "1. 必要なら /tools から道具の説明と入力例を見る",
    "2. やりたいことを普通の文章で送る",
    "3. 受付番号が届くので、結果を待つ",
    "4. 届いた結果を『修正する』または『完了にする』",
    "",
    `現在の道具：${selectionUnavailable ? "一時的に確認できません" : selected.map((key) => FEATURE_NAMES[key]).join("、") || "未選択"}`,
    "",
    "いつでも使える入口：",
    "/home — 総合司令室",
    "/tools — 10種類を見る・変更する",
    "/jobs — 仕事内容からおすすめを選ぶ",
    "/today — 受付中・完了した仕事を見る",
    "/help — この説明を開く",
    "",
    "通知はこのチャットに道具名つきで届きます。公開・外部送信・決済・送金は、確認なしに実行しません。",
  ].join("\n");
}

function parseRoomCallback(value) {
  const text = String(value || "");
  if (text === "dora:home") return { action: "home", keys: [] };
  if (text === "dora:jobs") return { action: "jobs" };
  let match = /^dora:start:([a-z]+)$/.exec(text);
  if (match && FEATURE_ROOMS[match[1]]) return { action: "start", roomKey: match[1] };
  match = /^dora:(revise|accept):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(text);
  if (match) return { action: match[1], jobId: match[2].toLowerCase() };
  match = /^dora:job:([a-z]+)$/.exec(text);
  if (match && WORK_PROFILES[match[1]]) return { action: "job", profileKey: match[1] };
  match = /^dora:(home|all|help|today):([0-9a-z]{1,3})$/.exec(text);
  if (match && maskToKeys(match[2], { allowEmpty: match[1] !== "home" })) return { action: match[1], keys: maskToKeys(match[2], { allowEmpty: true }) };
  match = /^dora:room:([a-z]+):([0-9a-z]{1,3})$/.exec(text);
  if (match && FEATURE_ROOMS[match[1]]) {
    const keys = maskToKeys(match[2], { allowEmpty: true });
    return keys ? { action: "room", roomKey: match[1], keys } : null;
  }
  match = /^dora:pick:([0-9a-z]{1,3}):(menu|[a-z]+)$/.exec(text);
  if (match) {
    const keys = maskToKeys(match[1], { allowEmpty: true });
    if (keys && (match[2] === "menu" || FEATURE_ROOMS[match[2]])) return { action: "pick", featureKey: match[2], keys };
  }
  match = /^dora:done:([0-9a-z]{1,3})$/.exec(text);
  if (match) {
    const keys = maskToKeys(match[1]);
    if (keys) return { action: "done", keys };
  }
  return null;
}

module.exports = {
  FEATURE_ROOMS,
  WORK_PROFILES,
  normalizeKeys,
  keysToMask,
  maskToKeys,
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
  parseRoomCallback,
};

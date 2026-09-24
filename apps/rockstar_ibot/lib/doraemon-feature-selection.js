"use strict";

const { EXPECTED_FEATURE_KEYS, FEATURE_BY_KEY } = require("./doraemon-feature-catalog.js");

const FEATURE_KEYS = EXPECTED_FEATURE_KEYS;
const MAX_FEATURE_SELECTIONS = 3;
const FEATURE_NAMES = Object.freeze(Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, FEATURE_BY_KEY[key].verb]),
));

function parseFeatureStartPayload(value) {
  const match = /^f2_([0-9a-z]{1,3})$/i.exec(String(value || "").trim());
  if (!match) return null;
  const mask = Number.parseInt(match[1], 36);
  if (!Number.isSafeInteger(mask) || mask < 1 || mask >= (1 << FEATURE_KEYS.length)) return null;
  const keys = FEATURE_KEYS.filter((_, index) => (mask & (1 << index)) !== 0);
  if (keys.length < 1 || keys.length > MAX_FEATURE_SELECTIONS) return null;
  return Object.freeze({ version: "2026-09-03-feature-v2", mask, keys: Object.freeze(keys) });
}

function featureSelectionMessage(keys) {
  const normalized = FEATURE_KEYS.filter((key) => Array.isArray(keys) && keys.includes(key));
  return [
    "👋 <b>ようこそ、avocadominiへ。</b>",
    "",
    `✅ <b>サイトで選んだ${normalized.length}つをTelegramに反映しました。</b>`,
    "",
    ...normalized.map((key) => `・${FEATURE_NAMES[key]}`),
    "",
    "選択だけでは課金されません。調査や試用を進め、未回収額・改善額など価値の根拠を先に示します。結果の開示または外部実行を選んだ時だけ、購入確認を表示します。",
    "自動決済は行いません。",
  ].join("\n");
}

module.exports = {
  FEATURE_KEYS,
  FEATURE_NAMES,
  MAX_FEATURE_SELECTIONS,
  parseFeatureStartPayload,
  featureSelectionMessage,
};

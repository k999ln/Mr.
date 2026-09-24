"use strict";

const catalog = require("../../../packages/telegram-bot-family/catalog.json");

const profiles = Object.freeze(catalog.packages.map((profile) => Object.freeze({ ...profile })));
const byId = new Map(profiles.map((profile) => [profile.id, profile]));
const styleByCode = new Map(profiles
  .filter((profile) => profile.kind === "personality_style")
  .map((profile) => [profile.styleCode.toLowerCase(), profile]));
const roleCommandProfile = Object.freeze({
  main: "mr-bot",
  mother: "bot-mother",
  baby: "baby",
  guard: "life-guard",
});

// One Telegram account exposes two different navigation concepts:
// - operating profiles change which internal specialist answers;
// - a workspace opens a bounded set of tools without changing the active profile.
// Keep that distinction explicit so Rockstar_ibot is never presented as a second public bot
// or as a twenty-first prompt profile.
const ROCKSTAR_WORKSPACE = Object.freeze({
  id: "rockstar-ibot",
  kind: "workspace",
  displayName: "Rockstar_ibot",
  command: "/commerce",
  purpose: "自分の商品を販売し、決済・購入者・納品・継続を管理する販売ワークスペース",
  owns: "商品、販売施策、注文、決済観測、顧客同意、利用権限、納品、販売分析",
  boundary: "外部案件を探して報酬を得る相談はBaby、生活・仕事全体の整理はMr. Botが担当",
});

const ROLE_DIRECTORY = Object.freeze([
  Object.freeze({
    id: "mr-bot", kind: "main_profile", displayName: byId.get("mr-bot").displayName,
    command: "/main",
    purpose: "予定・生活・仕事・お金を横断して、次にやることを決める総合窓口",
    owns: "未分類の相談受付、全体状況、優先順位、担当への振り分け",
    boundary: "販売の詳細操作はRockstar_ibot、専門判断は各担当へ渡す",
  }),
  ROCKSTAR_WORKSPACE,
  Object.freeze({
    id: "bot-mother", kind: "specialist_profile", displayName: byId.get("bot-mother").displayName,
    command: "/mother",
    purpose: "生活必需品や必要サービスの支援相談を、安全な申請へ整理する担当",
    owns: "必要性、本人同意、承認者、業者からの直接提供に向けた整理",
    boundary: "現金・暗号資産・ギフトカードの給付や、無承認の発注はしない",
  }),
  Object.freeze({
    id: "baby", kind: "specialist_profile", displayName: byId.get("baby").displayName,
    command: "/baby",
    purpose: "自分のスキルに合う外部の仕事・案件で稼ぐ道筋を作る担当",
    owns: "案件候補、適合性、提案、作業、証拠、報酬確認までの計画",
    boundary: "自分の商品販売・購入者管理はRockstar_ibotが担当。収益は保証しない",
  }),
  Object.freeze({
    id: "life-guard", kind: "specialist_profile", displayName: byId.get("life-guard").displayName,
    command: "/guard",
    purpose: "安全・権限・個人情報・証拠・完了条件を確認する横断チェック担当",
    owns: "危険確認、許可確認、情報流出防止、receiptとreadbackの検査",
    boundary: "仕事や販売を代行する担当ではなく、各担当の実行を安全面から検査する",
  }),
]);
const roleDirectoryById = new Map(ROLE_DIRECTORY.map((entry) => [entry.id, entry]));

const STYLE_CODES = Object.freeze([...styleByCode.values()].map((profile) => profile.styleCode));
const PROFILE_IDS = Object.freeze(profiles.map((profile) => profile.id));

function getProfile(profileId) {
  return byId.get(String(profileId || "").trim().toLowerCase()) || byId.get("mr-bot");
}

function profileLabel(profileId) {
  return getProfile(profileId).displayName;
}

function resolveProfileCommand(name, args = "") {
  const command = String(name || "").trim().toLowerCase();
  if (Object.hasOwn(roleCommandProfile, command)) return getProfile(roleCommandProfile[command]);
  if (command !== "style") return null;
  return styleByCode.get(String(args || "").trim().toLowerCase()) || null;
}

function styleMenuMessage() {
  return [
    "Choose a conversation style:",
    STYLE_CODES.join(" · "),
    "",
    "Example: /style entp",
    "This is a self-selected communication style, not a psychological diagnosis. You can change it at any time.",
  ].join("\n");
}

function roleDirectoryMessage() {
  return [
    "🤖 <b>このTelegram Botは1つです</b>",
    "同じデータと安全ルールを使い、コマンドで担当窓口を選びます。",
    "",
    ...ROLE_DIRECTORY.flatMap((entry) => [
      `${entry.kind === "workspace" ? "🏪" : "•"} <b>${entry.displayName}</b>  <code>${entry.command}</code>`,
      `  用途: ${entry.purpose}`,
      `  担当: ${entry.owns}`,
      `  担当外: ${entry.boundary}`,
      "",
    ]),
    "🗣 <code>/style</code> — 担当や権限は変えず、話し方だけを変更します。",
  ].join("\n");
}

function selectedProfileMessage(profile) {
  if (profile.kind === "personality_style") {
    return [
      `🗣 会話スタイルを変更しました: ${profile.displayName}`,
      profile.mission,
      "",
      "変わるのは話し方だけです。担当機能や権限は増えず、心理診断にも使用しません。",
      "担当一覧は /help、総合窓口へ戻るときは /main を使います。",
    ].join("\n");
  }
  const entry = roleDirectoryById.get(profile.id);
  return [
    `🤖 担当を切り替えました: ${profile.displayName}`,
    `用途: ${entry.purpose}`,
    `担当: ${entry.owns}`,
    `担当外: ${entry.boundary}`,
    "",
    profile.id === "mr-bot" ? "現在は総合窓口です。" : "総合窓口へ戻る: /main",
    "商品販売・決済・顧客管理を開く: /commerce",
  ].join("\n");
}

async function saveBotProfile(uid, profileId, supaUrl, supaKey, fetchImpl = globalThis.fetch) {
  if (!uid || !byId.has(profileId) || !supaUrl || !supaKey || typeof fetchImpl !== "function") return false;
  let response;
  try {
    response = await fetchImpl(`${supaUrl}/rest/v1/lm_users?uid=eq.${encodeURIComponent(uid)}`, {
      method: "PATCH",
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ lm_bot_profile_id: profileId, updated_at: new Date().toISOString() }),
    });
  } catch {
    return false;
  }
  return Boolean(response && response.ok);
}

module.exports = {
  PROFILE_IDS,
  STYLE_CODES,
  ROCKSTAR_WORKSPACE,
  ROLE_DIRECTORY,
  getProfile,
  profileLabel,
  resolveProfileCommand,
  styleMenuMessage,
  roleDirectoryMessage,
  selectedProfileMessage,
  saveBotProfile,
};

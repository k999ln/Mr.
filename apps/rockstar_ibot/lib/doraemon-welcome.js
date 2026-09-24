"use strict";

const DEFAULT_DORAEMON_SITE_START_URL = "https://doraos.vercel.app/start";

function doraemonSiteStartUrl(env = process.env) {
  const configured = String(env.DORAEMON_SITE_START_URL || env.DORAEMON_PUBLIC_ORIGIN || "").trim();
  const raw = configured || DEFAULT_DORAEMON_SITE_START_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    if (url.pathname === "" || url.pathname === "/") url.pathname = "/start";
    if (url.pathname !== "/start") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function doraemonWelcomeMessage() {
  return [
    "👋 <b>ようこそ、avocadominiへ。</b>",
    "",
    "販売の仕事を、Telegramからひとつずつ動かせます。",
    "まだ道具を選んでいないので、仕事内容からおすすめを選ぶか、10種類を見て自分で選んでください。",
    "無料で使う道具は1〜3種類。あとから変更できます。",
  ].join("\n");
}

function doraemonWelcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "💼 仕事内容からおすすめ", callback_data: "dora:jobs" }],
      [{ text: "🧰 10種類から自分で選ぶ", callback_data: "dora:pick:0:menu" }],
    ],
  };
}

module.exports = {
  DEFAULT_DORAEMON_SITE_START_URL,
  doraemonSiteStartUrl,
  doraemonWelcomeMessage,
  doraemonWelcomeKeyboard,
};

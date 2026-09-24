"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_DORAEMON_SITE_START_URL,
  doraemonSiteStartUrl,
  doraemonWelcomeMessage,
  doraemonWelcomeKeyboard,
} = require("./doraemon-welcome.js");

test("welcome keeps a safe public site link when the server has no site env", () => {
  assert.equal(doraemonSiteStartUrl({}), DEFAULT_DORAEMON_SITE_START_URL);
  assert.equal(doraemonSiteStartUrl({ DORAEMON_PUBLIC_ORIGIN: "https://site.example" }), "https://site.example/start");
  assert.equal(doraemonSiteStartUrl({ DORAEMON_SITE_START_URL: "http://site.example/start" }), "");
  assert.equal(doraemonSiteStartUrl({ DORAEMON_SITE_START_URL: "https://site.example/start?tg=private" }), "");
});

test("welcome separates direct visitors from people who already selected on the site", () => {
  assert.match(doraemonWelcomeMessage(), /ようこそ、avocadominiへ/);
  assert.match(doraemonWelcomeMessage(), /仕事内容からおすすめ/);
  assert.match(doraemonWelcomeMessage(), /1〜3種類/);
  assert.doesNotMatch(doraemonWelcomeMessage(), /利用条件|プライバシー/);
  assert.deepEqual(doraemonWelcomeKeyboard(), {
    inline_keyboard: [
      [{ text: "💼 仕事内容からおすすめ", callback_data: "dora:jobs" }],
      [{ text: "🧰 10種類から自分で選ぶ", callback_data: "dora:pick:0:menu" }],
    ],
  });
});

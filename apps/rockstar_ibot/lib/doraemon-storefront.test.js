"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { purchasePage } = require("./doraemon-storefront.js");
const { listDoraemonTools } = require("../doraemon-tools/registry.js");

test("storefront starts free in the verified Telegram bot instead of selling first", () => {
  const html = purchasePage({ botUsername: "verified_dora_bot" });
  assert.match(html, /好きな3つを、無料で同時に使う/);
  assert.match(html, /https:\/\/t\.me\/verified_dora_bot\?start=free/);
  assert.match(html, /Telegramで無料スタート/);
  assert.match(html, /4つ目のツール/);
  assert.match(html, new RegExp(`全${listDoraemonTools().length}ツール`));
  for (const tool of listDoraemonTools()) {
    assert.match(html, new RegExp(`data-tool-id="${tool.id}"`));
    assert.match(html, new RegExp(tool.name));
  }
  assert.doesNotMatch(html, /Stripeで購入する/);
});

test("storefront fails closed when the installation bot is not verified", () => {
  const html = purchasePage({ botUsername: "not valid!" });
  assert.match(html, /Telegram BOTを準備中/);
  assert.doesNotMatch(html, /https:\/\/t\.me\//);
});

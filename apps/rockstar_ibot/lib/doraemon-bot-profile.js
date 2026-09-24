"use strict";

// The public BotFather profile is part of the avocadomini product contract. Keep it in one
// dependency-free module so both the one-time installer and the runtime self-heal publish the exact
// same commands and description.
const BOT_COMMANDS = Object.freeze([
  Object.freeze({ command: "start", description: "はじめる・前回の続きへ戻る" }),
  Object.freeze({ command: "home", description: "総合司令室を開く" }),
  Object.freeze({ command: "tools", description: "10種類の道具を見る・変更する" }),
  Object.freeze({ command: "jobs", description: "仕事内容からおすすめを選ぶ" }),
  Object.freeze({ command: "today", description: "受付中・完了した仕事を見る" }),
  Object.freeze({ command: "help", description: "使い方を見る" }),
]);

const BOT_DESCRIPTION = "avocadominiは、販売の仕事を10種類の道具から1〜3種類選び、Telegramで依頼して下書きを受け取れる仕事Botです。公開・外部送信・決済・送金は、確認なしに実行しません。";
const BOT_SHORT_DESCRIPTION = "販売の仕事を選んで頼み、下書きと次の一手を受け取れるBotです。";

module.exports = { BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION };

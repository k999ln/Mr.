# avocadomini / ドラえもん プロジェクト索引

このファイルは、ChatGPTの長い会話履歴を読まずに作業を再開するための短い索引です。新しいチャットでは、まず[新チャット用引き継ぎ](CHAT-HANDOFF.ja.md)と[接続台帳](owner-account-registry.ja.md)を読みます。詳細はリンク先を正本として参照してください。

## 現在の正本

| 対象 | 正本・場所 |
|---|---|
| GitHub | https://github.com/k999ln/Mr. |
| 正本ブランチ | `main` |
| 公開ブランド | `avocadomini` |
| 内部プロダクト名 | `Rockstar_ibot` / `ドラえもん` |
| 公開サイト | https://effect-os-verified.kirin-999.chatgpt.site/ |
| 詳細ページ | https://effect-os-verified.kirin-999.chatgpt.site/details |
| Vercel URL | https://doraos.vercel.app/ |
| X | https://x.com/doraemonbottt |
| Telegram Bot | `@avocadominibot`（token・webhookはGitHubへ保存しない） |
| Stripe Payment Link | https://buy.stripe.com/4gMaEX2OK1yo4GX144c7u00 |

## 最初に読む資料

1. [ルートREADME](../README.md) — 利用者向けの機能、導入、全体像
2. [総合引き継ぎ](DORA_OS_総合引き継ぎ_2026-09-01.md) — 事業の変遷、設計、実装、未完了事項
3. [全成果インベントリ](DORA_OS_全成果インベントリ_2026-09-02.md) — 作ったもの、保存場所、完成状態
4. [Telegram Seller OS設計](telegram-seller-os-design-summary.ja.md) — Telegram中心の販売フロー
5. [所有者の公開設定](../config/owner-public.json) — 所有者、公開リンク、接続先のSSOT
6. [安全な整理ルール](maintenance/memory-and-repository-hygiene.ja.md) — バックアップと削除条件
7. [チャット削除前監査](maintenance/chat-deletion-readiness-2026-09-04.ja.md) — 全チャットを消してよいかの現時点判定
8. [サイト外部接続・再接続台帳](doraemon-site-reconnection.ja.md) — avocadominiとPRIVATE/PIXELのSites、D1、Telegram、メール、決済の再設定情報

## この2タスクから保存したサイト原稿

- [`apps/doraemon-marketing-site/`](../apps/doraemon-marketing-site/) — 公開販売サイト、`/start`、`/details`、法定・privacyページ
- [`apps/dora-launch-blueprint-site/`](../apps/dora-launch-blueprint-site/) — 立ち上げ設計書サイトとPDF
- [`apps/mcp-bot-hub-patent-site/`](../apps/mcp-bot-hub-patent-site/) — MCP Bot Hub特許構想サイトとPDF

## 現在の重要な状態

- 公開サイトと事業説明は公開済み。
- 10機能の設計、販売台帳、承認、決済観測、権限、同意、成果検証のコードがある。
- 実購入からTelegram接続、全機能稼働、納品、返金取消までの本番E2Eは未完了。
- Telegramは利用者自身のBotFather Botを使う`byob_single`が標準。
- avocadominiの`@avocadominibot`はRailway Coreへ接続済み。Webhookの公式readbackも済んでいる。
- 外部providerは資格情報がなければ成功扱いにせず停止する。
- 個人追跡、人物特定、標的選定、兵器・暗殺用途は対象外。

## GitHubへ置かない情報

- Bot Token、API key、password、OTP、秘密鍵
- StripeやVercel等のsecret
- 顧客のメール、電話番号、会話本文
- 同意のない個人データ

これらはOS Keychain、`.env`、サービス側Secret Storeに保存し、GitHubには変数名と設定手順だけを置きます。

## 整理前の停止条件

次のいずれかがあれば`clear`・一括削除・`git clean`を行いません。

- `git status`に未コミットまたは未追跡の内容がある
- リモートへpush済みか確認できない
- バックアップの復元先・日時・内容が確認できない
- 別GitリポジトリまたはSites公開元として利用中
- MCP、プラグイン、スキル、アプリから参照中か不明

## 定期運用

外部サービスを変更した日と本番作業を再開する日に、GitHub、各サービスの現在状態、ローカル差分を確認し、receiptを[外部変更履歴](operations-change-log.ja.md)へ追記します。月1回の整理監査では、バックアップ、Sites、MCP、プラグイン、スキルも確認します。監査は削除を実行せず、保存済みと確認できた整理候補だけを報告します。

手動監査:

```bash
./scripts/maintenance/audit-safe-cleanup.sh
```

終了コード`2`は、削除禁止の未保存内容が存在することを示します。

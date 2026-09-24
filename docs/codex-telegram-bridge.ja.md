# Telegram ↔ Codex 引き継ぎ

avocadominiのKai所有Bot `@avocadominibot` から、KaiのMacでログイン済みのCodexへ仕事を送り、結果を同じTelegramチャットへ返す仕組みです。所有者用の`/codex`と、一般利用者が選んだ10種類の道具から作る隔離Jobを同じ耐久キューで処理します。

## 現在の配備状態（2026-09-05 02:01 JST）

- SupabaseのCodex Job migrationと道具Job migrationは適用・権限readback済み。
- Railwayの`LM_CODEX_BRIDGE_ENABLED=1`と共有鍵は設定済み。
- Core deployment `f7728c7a-0993-4b24-be89-33dd4318b244`はSUCCESS、health HTTP 200、build `23f35bb54672d58ed14a36dc759eba8dc563b2c0`。
- Mac Keychainに共有鍵があり、launchd `ai.k999ln.mr-codex-telegram-bridge`はrunning。
- bridgeの認証・queue到達probeはHTTP 200。
- 一般利用者の道具別Jobと総合司令室Jobは実行可能な構成。
- `LM_CODEX_ALLOWED_CHAT_IDS`は未設定なので、Kai専用`/codex`だけは意図的にfail closed。一般利用者Jobにはこのallowlistを使わない。
- Telegram上の実Job→Codex→結果message IDのE2E receiptは未取得。

## 使い方

```text
/codex <確認・調査の指示>
/codex ask <確認・調査の指示>
/codex edit <Mr.内のファイルを変更する指示>
```

`/codex` と `/codex ask` は読み取り専用です。ファイルを変更する場合だけ、利用者が明示的に`/codex edit`を付けます。Botの一般利用者・グループチャットは受け付けず、Railwayの`LM_CODEX_ALLOWED_CHAT_IDS`に登録したKaiの個人チャットだけを通します。

一般利用者の道具別Jobと総合司令室Jobは`/codex`を使いません。道具の部屋で「この道具に頼む」を押して返信するか、総合司令室へ普通の文章を送ります。このJobは常に読み取り専用で、一件ごとの空の一時フォルダで実行され、Mr.の作業ツリーを読めません。外部公開・送信・決済・返金・権限変更・送金も行わず、下書きまたは確認結果だけを返します。

## 仕組み

```text
Telegram
  ↓ /telegram webhook
Railway: avocadomini-core
  ↓ service-role-only queue
Supabase: avocadomini-production / lm_codex_jobs
  ↓ HTTPS polling + bridge token
KaiのMac: codex-telegram-bridge.js
  ↓ ローカルのCodex ChatGPTログイン
Mr.リポジトリ
  ↓ 結果をRailwayへ返す
Telegram
```

RailwayへCodexの`auth.json`や`CODEX_HOME`をコピーしません。ブリッジはMac側からキューを取りに行きます。Supabaseのキューには処理中の指示と結果が一時保存されますが、テーブルはservice role専用で、匿名・通常ユーザーには権限を与えません。

## 秘密値と設定場所

| 目的 | 変数・保存先 |
|---|---|
| Bot token | Railway `LM_TELEGRAM_BOT_TOKEN` |
| Telegram webhook secret | Railway `LM_TELEGRAM_WEBHOOK_SECRET` |
| Supabase接続 | Railway `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` |
| ブリッジ共有鍵 | Railway `LM_CODEX_BRIDGE_TOKEN` とMacのKeychain。値はGitHub・Telegramへ書かない |
| 実行許可チャット | Railway `LM_CODEX_ALLOWED_CHAT_IDS`。Kaiの個人チャットIDのみ |
| ブリッジ接続先 | Mac側 `LM_CODEX_BRIDGE_BASE_URL=https://avocadomini-core-production.up.railway.app` |
| Codexログイン | Mac側の`CODEX_HOME`。Railwayへ移さない |

## 新規環境での有効化の順番

1. Mr mainへこのコードをpushし、Railwayの`avocadomini-core`へdeployする。
2. Supabase SQL Editorで`apps/rockstar_ibot/migrations/2026-09-04-lm-codex-bridge.sql`と`apps/rockstar_ibot/migrations/2026-09-04-lm-doraemon-job-workflow.sql`を順に実行し、Job表、5つのRPC、道具・総合司令室・修正・完了の記録列を作る。
3. Railway Variablesへ`LM_CODEX_BRIDGE_TOKEN`、`LM_CODEX_ALLOWED_CHAT_IDS`、`LM_CODEX_BRIDGE_ENABLED=1`を設定する。秘密値そのものは台帳に記録しない。
4. MacのKeychainへ同じブリッジ共有鍵を保存する。
5. `scripts/install-codex-telegram-bridge.sh https://avocadomini-core-production.up.railway.app`を実行する。launchd変更は`bin/launchctl-safe`経由だけで行う。
6. Telegramで`/codex Mr.の状態を読み取り専用で確認して`を送り、受付メッセージとCodex結果のmessage IDを確認する。

## 完了条件

以下が揃うまで「接続済み」「本番で使える」とは扱いません。

- GitHub mainのcommit SHA
- Railway deployment IDとCore health HTTP 200/build SHA
- Supabase migration適用のreadback
- Telegram `getWebhookInfo`
- 指示の受付message ID
- Codex結果の実送信message ID
- 道具別Jobの受付、結果、修正、完了、`/today`復元
- Kai専用repository操作も公開する場合だけ、`/codex edit`の変更内容・テスト結果

この機能はTelegramから任意の外部サービスへ直接送信する機能ではありません。外部送信、決済、公開、秘密値の操作は、Mr.の既存ルールに従って別途明示的に確認します。

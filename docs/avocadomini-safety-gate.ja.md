# avocadomini Safety Gate・自己修復契約

最終確認: 2026-09-05 JST

avocadominiの10個の道具と総合司令室は、共通のSafety Gateを通して実行します。個別の道具、利用者の入力、queue内の値から、この安全条件を弱めることはできません。

## 現在の実行契約

| 項目 | 固定値 |
|---|---|
| 実行場所 | 空の一時フォルダを使う隔離Codex |
| ファイル権限 | 読み取り専用 |
| 画面影響 | なし |
| ブラウザ・GUI | 禁止 |
| 外部送信・公開・決済・返金・送金・権限変更 | 禁止 |
| 自動再試行 | 分類できた一時障害だけ、最大2回 |
| 認証・CAPTCHA・2FA・権限不足 | 自動操作せず安全停止 |
| 外部で処理済みか不明 | 重複防止のため再試行せず安全停止 |

Codex起動時は利用者設定、plugin、MCP、project ruleを読み込まず、モデルが起動するshellへ親processのsecretを継承しません。ブラウザ起動用環境変数も無効化します。一般利用者向けJobがMr.の作業treeへ入ることもありません。

## 自己修復の判断

~~~text
依頼
  ↓
Safety Gate ── 条件違反 ──→ 実行せず安全停止
  ↓ 許可
隔離実行
  ├─ 完了 ─────────────→ 結果 + Safety receipt
  ├─ timeout / 429 / 502–504 / 一時的network障害
  │      └─ 新しい隔離実行で1回だけ再試行
  └─ 認証 / CAPTCHA / 権限 / 容量不足 / 原因不明 / 外部効果不明
         └─ 自動再試行せず安全停止・本人へ案内
~~~

「自己修復」は、失敗した操作を何度も繰り返すことではありません。再実行しても外部効果が起きない下書き処理だけを対象にし、原因を明示的に分類できない場合は停止します。

## Safety receipt

bridgeはCoreへ次を返します。

- Safety policy version
- 実行回数
- `none` / `recovered` / `human_required` / `safe_stopped`
- 分類済みfailure code
- `screenImpact: none`
- `browserAccess: denied`
- `externalEffect: denied`

Coreはreceiptを再検証し、画面操作や外部効果を主張する不正なreceiptを拒否します。自動修復した場合と安全停止した場合は、Telegramの結果本文に分かる言葉で表示します。旧bridgeからの結果は移行中も受理しますが、自動修復済みとは表示しません。

## 外部操作との境界

投稿、メール送信、決済、返金、納品、送金などは、この下書き用Safety Gateから直接実行しません。将来それらを接続する場合も、対象・内容・費用を本人が確認し、専用adapterが実行し、provider readbackとreceiptを保存できた時だけ完了です。結果が不明な操作を自動再試行してはいけません。

ブラウザが必要な処理は[`automation-browser-screen-takeover-prevention.ja.md`](automation-browser-screen-takeover-prevention.ja.md)のBrowser Execution Brokerへ分離します。headless失敗から可視ブラウザへ自動fallbackしません。

## 検証

~~~bash
cd apps/rockstar_ibot
npm run test:doraemon-runtime
~~~

テストは、policyをJob側から弱められないこと、画面・browser・外部効果が禁止されること、安全な再試行が2回で止まること、認証・CAPTCHA・外部効果不明を再試行しないこと、CoreがSafety receiptを検証することを固定します。

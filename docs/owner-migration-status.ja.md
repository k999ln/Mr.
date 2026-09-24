# Kai 所有環境への移行状況

**更新:** 2026-09-05 01:58 JST

## 確認済み

| 項目 | Kai側の値 | 状態 |
|---|---|---|
| Operator | Kai | 確認済み |
| Canonical GitHub owner | `k999ln` | ユーザーが明示選択。GitHub connectorでADMIN権限をreadback |
| GitHub connector login | `k999ln` | private正本へのADMIN権限を確認済み |
| Local `gh` CLI login | `noellesugar99` | `gh api user`とrepository `viewerPermission=WRITE`をreadback。pushは可能、Actions設定変更は不可 |
| GitHub repository | `k999ln/Mr.` | private正本。末尾の`.`を含み、clone URLが`Mr..git`になるのは正常 |
| Rockstar_ibot One Hub | `life-manager-one-hub.kirin-999.chatgpt.site` | Kai所有・owner-only・Sites version 6 |
| Telegram account | Kai所有 | `@avocadominibot`の`getMe`、Railway Webhook、pending 0を確認済み |
| Railway | `Noelle Rowland`運用アカウント | `avocadomini-production` / `avocadomini-core`を確認済み |
| Supabase | organization `Kai Mr` | `avocadomini-production` / ref `lxeglicrzrwazbhhstws`、必要migration適用済み |
| SNS / mail account | Kaiが所有済み（ユーザー申告） | 公開handle、送信domain、provider連携は未確認 |

## 現在残っている確認

- `@avocadominibot`のtoken rotation後のWebhook readback
- サイト選択からTelegram実送信、Codex結果までのmessage ID
- GitHub Actionsをowner `k999ln`で有効化し、Railway/Vercel専用tokenをencrypted secretへ保存
- メール機能を公開する場合の送信用mail address / reply domain / Resend domain検証
- 有料機能を公開する場合のStripe secret・Webhook・実決済E2E
- SNSの正確な公開handleとprovider integration
- 暗号資産機能を使う場合だけ、Kai所有wallet

`k999ln`はcanonical owner、GitHub connectorはそのADMIN接続である。ローカル`gh`とChromeは共同作業用`noellesugar99`でWRITE権限を持つ。この2つを同一アカウントと誤記しない。`origin`は正しい`k999ln/Mr.`を向き、CLIからmainへpushできる。

## 置換した現行境界

- 公開owner情報は `config/owner-public.json` に集約。
- Telegramは固定共通botを廃止し、設置者自身のbotを接続。
- GitHub issue/PR自動化は `LM_GITHUB_REPOSITORY` がなければ停止。
- feedback databaseは旧Railway projectへfallbackしない。
- mail、Gmail、reply domain、iOS API URLは未設定時に停止。
- x402 worker / monitor / inflow recorderはKai所有walletを明示しない限り停止。
- local workerのdefault capabilityは `runtime.noop` のみ。
- 旧運営者前提の自律runtimeは隔離解除まで`install.sh`からdaemon有効化できない。
- Kaiについて未確認の法人名、売上、公開repository、公開botを資金調達資料から削除。

## 書き換えない履歴

過去のPR、tx、公開記事、納品、deploymentのreceiptは、その時点の所有者を示す履歴である。これをKai名義へ書き換えると証拠が偽になるため、現行設定からは隔離しつつ原文を保持する。隔離範囲は `config/legacy-owner-quarantine.json` を正本とする。

## 現在の方向性

`project.md` の Core + One Hub + Service Cells を継続する。avocadominiでは、サイトとTelegramの10種類、1〜3選択、永続Job、Mac Codex bridgeを現行導線とし、実機message IDと継続deployのreceiptを次の完了条件にする。

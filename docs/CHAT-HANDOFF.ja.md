# 新しいチャット用・最初に読む引き継ぎ

**更新:** 2026-09-05 03:59 JST

Kaiが新しいチャットを開いたとき、過去の会話を読み直さず再開するための入口です。正本は末尾にピリオドを含むprivate repository [`k999ln/Mr.`](https://github.com/k999ln/Mr.) の`main`です。clone URLが`Mr..git`になるのは正常です。`vvvv`と旧Rockstar系は履歴であり、修正・secret流用・deployに使いません。

## 最初に読む順番

1. `AGENTS.md`
2. `project.md`
3. `config/owner-public.json`
4. `docs/owner-account-registry.ja.md`
5. `docs/operations-change-log.ja.md`
6. このファイル

確定済みの接続をKaiへ聞き直しません。ローカルCLIの有無と、MCP・ブラウザ・クラウド側の接続有無を混同しません。

## 現在の確定状態

| 対象 | receipt |
|---|---|
| GitHub | 本番Botの案内・障害回復commit `23f35bb54672d58ed14a36dc759eba8dc563b2c0`。Vercel互換route commit `c531537578e7b2de0ee77ba54b7a6e2d78aa57c0`。これより後の台帳・検査だけのcommitではCore再deploy不要 |
| 正式サイト | 公開中はCodex Sites `avocadomini` version 44、deployment `appgdep_6a9ae892d7008191b7b81d274d002787`。Safety Gate表示を含むversion 45は保存済み・未公開 |
| Vercel互換URL | project `doraos`、deployment `dpl_7Fi9paNUQbT8D1LFaFJADp8ZYsz7` READY。`/start?tools=...`をquery保持で正式サイトへHTTP 307 |
| Railway Core | project `avocadomini-production`、service `avocadomini-core`、deployment `f7728c7a-0993-4b24-be89-33dd4318b244` SUCCESS、Railway health gate `/health`、HTTP 200、build `23f35bb54672d58ed14a36dc759eba8dc563b2c0` |
| Supabase | organization `Kai Mr`、project `avocadomini-production`、ref `lxeglicrzrwazbhhstws`。入口、1〜3選択、Codex Job、道具Job、API cost ledgerを適用済み。Job table HTTP 200、必要RPC 5/5を再確認。匿名・通常userは遮断、service roleのみ許可 |
| Telegram | `@avocadominibot`。WebhookはRailway `/telegram`、pending update 0、last errorなし。`start/home/tools/jobs/today/help`と説明文を公式APIでreadback済み |
| Mac bridge | launchd `ai.k999ln.mr-codex-telegram-bridge` running、PIDあり、error log 0 byte。Keychain共有鍵あり |
| テスト | サイト4/4、Doraemon/Codex/Safety Gate 54/54（最新source）、直前本番の実HTTP/障害回復23/23、ブラウザ安全性62/62、Commerce 125/125、OSS/互換route 14/14、全`apps/rockstar_ibot npm test`終了コード0 |

## 実装済みの利用者体験

1. サイトで10種類から1〜3種類を選ぶ。1個でもよく、4個目は選べない。
2. 選択済みの人はBotで再選択・再同意を挟まず総合司令室へ入る。
3. Botから直接来た人は、仕事内容別おすすめか10種類一覧から選ぶ。
4. 道具別ルームまたは総合司令室へ普通の文章で依頼する。
5. 受付、処理中、要確認、結果、失敗を区別して表示する。
6. 結果から修正、完了、道具変更、今日やることへ進める。
7. ボタンを見失っても、`/home`、`/tools`、`/jobs`、`/today`、`/help`で同じ最新状態へ戻れる。

Core起動時に、WebhookとBotの本人確認に加えて、avocadomini用のコマンド一覧・説明文も照合し、違う場合だけ更新してreadbackする。

結果の文章を作るJobは、利用者ごとに分離されたSupabase queueと、空の一時folderで動くMac上のCodexを使います。一般利用者のJobは読み取り専用で、Mr.の作業tree、secret、他人のJobへ触れません。公開・外部送信・決済・返金・権限変更・送金を自動実行しません。

10個の道具と総合司令室にはCore所有のSafety Gateが共通で入り、画面・browser・GUI・外部効果を禁止します。timeout、rate limit、502–504、一時的network障害だけを新しい隔離実行で最大2回まで再試行し、認証、CAPTCHA、2FA、権限不足、容量不足、原因不明、外部効果不明は自動再試行せず安全停止します。bridgeのSafety receiptをCoreが再検証し、自動修復または安全停止をTelegram結果へ表示します。正本は[`avocadomini-safety-gate.ja.md`](avocadomini-safety-gate.ja.md)です。

## 秘密値

実値はGitHubへ置きません。保管場所は[`owner-account-registry.ja.md`](owner-account-registry.ja.md)に確定済みです。設定済みの値をKaiへ再提出させません。

## 残作業

次の3項目が終わるまで、「全機能が無欠」「すべての外部操作が完成」「本番完全版」とは言いません。

1. BotFatherで`@avocadominibot`のtokenを安全のためrotateし、Railwayへ値を表示せず差し替えて再deployする。
2. サイトの1〜3選択deep linkからTelegram `/start`を実送信し、選択反映、自然文Job、Codex結果のTelegram message IDを取得する。
3. GitHub pushだけでCoreとVercel互換URLを更新するため、Railway/Vercelのproject専用tokenを作成し、GitHub Actions secrets `RAILWAY_TOKEN`、`VERCEL_TOKEN`へ暗号化保存する。両サービスのGitHub Appがprivate `Mr.`へアクセスできないため、現在の公開版はCLIからdeploy済み。

GitHub Actionsのworkflowは配置済みだが、現在のローカルCLI・Chromeアカウント`noellesugar99`はMr.へwriteのみでadminではない。手動dispatchしたrunはjobを作らずqueuedのままで、最新mainへのpushもrunを作成しなかった。GitHub connector側のowner `k999ln`はadminとreadback済みだが、connectorにはActions設定変更APIがない。Actionsを有効化する設定だけは、`k999ln`でGitHubへログインした画面から一度確認する必要がある。

上記1〜3は、永続tokenの作成・失効とTelegram上の実送信を含むため、ブラウザ操作直前にKaiの明示確認を一度だけ取る。それ以外の接続監査や説明を繰り返さない。

Kai専用の`/codex`コマンドまで有効にする場合だけ、Kaiの個人chat IDをRailway `LM_CODEX_ALLOWED_CHAT_IDS`へ追加する。一般利用者の10種類Jobには不要。

## 完了判定

完了は、GitHub SHA、Sites/Vercel/Railway deployment ID、Core health 200とbuild SHA、Supabase migration readback、Telegram `getWebhookInfo`、Telegram実送信message ID、サイト選択反映、Codex結果message IDで判定します。modelの文章や「クリックしたつもり」はreceiptにしません。

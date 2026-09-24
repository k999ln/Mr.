# avocadomini 外部サービス接続台帳

**最終確認:** 2026-09-05 01:58 JST

**対象:** Kai / avocadomini

**正本:** [GitHub `k999ln/Mr.`](https://github.com/k999ln/Mr.) の `main`

## この台帳の目的

新しいチャットで同じ質問を繰り返さないための正本です。ここで「確定」としたアカウント、project、URL、秘密値の保管先は前提として扱い、状態が変わる操作の直前だけ公式readbackを行います。

Token、API key、password、Webhook secret、個人chat IDなどの実値はGitHubへ保存しません。GitHubには、変数名、保管場所、設定済みか、外部サービスが返したreceiptだけを保存します。

## 現在のアカウント・プロジェクト

| サービス | どのアカウントか | 対象 | 秘密値の保管先 | 現在の状態 |
|---|---|---|---|---|
| GitHub | owner `k999ln`。GitHub connectorはadmin。ローカルCLI・Chromeは`noellesugar99`でwrite | private repository `k999ln/Mr.`、branch `main`。clone URLは`https://github.com/k999ln/Mr..git` | GitHub connectorと端末の認証保管領域 | **正本確定**。CLIからpush可。ただし`noellesugar99`はadminではなくrepository Actions設定を変更できない。`vvvv`は修正・push・deployに使わない |
| Codex Sites | 現在接続中のKai/Codexアカウント。connectorでowner確認済み | project `appgprj_6a95c35f945c8191a2620a20be9e7bf5`、`avocadomini`、version 44、deployment `appgdep_6a9ae892d7008191b7b81d274d002787`、[正式サイト](https://effect-os-verified.kirin-999.chatgpt.site/start) | 現在の入口は秘密値不要。追加する場合はSites secret設定 | **確定**。公開成功、`/start` HTTP 200 |
| Vercel | 個人account `noellelovessugar-7908` | project `doraos` (`prj_6wzteHyxCBahc6ZwG24AEm0kDg0Q`)、deployment `dpl_7Fi9paNUQbT8D1LFaFJADp8ZYsz7`、[互換URL](https://doraos.vercel.app/start) | VercelのSecretとGitHub Actions secret。専用`VERCEL_TOKEN`は未作成 | **確定**。全path/queryを正式SitesへHTTP 307で転送。Vercel GitHub Appはprivate `Mr.`をまだ読めない |
| Railway | 運用account `Noelle Rowland` | project `avocadomini-production` (`334bb7a0-5431-4863-b6b3-9793b6063c3a`)、environment `production`、service `avocadomini-core` (`24a32c29-82c6-40a3-a723-42a92d14a14d`)、[Core](https://avocadomini-core-production.up.railway.app) | serviceのRailway Variables | **確定**。deployment `f7728c7a-0993-4b24-be89-33dd4318b244` SUCCESS、health gate `/health`、HTTP 200、build `23f35bb54672d58ed14a36dc759eba8dc563b2c0` |
| Supabase | organization `Kai Mr` | project `avocadomini-production`、ref `lxeglicrzrwazbhhstws`、Tokyo | Supabase API Keys。Core用server keyはRailway `SUPABASE_SERVICE_ROLE_KEY` | **確定**。入口、1〜3選択、Codex Job、道具Job、API cost ledger migrationを適用。Job table HTTP 200、必要RPC 5/5、権限をreadback済み |
| Telegram customer Bot / BotFather | KaiのTelegram account | `@avocadominibot`、Webhook `https://avocadomini-core-production.up.railway.app/telegram` | BotFatherのtokenはcustomer Railway serviceの`LM_TELEGRAM_BOT_TOKEN` | **Webhook・公開案内確定**。`getMe`成功、pending update 0、last errorなし、6コマンドと説明文一致。安全のためtoken rotationと実送信E2Eが残る |
| Telegram owner Bot / BotFather | KaiのTelegram account | `@Rockstar_ibot`をKai専用owner control planeとする | 独立owner serviceの`LM_TELEGRAM_BOT_TOKEN`。customer serviceと共有しない | **owner決定・Git履歴あり、live未確認**。`getMe`、Webhook、Kai allowlist、owner command、実送受信receiptが残る |
| Mac上のCodex bridge | Kaiが現在使っているMac / Codex login | launchd `ai.k999ln.mr-codex-telegram-bridge`、CoreのJob queue | 共有鍵はMac Keychain service `com.k999ln.mr.codex-telegram-bridge`とRailway `LM_CODEX_BRIDGE_TOKEN` | **確定**。launchd running、error log 0 byte、Keychain参照あり |
| Resend | Kai所有accountは未確認 | メール送信元domainも未確認 | Railway `RESEND_API_KEY`、`LM_MAIL_FROM`、`LM_REPLY_DOMAIN` | **未接続**。現在のTelegram下書き導線には不要 |
| Stripe | 管理accountは未確認 | 公開Payment Linkは[`config/owner-public.json`](../config/owner-public.json)に記録 | Railway `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`。Payment Linkは公開値 | **公開Linkのみ確認**。無料導線と下書き作成には不要。実決済のE2Eは未確認 |

## 公開面の正本

- 正式なサイトはCodex Sitesの`https://effect-os-verified.kirin-999.chatgpt.site`。
- `https://doraos.vercel.app`は古いbookmarkを壊さないための転送専用。アプリ、データベース、Bot secretを二重に持たない。
- 裏側のサーバーはRailwayの`https://avocadomini-core-production.up.railway.app`。
- 顧客へ案内する公開Telegram Botは`@avocadominibot`。
- `@Rockstar_ibot`はKai専用の運営Botで、顧客入口として公開しない。公式readback完了までは未接続として扱う。

## 秘密値の置き場所

| 目的 | 変数・参照名 | 置き場所 | 状態 |
|---|---|---|---|
| Customer Telegram Bot | `LM_TELEGRAM_BOT_TOKEN` | customer Railway service Variables | 設定済み。rotation予定 |
| Customer Webhook保護 | `LM_TELEGRAM_WEBHOOK_SECRET` | customer Railway service Variables | 設定済み |
| Owner Telegram Bot | `LM_TELEGRAM_BOT_TOKEN` | 独立owner service Variables | 未確認。customer tokenを流用しない |
| Owner Webhook保護 | `LM_TELEGRAM_WEBHOOK_SECRET` | 独立owner service Variables | 未確認。customer secretを流用しない |
| Supabase接続 | `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | Railway Variables | 設定済み |
| Core URL / build | `LM_PUBLIC_URL`、`LM_BUILD_SHA` | Railway Variables | 設定済み |
| Telegram→Codex bridge | `LM_CODEX_BRIDGE_ENABLED`、`LM_CODEX_BRIDGE_TOKEN` | Railway Variables | 有効・設定済み |
| bridge共有鍵のMac側 | Keychain service `com.k999ln.mr.codex-telegram-bridge` | macOS Keychain | 設定済み |
| Kai専用`/codex` | `LM_CODEX_ALLOWED_CHAT_IDS` | Railway Variables | **未設定**。一般利用者の道具Jobには不要 |
| Vercel自動deploy | `VERCEL_TOKEN` | Vercelで専用tokenを作りGitHub Actions secretへ暗号化保存 | **未作成** |
| Railway自動deploy | `RAILWAY_TOKEN` | Railwayでproject専用tokenを作りGitHub Actions secretへ暗号化保存 | **未作成**。GitHub Appのprivate repo接続権限がないため必要 |
| メール | `RESEND_API_KEY`、`LM_MAIL_FROM`、`LM_REPLY_DOMAIN` | Railway Variables | 未設定 |
| 決済 | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`LM_STRIPE_PAYMENT_LINK` | Railway Variables | secretの公式確認未完了 |

ローカルの`.env.local`と`.vercel/`はGitから除外済みです。現在の`.env.local`は短時間だけ有効なVercel CLI session用で、恒久的な秘密値の正本にはしません。repositoryへcommitしません。

## 現在の利用者向け範囲

- サイトまたはTelegramで、10種類から無料で1〜3種類を選べる。必ず3種類ではない。
- サイトで選択済みなら、Botで再選択・再同意を求めず総合司令室へ入る。
- Telegramへ直接来た人は仕事内容別おすすめ、または10種類一覧から選べる。
- 道具別ルームまたは総合司令室へ普通の文章を送ると、永続Jobへ1回だけ登録され、MacのCodexが隔離された読み取り専用環境で下書き・確認結果を作る。
- 結果は修正、完了、今日やることへつながる。別利用者のJob操作、11件目/時、重複messageは拒否する。
- 公開、外部送信、決済、返金、権限付与、送金は、provider接続・本人承認・公式receiptが揃うまで実行済みと表示しない。

## 次のチャットで聞き直さないこと

GitHub、Codex Sites、Vercel、Railway、Supabase、Telegram Webhook、Mac bridgeは存在確認済みです。「どのアカウントですか」「CLIがないので接続もないですか」「`Mr..git`は壊れていますか」とKaiへ聞き直しません。公式readbackが台帳と食い違った場合だけ、安全側に停止して差分を一度に説明します。

残っている利用者操作は[`docs/CHAT-HANDOFF.ja.md`](CHAT-HANDOFF.ja.md)の「残作業」だけです。外部状態を変更したら、秘密値を除いたreceiptを[`docs/operations-change-log.ja.md`](operations-change-log.ja.md)へ追記します。

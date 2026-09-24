# Rockstar_ibotへ独自Telegram Botを接続する

**最終更新:** 2026-09-05
**現在の方式:** `byob_single`（1 deployment = 1所有者 = 1 BotFather bot）。Kai運営では2 Botを2 deploymentへ分離する。

Kai環境は、顧客向け`@avocadominibot`とKai専用owner Bot `@Rockstar_ibot`の2 Botを正とする。現在公式に接続を確認できているのは`@avocadominibot`で、`@Rockstar_ibot`の現行token、Webhook、allowlist、owner command、実送受信receiptは未確認である。旧運営者のtokenや`vvvv`の設定は履歴であり、どちらの接続にも流用しない。現在の公開導線は、販売の仕事を10種類から1〜3種類選び、総合司令室または道具別ルームから下書きを依頼する`@avocadominibot`専用である。

Rockstar_ibotは、リポジトリに固定された共通Botへ接続しない。導入者が自分のTelegramアカウントで作ったBotを、その導入環境だけへ接続する。Bot token、Webhook secret、業務callback secretは公開API、HTML、receipt、Gitへ出さない。

## 現在できること

- 独自Botのtokenを非表示promptで受け取る
- Telegram `getMe`でBot IDとusernameを検証する
- 32-byte乱数からWebhook用secretと業務callback用secretを別々に生成する
- private env fileを`0600`でatomic保存する
- avocadomini用のcommand menuとdescription／short descriptionを登録する
- 既存Webhookを検出し、明示許可なしには別URLから奪わない
- `<LM_PUBLIC_URL>/telegram`をWebhookとして登録し、URLと`allowed_updates`をreadbackする
- 起動時にもtoken identity、Webhook、command menu、description、short descriptionを再確認し、差分だけを自動修復する
- 検証済みBotだけをPanelと`/api/public/telegram`へ公開する

現在は、1つのNode processへ複数Botのtokenを格納する方式ではない。Kaiの2 Botはcustomer serviceとowner serviceを別deploymentにし、この手順を別々のprivate envと公開HTTPS originに対して行う。owner Botはavocadomini用command menuをそのまま登録せず、owner command profileの実装とKai allowlistが完成するまでliveにしない。

## 接続手順

### 1. BotFatherでBotを作る

1. Telegramで[`@BotFather`](https://t.me/BotFather)を開く。
2. `/newbot`を送る。
3. 表示名を決める。
4. 5〜32文字で末尾が`bot`のusernameを決める。
5. 発行されたtokenをpasswordとして扱い、chat、issue、Git、screenshotへ貼らない。

Botは電話番号付きの別ユーザーアカウントではない。利用者本人のTelegramアカウントからBotFatherを使って登録する。

### 2. Rockstar_ibotを公開HTTPSへ配置する

Webhookを受けるoriginを用意する。例：

```text
https://life.example
```

path、query、fragment、Basic認証付きURLは受け付けない。`http://localhost:8788`だけではTelegramから到達できないため、公開HTTPS deploymentまたは自分で管理するHTTPS tunnelが必要になる。

### 3. 接続commandを実行する

repository rootで次を実行する。

```bash
npm run telegram:configure -- \
  --public-url https://life.example \
  --register
```

token入力は画面へ表示されない。既定では`deploy/local/.env`へ次を保存する。

```text
LM_TELEGRAM_MODE=byob_single
LM_TELEGRAM_BOT_TOKEN=<secret>
LM_TELEGRAM_BOT_USERNAME=<getMeで検証したusername>
LM_TELEGRAM_WEBHOOK_SECRET=<secret>
LM_LATE_APPROVAL_CALLBACK_SECRET=<別secret>
LM_PUBLIC_URL=https://life.example
LM_PANEL_BASE_URL=https://life.example
NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME=<公開可能なusername>
```

静的Web画面とAPIが別originなら、API側に次も設定する。

```text
LM_WEB_ORIGIN=https://web.life.example
```

既存のprivate fileを指定する場合：

```bash
npm run telegram:configure -- \
  --env-file /absolute/private/path/rockstar_ibot.env \
  --public-url https://life.example \
  --register
```

保存済みtokenで再検証する場合：

```bash
npm run telegram:configure -- --reuse-token --register
```

### 4. 既存Webhookがある場合だけ移管を判断する

対象Botが別サービスのWebhookを使っていれば、commandは何も上書きせず停止する。専用Botを新しく作るのが安全である。意図的に既存サービスから移管する場合だけ、現在のWebhook URLを確認してから実行する。

```bash
npm run telegram:configure -- \
  --reuse-token \
  --register \
  --replace-existing-webhook
```

このflagは旧サービスを停止させ得るため、自動では付与しない。`drop_pending_updates`も自動指定しない。

### 5. cloud secretへ登録する

Railwayなどへ配置する場合、private env fileをcommitせず、上記の`LM_*`値をdeployment providerのsecret variablesへ直接登録する。`NEXT_PUBLIC_LM_TELEGRAM_BOT_USERNAME`だけは公開usernameであり、Landing／Hubのbuild-time変数として使える。tokenと2種類のsecretはclient buildへ渡さない。

Telegram workflowは現行Coreのuser dataを読むため、APIには`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`も必要である。

### 6. 動作確認する

1. APIを起動または再deployする。
2. logで`webhook self-heal`が`registered`または`already-registered`になり、期待した`bot=@username`と`profile=current`または`profile=updated`が表示されることを確認する。
3. `GET https://life.example/api/public/telegram`を開く。
4. `configured: true`、正しい`botUsername`、正しい`launchUrl`を確認する。応答にtokenやsecretは含まれない。
5. 利用者本人がBotを開き、`/start`を送る。
6. サイトから来た場合は、選んだ1〜3種類が再同意・再選択なしで総合司令室へ出ることを確認する。
7. 直接来た場合は、仕事内容別おすすめまたは10種類一覧から1〜3種類を保存できることを確認する。
8. `/home`、`/tools`、`/jobs`、`/today`、`/help`が同じ最新状態を開くことを確認する。
9. 普通の文章を送り、受付番号、Codex結果、修正、完了まで実機確認する。

Botは利用者へ先に個別会話を開始できないため、各利用者が最初にBotを開いてメッセージを送る必要がある。

## 失敗時の見方

| 表示 | 意味 | 対処 |
|---|---|---|
| `no bot token in env` | token未設定 | cloud secretまたはprivate envを確認 |
| `configured bot username does not match token` | tokenとusernameが別Bot | BotFatherの対象Botとenvを照合 |
| `no valid HTTPS LM_PUBLIC_URL...` | 公開originなし／形式不正 | pathなしHTTPS originを設定 |
| `WEBHOOK_TAKEOVER_CONFIRMATION_REQUIRED` | 別Webhookが使用中 | 専用Botを作るか、移管を明示判断 |
| `/api/public/telegram`が`configured:false` | 起動時検証未完了／失敗 | self-heal logとTelegram API到達性を確認 |
| Botが返信しない | Webhook未到達、secret不一致、data plane不足など | provider log、Webhook readback、Supabase envを順に確認 |

token漏洩が疑われる場合はBotFatherでtokenを失効・再発行し、deployment secretを更新して再登録する。

## 3,000人へ広げるときの境界

現方式の安全な単位は「1 deploymentに1 Bot」である。Kaiのowner/customer分離は2 deploymentへ各1 Botを接続する。同じcustomer Botを3,000人が利用することはできるが、3,000人が各自のBotを1つの共有processへ接続する機能はまだ実装していない。

共有multi-bot SaaSへ進む前に、少なくとも次が必要になる。

- tenant別のBot installation registryとsecret vault
- 推測困難なBot別Webhook route
- identityを`installation_id + chat_id`で分離するbinding table
- `(installation_id, update_id)`単位の重複排除
- Mini App `initData`を接続元Bot tokenで検証するselector
- Bot別outbound queue、Telegram `retry_after`対応、jitter付きWebhook controller
- Bot AからBot Bのtenant、chat、sessionを操作できないcross-bot test

この境界が完成するまでは、process-global tokenへ複数Botを詰め込まない。

## 公式根拠

- [Telegram Bot Features](https://core.telegram.org/bots/features) — BotFatherの`/newbot`、username規則、deep link仕様。核心: “5-32 characters long”かつ末尾が`bot`。
- [Telegram Bot Tutorial](https://core.telegram.org/bots/tutorial) — tokenの取得・失効・秘密管理。核心: “Treat this token like a password”。
- [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook) — HTTPS URL、`secret_token` header、`allowed_updates`の公式contract。
- [Telegram Bots: An introduction for developers](https://core.telegram.org/bots) — Botは利用者との会話を自分から開始できないという初回導線の制約。
- [Telegram Mini Apps — validating data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) — serverが`initData`を利用前に検証する公式手順。

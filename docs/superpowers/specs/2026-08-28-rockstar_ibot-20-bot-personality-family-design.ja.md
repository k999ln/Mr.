# Rockstar_ibot Single Bot / 20 Profile Family 設計

**状態:** single-gateway package実装済み、メイン`@Rockstar_ibot`のtoken交換済み、公開channel`MrBot`（`@RockstarMrBot`）作成済み、Bot接続・channel管理者付与は未実施、`@EntpSparkBot`は未接続・廃止待ち
**所有者:** Kai
**日付:** 2026-08-28

## 1. 目的

Kai所有の`@Rockstar_ibot`一体へ、16種類の会話・判断スタイルと4種類の実務profileを内蔵する。公開Telegram Bot、token、deploymentはそれぞれ一つだけとし、全profileはRockstar_ibot Core、Proof Vault、Money Lens、Life Guardの非交渉境界を共有する。

人格packageは権限packageではない。話し方、説明順、問いの粒度、意思決定支援の見せ方だけを変え、外部操作、送金、公開、医療判断、利益保証などの権限を増やさない。

## 2. 20 internal profiles

### 16 personality-style profiles

`ENTP`、`ENTJ`、`ENFP`、`ENFJ`、`ESTP`、`ESTJ`、`ESFP`、`ESFJ`、`INTP`、`INTJ`、`INFP`、`INFJ`、`ISTP`、`ISTJ`、`ISFP`、`ISFJ`を、利用者が選択・上書きできる会話styleとして提供する。

これは医療・心理診断ではなく、雇用、教育、住居、融資、保険、医療、法務、支援適格性の判断に使わない。「あなたはこの人格だ」と固定せず、本人同意のあるself-reflection結果として扱い、いつでも変更できる。

### 4 operating-role profiles

| Bot | 役割 | 禁止境界 |
|---|---|---|
| `Mr. Bot` | 全体の整理と次の一手 | 無承認の外部実行をしない |
| `BotMother` | 必需品配給のrequest intake | 受益者へ現金・cash-like instrumentを渡さない |
| `Baby` | 稼ぐworkflowの提案・追跡 | 利益保証、無承認応募、決済をしない |
| `Life Guard` | safety、proof、権限確認 | 医療診断、高影響適格性判断をしない |

### メイン入口

`Mr. Bot`（`@Rockstar_ibot`）を唯一の公開Telegram Botとする。分類されていない相談はすべて`Mr. Bot`が受け、目的、制約、権限、必要な証拠を整理してから、本人確認を挟んで16 styleまたは3 operating-role profileへの内部切替を提案する。専門profileの結果はmain profileへ戻し、全体の次の一手を決める。

```text
User → @Rockstar_ibot / Mr. Bot (public gateway)
          ├── 16 personality-style internal profiles
          ├── BotMother profile (必需品・配給)
          ├── Baby profile (稼ぐworkflow)
          └── Life Guard profile (安全・証拠)
                    ↓
              main profileへ結果を戻す
```

専門profileは`Mr. Bot`の権限を拡張せず、内部切替を理由に外部操作を自動承認しない。

## 3. 配置

現行runtimeは`byob_single`を使う。`@Rockstar_ibot`の交換済みtoken一つだけを外部vaultから一つのdeploymentへ渡し、20 profileは同じprocess内のprompt・policy overlayとして選択する。profileごとのTelegram token、BotFather account、Webhookは作成しない。

```text
Kai Telegram account
  ├── public channel: MrBot (@RockstarMrBot)
  └── @Rockstar_ibot ── one external vault token ── one byob_single deployment
                                                      ├── Mr. Bot main profile
                                                      ├── 16 style profiles
                                                      ├── BotMother profile
                                                      ├── Baby profile
                                                      └── Life Guard profile
```

複数Bot tokenを受ける`shared_registry`は不要であり、有効化しない。profile切替は同一ユーザー会話内の状態として保持し、profile変更で権限・credential・外部効果を増やさない。

### Telegram command surface

| Command | 内部動作 |
|---|---|
| `/main` | `Mr. Bot` main profileへ戻す |
| `/style` | 16 style一覧を表示する |
| `/style entp`など | 本人が選んだstyleを保存する |
| `/mother` | `BotMother` profileへ切り替える |
| `/baby` | `Baby` profileへ切り替える |
| `/guard` | `Life Guard` profileへ切り替える |

選択値は`lm_users.lm_bot_profile_id`へ保存する。DB制約は20 profile IDだけを許可し、この列を診断、権限、適格性判断へ流用しない。

## 4. 作成順序

1. screenshotへ露出した`@Rockstar_ibot` tokenを交換し、旧tokenを無効化する。
2. `@EntpSparkBot`は接続せず、Kaiの削除確定後にBotFatherで廃止する。
3. package catalogとsingle-gateway deployment planを検証する。
4. 交換済みtokenはchatやGitへ転記せず、Mr. Bot専用vaultへ直接保存する。
5. `getMe`で`@Rockstar_ibot`をreadbackする。
6. HTTPS/Webhookを一つ接続し、`/start`、main profile、reply、receiptを確認する。
7. 16 styleと3 specialist roleへの内部切替・main復帰をテストする。

Botを作成しただけでは中身は動かない。`@Rockstar_ibot`一体の作成receiptと、一つのdeploymentの接続receiptを別に扱う。

## 5. 完了条件

- catalogが正確に20 package（16 style＋4 role）を含む。
- 公開usernameが`@Rockstar_ibot`一つだけで、他19 profileに公開usernameがない。
- catalog、plan、Git、log、screenshotにtokenを含めない。
- style分類が本人同意を要求し、非診断・上書き可能を返す。
- deploymentが`byob_single`一つだけで、credential vault referenceも一つだけである。
- `@Rockstar_ibot`はBotFather receipt、`getMe`、Webhook readbackが揃った場合だけ接続済みと表示する。

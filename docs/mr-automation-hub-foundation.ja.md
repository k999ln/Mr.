# Mr. Automation Hub — サービス基盤

設計決定: 2026-09-05 JST。Kaiの今回の依頼を、以後のサービス化の優先仕様とする。

Mr.のコード資産を、自動化ツールを管理するハブとして整理する。利用者はWeb、インストール型Webアプリ、専用のローカル実行環境から利用する。自分の仕事の収益は利用者に帰属し、運営は基本利用料8.88 USDを毎月受け取る。既存のavocadomini顧客BotとRockstar_ibot内部識別子は互換性のため維持する。

## 今回できたもの

| 要素 | 実装範囲 | まだ含まないもの |
|---|---|---|
| Webハブ | 15件のツール在庫、検索、開発元・実装状態の絞り込み、必要な準備と費用の表示 | 全ツールの自動接続・実行 |
| ココナラ提案準備 | 入力条件から決定論的に提案文・納品チェックを作成、コピー、テキスト出力 | AI生成、案件収集、応募、外部送信、受注保証 |
| ツール追加 | 認証した利用者の仕事一覧へ導入確認を永続保存 | その場での任意コードinstall・権限付与 |
| 共通カタログ | 内製と外部を同じmanifestで表現、WebとNodeの出力一致検査 | 外部publisherの自己申告による実行許可 |
| アプリ | Web App Manifestと対応ブラウザのインストール導線 | 署名済みmacOS/Windowsアプリ、App Store公開 |
| OS実行基盤 | Node CLI、loopback認証API、ネットワーク無効Docker構成 | 起動可能ISO、OS自動更新、GUI shell、Webとのremote pairing |
| 8.88 USD/月 | 整数888 cents・USD・月次・売上分配0%の共通契約、利用権状態の判定 | Stripe商品・checkout・Webhookとの新プラン接続、実際の請求 |
| 既存ワークスペース | 最新Sitesのタスク、収支、Service Cell、添付、接続管理、配給申請、export・削除を保全して`/life`へ配置 | TelegramとWebの同一人物自動結合、実際の配給・調達 |
| 運営設計資料 | `/owner`の機能状態・未完了事項・証拠の資料と、ログインした本人のHub集計を保持 | Kai専用のrole・allowlistによるアクセス制御 |

ツール在庫の「接続・移植が必要」は、現利用者のcredentialを検査した状態ではない。ソースが存在し、Hubから使うために接続・移植・検証が必要という意味である。10個の顧客向け道具、6枠のService Cell、15件の今回の管理在庫は異なる分類であり、件数を合計して完成済み機能数にはしない。

## 中心にする構造

```text
Web / インストール型Webアプリ / OSの操作画面
                 │
           Automation Hub
     ツール在庫・選択・仕事・原価・実行結果
                 │
        共通アカウント / 実行API（段階接続）
       ┌─────────┼─────────┐
  内製の純粋処理   専用ローカルrunner   外部API/MCP adapter
       │                │                  │
  下書き・検証       利用者の端末          利用者の接続先
       └─────────┴─────────┘
           artifact / receipt / usage

Telegram → 依頼・通知・確認・承認の補助入口
```

最初のOSは既存Linux等に載せる専用作業環境として進める。カーネルを新規開発することは初期範囲に含めない。OS専用ロジックを増やさず、共通ツールと同じ実行契約を使う。今回のapplianceは下書き専用で、PCの操作、外部network、AI推論を実行しない。

## 残す設計と移植する資産

- Core / Hub / Service Cellsの責務分離を維持する。
- `integrations/ai-tools/`の配布manifest、権限overlay、固定version、運営digest審査を外部ツールの入口として残す。
- `runtime/`の永続queue、lease、effect fence、再試行、receiptを、外部操作を有効化する時の実行基盤として使う。
- 既存Hubの認証、owner境界、Idempotency-Key、削除fence、export・削除を再利用する。導入候補は既存の仕事データなのでexport・削除にも含まれる。
- 最新Sites v19に存在した接続管理、運営設計資料、配給申請、データ制御、関連するテストとmigrationを保全する。従来の生活・仕事画面は`/life`へ移し、運営設計資料の`/owner`も維持する。
- `skills/earn/gig/scripts/provider_adapter.py`の実行意図とreceipt契約、`deliverable_verifier.py`の納品検証、`daily_gig_report.py`と`coconala_outcomes.py`の実績集計を段階移植する。
- 旧所有者のブラウザprofile、`$HOME/gig`、過去の承認設定は利用者の設定に持ち込まない。`config/legacy-owner-quarantine.json`は維持する。

既存コードを自動的に実行対象へ昇格しない。従来のココナラ応募・見積送信・正式納品スクリプトは実在するが、今回のローカルrunnerのallowlistには含めない。

`/life`はCoreのTelegram、予定、メール、決済、音声、AI、Maps、SNS、業者向け銀行処理、browserの接続状態を読む既存経路を保持する。各接続の設定と公式応答が揃う前に「連携済み」と扱わない。配給は非換金・非譲渡の申請と人による審査を前提とし、枠の自動承認や実調達の完成を意味しない。配給関連の`0008`、Core identity linkの`0009`、schemaとmigration journalも保全対象であり、ソースを戻しただけで本番databaseへの新規適用を完了したことにはしない。

`/owner`というURLや画面名だけでは所有者専用の権限にならない。現在確認できるアクセス条件は通常のChatGPT認証で、表示するHub集計はログインした本人のデータである。Kai限定のrole・allowlist判定は未実装のため、このページは運営設計資料として扱い、専用の管理権限を実装済みとは表示しない。ここで保持する利用者別データ境界と、運営者だけへ権限を与える仕組みは別である。

## ツールの追加・更新

内部の管理在庫は`packages/automation-hub/catalog.json`を正本とする。`version`は在庫契約の版であり、外部packageの実体の版やdigestの代替にはしない。

各ツールにid、名称、origin、version、status、sourcePaths、permissions、costModel、surfaces、requirements、nextActionを持たせる。`surfaces`は将来も含む対象入口であり、現在実行できる入口はstatusと実装で判断する。

追加の流れは「導入確認 → 配布物・権限・費用の審査 → version/digest固定 → 利用者ごとの接続とgrant → 隔離実行試験 → 実行可能へ昇格」。Webフォームは導入確認だけを保存する。第三者packageは既存`npm run ai-tools:scaffold`、`ai-tools:validate`、`ai-tools:catalog`を使い、任意URLを実行しない。

Webへは`npm run hub:sync`で共通coreを生成領域へコピーし、`npm run hub:check`とテストで一致を保証する。Webプロジェクトだけでbuild可能な配置にする。生成ファイルを直接編集しない。

## 収益と料金

基本プランの正本は`packages/automation-hub/index.mjs`の`servicePlan`。

| 項目 | 決定 |
|---|---|
| 基本利用料 | 8.88 USD / month、888 cents |
| 呼び名 | 電気代プラン。実費の電力量請求ではなくサービス基本利用料 |
| 利用者売上の取り分 | 0% |
| AI、外部有料ツール | 基本料金とは分離。利用前の価格・上限表示と同意が必要 |
| 端末側の実電気代・通信費 | 利用者負担。8.88ドルに含めない |
| 基本料に無制限計算を含めるか | 含めない。運営提供の計算枠は原価実測後に確定 |
| 課金稼働 | false。既存Stripe Linkを8.88ドル商品とみなさない |
| 未確定 | 税表示、解約・返金条件、容量・実行上限、販売地域、決済providerの所有readback |

運営粗利 = 8.88 USD − 決済費用 − 運営負担の計算/保管費 − support費。利用者利益 = 確認済み売上 − marketplace手数料 − 制作/外部ツール費 − 基本料等。別通貨の値を為替根拠なしに加減しない。Webの既存収支欄は手入力の記録であり、入金確認済み売上や請求履歴ではない。

初期の実行は無料の下書き機能として提供し、商品・請求が接続されるまでは有料会員と表示しない。旧無料3道具・Stars・単品Cell課金の実装は互換として残し、新しい月額契約へ暗黙に移さない。

最新Sitesから保全したStripeの接続状態表示、既存Payment Link、Coreの課金経路も従来商品のための資産であり、新しい8.88 USD/月プランとは別である。既存接続が応答しても、新プランの商品・月次請求・利用権・解約が接続済みになったとは判断しない。

月額接続の実装順: provider側でUSD/month/888をreadback → 認証済みaccountにcheckout sessionを結合 → 署名Webhookをdurable inboxへ保存 → subscriptionとinvoiceを公式APIで再確認 → entitlementへ反映 → 解約・未払い・返金・順不同eventをテスト。成功ページやclientの状態だけで利用権を与えない。

`subscriptionAccess`は信頼済みサーバー状態の純粋な判定であり、決済検証APIではない。24時間未満に確認されたactiveかつ期間内の対象planだけを許可し、不明・失効・期限切れ・古い確認を拒否する。現オフラインツールの実行を有料化しない。

## Telegramの役割

顧客Bot `@avocadominibot`は短い依頼、進捗通知、成果物確認。運営Bot `@Rockstar_ibot`は承認、停止、異常確認。1 deployment = 1 Botは維持する。WebとTelegramの本人紐付けが完成するまで自動同期を表示しない。

Telegramアプリ内のデジタル商品・サービス販売はStarsを使うという公式制約がある。8.88 USDのWeb月額プランをBotのドル建て請求や固定Stars換算として実装しない。Telegram内購入を提供する場合は独立した価格・決済設計が必要。[Telegram公式](https://core.telegram.org/bots/payments-stars)（2026-09-05 JST確認）

ココナラ側の取引、連絡、決済、顧客データの利用条件は、その業務機能を有効化する前に確認する。今回の下書き機能は取引先サイトへのアクセスを行わない。[ココナラ ルールとマナー](https://coconala.com/pages/guide_rule)（2026-09-05 JST確認）

## 次の段階

1. 今回のWeb・下書き・導入候補保存を試して、初期利用者の主な仕事を決める。
2. WebとCoreのcanonical account、device pairing、利用者別credential vaultを接続する。
3. ココナラの見積・納品確認adapterを1件ずつ移植し、許可範囲・停止・結果確認を実証する。
4. Stripe等の月額契約と請求履歴を接続し、8.88ドルでの原価とsupport負荷を確認する。
5. 署名済みデスクトップ配布・OSイメージ・更新/rollbackを追加する。

今回のbaseは一般利用者向けの全自動収益サービス完成や3,000人対応の証明ではない。公開先は既存のSitesアクセス範囲を引き継ぐため、新版の公開は別途確認する。

## 開発と検証

```bash
npm run hub:sync
npm run test:automation-hub
node services/automation-runner/cli.mjs draft < services/automation-runner/example.json
cd apps/rockstar_ibot-hub
npm ci --ignore-scripts
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Node 22.13以上を使用する。既存Core全体を起動せず、外部credentialなしで下書きを検証できる。Docker daemonがない環境ではComposeの構成検証までとし、image実行成功とは扱わない。

初回基盤実装時の検証結果: 共通core・manifest同期・入力検査・runner API/CLIの19テスト成功。Webの型検査、lint、production build成功。標準のローカルログインを使い、カタログ取得、料金、未認証と偽造headerの拒否、cross-origin拒否、導入候補の保存/再取得、同一操作の重複防止、既存`/life`の応答を確認した。作成したテスト候補は削除・再確認済み。ブラウザの操作・見た目のテスト、実Stripe決済、OS image実行は未実施。

最新Sitesの機能保全後、共通基盤19件とSite内11件の合計30テスト、型検査・lint・production buildが成功。ローカルHTTPによる認証・保存・冪等性・既存workspace確認も再実行して成功した。CIにもSiteの`npm test`（`app/lib/*.test.mjs`）を追加し、接続clientの実行境界、配給policy、storage healthを継続検証する。これらのテスト結果は、外部providerの実接続、実配給、実決済のreceiptとは区別する。

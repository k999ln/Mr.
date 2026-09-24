# Rockstar_ibot — 現行実行順

SSOT は `project.md`。この文書は Kai 所有環境へ移行した後の実装順だけを定義する。

## 0. Ownership gate

- `config/owner-public.json` を公開設定の基準にする。
- 旧所有者の bot、domain、email、SNS、wallet、repository URL を実行時既定値から除く。
- 秘密値がない capability は fail closed にする。
- GitHub repository と各外部アカウントは Kai 所有で作成する。

## 1. Baseline

- Core DB、identity、policy、job、receipt の schema を固定する。
- One Hub から接続状態と不足設定が確認できるようにする。
- `owner:check` と回帰テストを CI の gate にする。

## 2. Telegram entrypoint

- BotFather で Kai の bot を作成する。
- BYOB single-bot として token / username / owner chat id / webhook secret を設定する。
- `/start`、pairing、webhook、再起動後の self-heal を receipt 付きで検証する。

## 3. Gateway and mobile

- 公開 Core URL を Kai 所有の hosting に作る。
- iOS と Hub は環境別 URL を使い、未設定 URL へ通信しない。
- auth、rate limit、audit log、revocation を検証する。

## 4. First three Service Cells

1. ask / reminder
2. mail triage / reply draft
3. travel / leave-by

各 Cell は capability 宣言、権限、dry-run、approval、execution、receipt を同じ contract で実装する。

## 5. Operations

- health、queue、stale lock、retry、dead-letter を Hub に表示する。
- 実行結果は message id、HTTP status、provider id 等で確認する。
- Telegram、email、SNS、決済、wallet は Kai 所有の接続先だけを使う。

## 6. Procurement funding, vendor delivery, and pilot

- 支援資金を受ける場合は Kai 所有accountを使い、受益者へのpayoutではなく承認済み注文の検証済み業者へだけ支払う。
- 必要性と本人同意の確認、人間・提携団体の承認、vendor verification、購入・発送・受領receiptを別々に実装する。
- Stripe等を使う場合はKai所有accountで資金受領・会計・webhookを構成し、受益者への現金・暗号資産・現金同等物の送金レールにはしない。
- 銀行振込は廃止せず、承認済みvendor調達、事業支払い、顧客返金に限定する。旧recipient watcherは再開しない。
- pilot は単一の支援requestで開始し、実受領receiptと事故率を確認してから権限分離した複数requestへ広げる。

## Stop rule

所有確認できない接続、秘密不足、宛先不明、receipt 不成立のいずれかがあれば外部作用を停止する。旧所有者の値で継続しない。

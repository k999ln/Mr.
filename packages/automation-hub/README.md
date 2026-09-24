# Mr. Automation Hub shared core

Web・デスクトップ・OS用Runnerで共有する、依存パッケージ不要のESMです。Node.js 22.12以降、またはJSON import attributesを扱うブラウザー用ビルドで使います。

```js
import { tools, servicePlan, buildCoconalaDraft } from './index.mjs';

const draft = buildCoconalaDraft({
  title: '商品紹介ページの作成',
  requirements: '支給された文章と写真を使う\nスマートフォンに対応する',
  deliverables: ['確認用ページ', 'HTML・CSSファイル'],
  deadline: '資料受領後、合意した日程で確定',
  price: '30,000円（税の扱いは要確認）',
});
```

`buildCoconalaDraft`だけがこのパッケージで実行できる業務ツールです。決定論的テンプレートで、APIキー不要、ネット通信・保存・外部送信・応募・納品・決済なし。出力はプレーンテキストとして表示し、HTMLやコマンドとして解釈しません。未入力は確認用placeholderにし、実績・受注・利益を作りません。本人が原価や条件を確認してから利用します。

入力は全項目省略可。`title`は160文字、`requirements`と`deliverables`は各8,000文字・40行/項目、`deadline`は200文字、`price`は100文字。要件と成果物は文字列配列も可。価格の数値は非負・有限で、通貨を補いません。不明field・不正型・制御文字・上限超過は`TypeError`です。

`catalog.json`は15件の初期在庫で、網羅一覧や実接続の証明ではありません。

- `runnable_local`: この新基盤から端末内で実行できる下書き作成。
- `sign_in_required`: ログインすると利用できる既存Web Hub機能。収支台帳は`/life#money`、仕事管理は`/life#work`で、同じChatGPT認証とユーザー別D1保存を使います。
- `connection_required`: 既存実装はあるが、新基盤への本人確認付き接続・環境移行が必要。
- `catalog_only`: 商品/機能の定義や部分実装のみで、実行器または必要な制御が未完成。

`origin`は組み込み機能か外部provider連携かを示します。`version`はHub在庫契約の版で、既存コードや外部providerの製品版ではありません。`surfaces`は接続対象となる入口であり、その入口から現在実行できるという意味ではありません。`permissions`は必要となる権限の表示であり、利用者への権限付与ではありません。既存コードや履歴にある他人の接続先・実績を新しい既定値へ流用しません。

外部ツールは既存の`integrations/ai-tools/`の`server.json` + `rockstar_ibot-tool.json`検証とdigest審査を使います。このHubのmanifestを追加してもinstall・任意コード実行・認証情報取得は起きません。将来の実行にはユーザー別の許可、隔離環境、資格情報仲介、送信先制限、失効確認、証拠が必要です。

月額は`servicePlan`に整数`888`（8.88 USD）、毎月、売上分配率`0`として定義しています。名称の「電気代」はサービスの月額料金案です。API・外部ツールの無制限利用や利益を保証しません。`billingLive: false`で、決済provider・継続課金・返金・税処理は未接続です。既存のPayment LinkやStars購入を、この新プランの支払いとして解釈しません。

`subscriptionAccess(state, now)`は将来の認証済みbackendが使う純粋なpolicyです。プラン一致、active、未失効、期間内、24時間未満の照合結果だけを許可します。時刻はUTC ISO（末尾Z）かepochミリ秒。古い・不明・未来の照合・失効済み状態は拒否します。期間末取消予定でも現在の有効期間内は利用可。provider署名・tenant所有権の確認そのものは未実装で、この関数へブラウザー保存値やユーザー申告値を渡して有料権限を与えてはいけません。現在の無料オフライン下書きには課金判定を使いません。

検証はリポジトリルートで`node --test test/automation-hub*.test.mjs`を実行します。

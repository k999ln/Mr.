# Rockstar_ibot iOS

Rockstar_ibotのiPhone向けネイティブSwiftUIクライアントです。WebViewではありません。オンボーディング後の主画面は、仕様書どおり1本の時系列チャットです。下部タブ、カレンダーグリッド、日程タイムライン、端末内の経路計算はありません。

## 現在実装されている画面と境界

- Google Calendar接続のネイティブ開始画面と`ASWebAuthenticationSession`境界
- 名前・通常の出発地点・表示言語の設定
- 電話番号の追加またはスキップ。スキップ時は電話を無効のまま維持
- 5つの解析終端状態: `route_ready`、`needs_information`、`no_upcoming_event`、`route_unavailable`、`failed`
- 安定したメッセージIDを重複排除する時系列チャット
- バックエンドに未回答の質問がある場合だけ表示される返信欄
- 経路カードと、同じ経路データだけを読む詳細シート
- 無料経路を塞がないソフトペイウォール
- Calendar、プロフィール、言語、電話、購入、ログアウト、削除をまとめた設定シート
- チャット上部のグリッドボタンから開くネイティブ`Life Hub / Command Center`シート。主画面を置き換えるBottom Tabではありません
- Todayのタスク追加・完了、Body/Mind/Energyの1〜5チェックインとメモ
- JPY・USD・EUR・GBPをそれぞれ正しい小数桁で分離集計するMoney台帳
- Work Queueへの追加・完了
- 6つのService Cellの内容選択、Preview接続、`queued`受付。consumer、成果物、外部receiptは未接続で、完了とは表示しません
- Hub・Core・計画中を区別するConnectionsと、Preview操作・queued受付を確認するProof/Audit
- Webと同じ生成済みAI tool catalog。形式検証、提供元確認、`catalog_only`、effectを分離表示し、package codeは実行しません
- オフライン、読み込み、APIエラーの表示
- Access/Refresh token用Keychainストア
- `/api/mobile/v1`用の型付きAPIクライアント、Bearer認証、refresh rotation、mutationの`Idempotency-Key`
- 英語・日本語の画面コピーとString Catalog
- 画面配色と揃えたホーム画面用App Icon（編集元は`AppIconSource.svg`）

DebugとReleaseは、どちらも画面確認用Previewモードです。画面上部に常に`PREVIEW DATA`と表示し、実際のCalendar接続、電話、購入、削除を行いません。本番mobile APIは未配備のため、API base URLも予約済み`.invalid`ドメインに固定し、旧所有者のdomainへ通信しません。型付き実APIクライアントは実装済みですが、配備・schema凍結・tenant検証・receipt確認が完了するまで選択しません。

`Life Hub`領域は未配備APIへ成功したように見せないため、DebugとReleaseの両方で常に明示的なメモリ内Previewを使用します。Previewの入力は現在のアプリ起動中だけ保持され、再起動で消えます。`OperatingServicing`と`LiveOperatingService`、`/api/mobile/v1/operating/*`の型付きendpointは用意済みですが、配備・schema凍結・tenant検証が済むまでRelease環境へ配線しません。

## Xcodeで開く

1. [RockstarIbot.xcodeproj](./RockstarIbot.xcodeproj)をXcodeで開きます。
2. Schemeで`RockstarIbot`を選びます。
3. 実行先で`iPhone 16`などのSimulatorを選びます。
4. `Product > Run`または`⌘R`を実行します。

コマンドから開く場合:

```bash
cd apps/rockstar_ibot-ios
open RockstarIbot.xcodeproj
```

実機で起動する場合は、Xcodeの`RockstarIbot` target → `Signing & Capabilities`で自分のTeamを選択してください。現在の`invalid.rockstaribot.*`は、旧所有者のidentifierへ誤署名しないための明示的な未設定値です。利用者のBundle IDはこのリポジトリから決められないため、自動確定しません。配布前に`project.yml`のアプリ、unit-test、UI-testの3つの`PRODUCT_BUNDLE_IDENTIFIER`を自分が管理する一意なID群へ変更し、`xcodegen generate`でprojectを再生成してください。OAuthバックエンド側にも同じアプリ識別子と`rockstaribot` callback schemeを登録します。署名情報や証明書はリポジトリへ保存しません。

## ビルドとテスト

```bash
cd apps/rockstar_ibot-ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild test \
  -project RockstarIbot.xcodeproj \
  -scheme RockstarIbot \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

Simulator buildだけを確認する場合:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild build \
  -project RockstarIbot.xcodeproj \
  -scheme RockstarIbot \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  CODE_SIGNING_ALLOWED=NO
```

現在の自動検証は、24件のunit testに加えて1件のXCUITestを含みます。unit testは5つの解析終端状態、routeのnullable事実、認証・冪等性境界、Operating endpoint contract、4通貨minor unit、日付検証、Service Cellの`queued`限定、Hub/Core/計画中の分離、AI tool catalogの`schema_valid`・`catalog_only`境界、Previewが旧所有者domainを参照しない境界、Releaseでも未配備Life HubをPreviewに保つ境界を検証します。XCUITestはPreviewデータだけを使い、Calendar接続境界、プロフィール、電話スキップ、解析、ソフトペイウォール、チャット、経路詳細、設定、Life Hub、metadata-only package表示、Todayへのタスク追加までをSimulator上で操作します。実サービスへの書き込みは行いません。

## Xcode projectの再生成

プロジェクト定義は`project.yml`です。XcodeGenを使って再生成できます。

```bash
brew install xcodegen
cd apps/rockstar_ibot-ios
xcodegen generate
```

## 設定

- `RockstarIbot/Config/Debug.xcconfig`: Previewモード
- `RockstarIbot/Config/Release.xcconfig`: Previewモード（本番mobile API未配備のためfail-safe）
- API base URL: `https://mobile-api-not-configured.invalid`
- Mobile API prefix: `/api/mobile/v1`
- Life Hub API contract（未配備）: `/api/mobile/v1/operating/snapshot`、`tasks`、`checkin`、`money`、`service-cells`
- OAuth callback scheme: `rockstaribot`

`xcconfig`には公開可能なURLとschemeだけを置きます。API key、OAuth secret、access token、refresh tokenは埋め込みません。トークンは端末のKeychainへ`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`で保存します。

実APIへ切り替えるのは、利用者が所有するHTTPS API origin、`/api/mobile/v1`の配備、tenant認証、schema、削除、receiptを検証した後だけです。その時点で利用者固有のxcconfigにURLを設定し、`LM_PREVIEW_MODE = NO`へ変更します。

## まだ本番完了ではないもの

- 実際の`/api/mobile/v1`配備と最終レスポンスschemaへの同期。特にLife Hubは現在常時Preview
- production APNs登録・通知deep link・TestFlight実機receipt
- StoreKit購入と復元
- 実Google OAuth、実Calendar event、実route providerを使ったE2E
- App Store署名、privacy metadataの最終監査、提出

Previewの動作は本番完了の証拠ではありません。本番経路、電話、購入、削除、Service Cell成果物は必ずサーバーのreceiptで検証します。`queued`は受付であり、実行・品質確認・納品の完了を意味しません。

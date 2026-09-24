# Mr. ローカル Automation Runner

OS・デスクトップから共通の道具を使うための最小実行ソフトです。Node.js 22以上だけで動き、追加ライブラリ・アカウント・API keyを必要としないココナラ向け提案文の下書きを1件作れます。入力した条件を組み立てるテンプレート処理で、AIモデルの呼び出しやココナラへの接続はありません。

共通カタログ・月額8.88 USDの計画値・下書き処理は [`packages/automation-hub`](../../packages/automation-hub/) をWebと共有します。表示価格は課金の実装・販売開始を意味しません。

## まず使う

リポジトリのルートで実行します。

```sh
node services/automation-runner/cli.mjs tools
node services/automation-runner/cli.mjs draft < services/automation-runner/example.json
node --test services/automation-runner/test/*.test.mjs
```

引数を省略した場合と`--stdio`も`draft`と同じです。標準入力からJSONを1つ読み、標準出力へ`proposal`（提案文）、`checklist`（確認項目）、`warnings`（不足条件）を返して終了します。内容を確認してから利用者自身が提出します。案件取得、出品、応募、納品、売上回収は行いません。

入力例は [`example.json`](example.json) を編集して使えます。`title`、`requirements`、`deliverables`、`deadline`、`price`の5項目以外は拒否し、最大64 KiBです。各項目の型と文字数は共通モジュールで検証します。入力・成果物・秘密値をrunner側のファイルやlogへ保存しません。標準出力の保存と保持期間は呼び出し側が管理します。

## デスクトップソフトから呼ぶAPI

端末内で動くソフト用に、HTTPモードも用意しています。API全体（`/health`を含む）に起動セッションごとのBearer tokenが必要です。`MR_RUNNER_TOKEN`は32 random bytesを64桁hexにした値を、端末のlauncherから環境変数で渡します。CLI引数やWebアプリへ入れません。runnerはtokenの値を表示しません。

手動で試す場合は次のコマンドで、値を画面やshell historyに出さずに生成してforeground起動します。

```sh
set +x
export MR_RUNNER_TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
node services/automation-runner/cli.mjs serve
```

`set +x`でshellの展開値を表示するtraceを止めてから生成します。Ctrl-Cでrunnerを停止します。APIを呼ぶローカルソフトには同じ起動セッションの環境変数からtokenを渡し、起動し直すときに新しく生成します。調べるためにtokenを表示・共有する必要はありません。

| 呼び出し | 結果 |
|---|---|
| `GET /health` | runnerの起動状態と`local_draft_only` |
| `GET /v1/tools` | 共通の道具カタログとサービス料金計画 |
| `POST /v1/drafts/coconala` | JSONの入力条件から下書き・確認項目・注意点を作成 |

初期アドレスは`http://127.0.0.1:8888`。`MR_RUNNER_HOST`は`127.0.0.1`か`::1`だけ、`MR_RUNNER_PORT`は使用するポート番号です。LANやインターネット用のアドレスでは起動しません。実際にbindしたアドレスとポートに一致する`Host`を必須にし、別originからのブラウザ要求、`null` origin、認証なしを拒否します。CORS許可設定はありません。公開Web HubからこのAPIへ直接接続する機能は未実装です。

受付は固定の3経路だけで、外部package、任意コマンド、shell、ファイル操作、既存の自律daemonを起動する経路はありません。HTTP本文64 KiB、header8 KiB、10秒の通信timeoutを設け、内部stack traceや入力内容をerrorへ返しません。

## OS・アプリの完成に向けた境界

このrunnerはOS上で動くソフトであり、独自kernel、起動ISO、OS installer、署名済みGUIアプリではありません。[Docker版のOS基盤](../../deploy/automation-os/README.md)はネットワークを無効にした単発の下書きworkerです。

次に必要なのは、署名済みデスクトップ配布、端末とWebの本人確認付きpairing、失効可能な端末credential、ユーザー別queueと成果物、許可された外部ツールの隔離実行、更新とrollbackです。現在のHTTP tokenをpublic Webへコピーしたり、portを公開したりして代替しません。既存Telegramは任意の受付・通知面として共通Coreへつなぐ設計を維持し、このrunnerからは接続しません。

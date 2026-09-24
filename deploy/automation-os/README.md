# Mr. Automation OS — appliance基盤

既存Linux・Docker上で使う、オフラインの自動化workerの配布基盤です。独自OSのkernelや起動ISO、installerを生成するものではありません。まず共有の道具カタログとココナラ提案文の下書きをOS側へ持ち込める状態を作っています。

## 1件動かす

リポジトリのルートでDocker Composeを使用します。imageの取得・build時はネットワークを使いますが、完成したworkerの実行時は`network_mode: none`です。

```sh
docker compose -f deploy/automation-os/compose.yaml build
docker compose -f deploy/automation-os/compose.yaml run --rm -T runner tools
docker compose -f deploy/automation-os/compose.yaml run --rm -T runner draft < services/automation-runner/example.json
```

JSONを標準入力で受け取り、結果を標準出力へ返して終了します。常駐起動、起動時daemon登録、systemdやlaunchdへの書き込みはありません。機密情報をimageへ含めず、入力ファイルのmountも不要です。Dockerfile専用のignore設定でbuild対象を共通モジュールとrunnerの5ファイルだけに限定します。

## 配布境界

- Node 22のnon-rootユーザーで実行し、root filesystemを読み取り専用にします。
- Linux capabilityをすべて除去し、権限昇格を拒否します。
- network、公開port、host directory、Docker socketのmountを使いません。
- 1 workerはメモリ128 MiB、CPU0.5、最大64 processです。再起動を繰り返しません。
- 外部ツール、任意shell、provider credential、Telegram、課金は含めません。

Docker containerにはHTTP portを公開しません。端末内のHTTP APIが必要なデスクトップ開発では、[runnerの手順](../../services/automation-runner/README.md)に従いNodeをOS上で直接実行し、認証付きの`127.0.0.1`に限定します。この区別により、containerからhostのネットワークやファイルを共有せずに基盤を検証できます。

現在のNode image tagは開発用です。一般配布前に検証済みimage digest、SBOM、署名、脆弱性検査、段階更新とrollbackを追加します。外部の自動化ツールは既存manifest審査を通したうえで、別の権限・credential・network制限を持つ実行環境へ配置する必要があります。ここへpackageをcopyするだけでは実行されません。

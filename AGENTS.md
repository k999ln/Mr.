# AGENTS.md — Rockstar_ibot / Kai workspace

このリポジトリの現行所有者・運用者は Kai。対話は原則として日本語で行う。

## 修正先の正本（最優先）

- 今後のコード修正、バグ修正、Web、Telegram、デプロイ関連の作業は、必ずこのMrリポジトリ（`https://github.com/k999ln/Mr.`）を正本として行う。
- 作業ブランチを使う場合も、完了前にMrの`main`へ統合し、Mrのリモートへpushする。
- `https://github.com/k999ln/vvvv`は旧作業先・履歴であり、今後の修正先、push先、既定値、デプロイ先として使用しない。
- 他の資料に`vvvv`が残っていても、このルールを優先し、Mrの現在のコードと設定を確認する。

## 最初に読むもの

1. `project.md` — 現行プロダクト設計の SSOT
2. `config/owner-public.json` — 公開してよい所有者・リンクの SSOT
3. `docs/owner-account-registry.ja.md` — アカウント、project、秘密値の保管先、現在のreceiptをまとめた引き継ぎ台帳
4. `docs/owner-account-intake.ja.md` — 外部アカウントの準備状況
5. `docs/owner-tools-setup.ja.md` — 認証・設定手順

## 所有権境界

- GitHub の確認済み所有先は `k999ln`。
- Rockstar_ibot One Hub の確認済み所有先は `life-manager-one-hub.kirin-999.chatgpt.site`。既存の外部URLは移行完了まで互換識別子として保持する。
- Telegram、独自ドメイン、公開メール、SNS、Stripe、ウォレットは、Kai の所有確認が完了するまで未設定として扱う。
- `config/owner-public.json`にない旧所有者の repository、domain、bot、email、SNS、wallet は履歴資料であり、現行の送信先・収益先・既定値として使用しない。
- 未設定値を他人の値で補完しない。安全側に停止し、必要な環境変数名と作成手順を示す。

## 実行ルール

- 外部送信、公開、決済、送金、アカウント作成は、Kai 所有の接続先であることを確認してから行う。
- 秘密値はリポジトリや公開設定に保存しない。`.env`、OS Keychain、各サービスの Secret Store を使う。
- 外部サービスのアカウント、プロジェクト、データベース、環境変数、公開URL、ドメイン、Webhook、デプロイなどの状態を変更したら、必ず`docs/operations-change-log.ja.md`へ日本時間の日時、対象、変更内容、receipt、未完了事項を追記する。可能な限り外部変更と台帳更新を同じコミットに含め、Mrの`main`へpushする。
- 変更履歴にはToken、API key、Webhook secret、パスワードなどの値を書かず、環境変数名と設定状態だけを書く。過去の別所有者に属するRockstar系credentialや`vvvv`の値は、現在の`Rockstar_ibot`と名前が似ていてもavocadominiへ流用しない。
- 完了は HTTP 応答、API 応答、tx hash、message id、deployment id などの receipt で確認する。
- 破壊的操作や不可逆な公開は、対象を読み取り確認してから行う。
- macOS の `launchctl` 変更は必ず `bin/launchctl-safe` を通す。exit 75 の場合は停止し、`docs/runbooks/launchd-control-plane-recovery.md` に従う。
- 定期自動化のbrowser、desktop app、GUI操作は画面を奪わないheadlessを既定とする。headed sessionでの`Page.bringToFront`、可視Chrome、Computer Use等を無承認の定期処理から起動しない。可視操作が不可避な場合は、Kaiの明示判断後に`bin/lm-screen approve`と`bin/lm-screen run`を使い、最大900秒の単発handoffとして実行する。
- 作業ツリー内の既存差分はユーザーのものとして保持し、無関係な変更を巻き戻さない。

## README・Gitの毎時同期

- 正式なREADME名は`README.md`とする。会話で`README.me`と指定された場合も、明示的に別ファイルを求められていない限り`README.md`を指すものとして扱う。
- `.github/workflows/hourly-readme-sync.yml`を毎時実行し、`README.md`内の`hourly-repository-sync`生成領域を更新してMrの`main`へcommit・pushする。
- 自動処理が変更・stage・commitしてよいのは`README.md`だけとし、予期しない差分、non-fast-forward、認証不足ではforce pushせず安全側に停止する。
- 製品仕様、公開URL、実装済み／未実装、運用状態が変わった場合は、毎時欄に任せず、その変更と同じcommitでREADME本文を更新する。毎時処理は本文の事実を自動生成しない。
- 毎時更新の完了はGitHub Actions run URLとpush後のcommit SHAで確認する。失敗runを成功扱いにしない。

## 設計原則

- Core、One Hub、Service Cells の責務分離は `project.md` に従う。
- Telegram runtimeは1 deploymentにつき1つのBotFather botを接続する`byob_single`を既定とする。Kaiの運営topologyは、owner-only `@Rockstar_ibot`とcustomer-facing `@avocadominibot`の2 Botを別deploymentで動かす。2つのtokenを同じprocess-global envへ格納しない。
- 外部プロバイダーは adapter と capability で扱い、資格情報がなければ fail closed にする。
- 履歴資料にある旧所有者固有値を再利用する場合は、Kai 所有の新しい値へ明示的に置換する。

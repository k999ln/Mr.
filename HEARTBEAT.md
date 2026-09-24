# HEARTBEAT.md

定期処理は「状態確認と安全な復旧」だけを既定とし、未確認の外部作用を起こさない。

## Pre-flight

1. `config/owner-public.json` と対象サービスの環境変数を確認する。
2. `npm --prefix apps/rockstar_ibot run owner:check` を実行する。
3. 必須値が未設定、旧所有者の値、または所有確認不能なら、その capability を停止する。
4. 秘密値やトークンの内容はログへ出さない。

## Runtime checks

1. Core、Hub、各 Cell の health を確認する。
2. 実行中ジョブの進捗・重複・stale lock を確認する。
3. 失敗は再現可能なログと次の安全な操作を残す。
4. 復旧後は HTTP 応答、deployment id、message id 等の receipt を記録する。

## External effects

- Telegram: Kai の BotFather token と owner chat id がそろった場合だけ送信する。
- Email/SNS: Kai 所有の送信元と宛先が明示された場合だけ送信する。
- Billing/Wallet: Kai 所有の Stripe またはウォレットが明示され、金額・ネットワーク・宛先を検証できる場合だけ実行する。
- 未設定時に旧 bot、旧ドメイン、旧メール、旧 SNS、旧ウォレットへフォールバックしない。

## Reporting

heartbeat は実行結果、失敗理由、receipt、次の手動作業だけを報告する。売上・稼働・公開状態を receipt なしで推定しない。

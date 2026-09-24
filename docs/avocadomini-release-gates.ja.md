# avocadomini 利用者journeyと本番release gate

**版:** 2026-09-05

**対象:** avocadominiのサイト、Telegram Bot、Codex Job

## 誰の何を解決するか

| 利用者 | 最初の困りごと | 必要な入口 | 成功状態 |
|---|---|---|---|
| やりたい仕事が具体的な人 | 何をどう頼むか整える手間が大きい | サイトで1〜3種類を選び、同じ選択のままBotへ入る | 普通の文章から確認可能な下書きが届く |
| 道具名が分からない人 | 10種類のどれを選ぶか判断できない | Telegramで仕事内容を選び、おすすめを編集する | 役割・入力・出力・例を理解して依頼できる |
| 継続利用者 | 前回の状態と結果を見失う | `/start`または「今日やること」から復元 | 受付、処理中、要確認、結果、失敗を区別して再開できる |

## 完成journey

```text
目的と材料を普通の文章で送る
  → Telegram messageを一度だけ受理
  → 利用者と選択道具を再検証
  → 永続queueへ登録
  → Macの隔離されたCodexが読み取り専用で処理
  → Telegramへ結果を実送信
  → message IDをreceiptとして保存
  → 修正 / 完了 / 道具変更 / 今日やること
```

## 絶対に破ってはいけない条件

- 別chat・別利用者の選択、Job、結果を読まない・変更しない。
- 同じTelegram updateを再送されてもJobを二重作成しない。
- 1利用者あたり1時間10件を超える新規Jobを受けない。
- Telegramへの結果message IDがないJobを「届いた」「完了」としない。
- 外部送信、公開、決済、返金、権限付与、送金を下書きJobから実行しない。
- 接続されていないproviderを「成功」と表示しない。
- site選択者へ再選択・再同意を求めない。
- 直接Botへ来た人をsiteへ追い返さず、Bot内で1〜3種類を選べるようにする。
- ボタンを見失っても`/home`、`/tools`、`/jobs`、`/today`、`/help`から同じ状態へ戻れるようにする。
- BotFatherの公開コマンド・説明をCore起動時に照合し、差分があればreadback付きで自動修復する。
- 4種類目、0種類保存、不明なtool ID、64 bytes超のcallbackを拒否する。
- secret、個人ID、別人の旧環境値をGitHub、Job結果、logへ出さない。

## 出荷判定

| gate | 合格条件 | 2026-09-05 01:58 JST |
|---|---|---|
| コード | focused testと全回帰が0 failure | 合格 |
| Site | 10種類、1〜3制限、deep link、誇大表示なし | 合格。version 44 |
| Core | Railway health gate通過、deployment SUCCESS、health 200、build SHA | 合格。receiptは接続台帳参照 |
| Database | 必要table/RPC、RLS、anon遮断、service role許可 | 合格 |
| Webhook | 正しいBot・URL・secret・pending errorなし | 合格 |
| Mac bridge | launchd running、token認証、queue到達 | 合格 |
| Telegram案内 | 現行avocadominiの6コマンドと説明を自動同期 | **合格**。`start/home/tools/jobs/today/help`、description、short description一致 |
| 実利用者E2E | site選択→`/start`→自然文Job→Codex結果message ID | **未実施** |
| token衛生 | Bot token rotation後にWebhook再確認 | **未実施** |
| GitHub継続deploy | private repoからRailway/Vercelを自動deployできる | workflow実装・検査済み。暗号化deploy tokenの設定待ち |

「すべての人の全要望」や「絶対にバグ0」は検証可能な条件ではないため約束しない。代わりに、対象利用者、実行範囲、失敗状態、receipt、回帰テストを固定し、実機E2E後にこの表を更新する。

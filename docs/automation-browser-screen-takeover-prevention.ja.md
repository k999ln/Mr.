# 自動化ブラウザの画面ジャック対策

最終確認: 2026-09-05 JST

この文書は、Mr. / avocadomini の自動化がMac上の画面や入力フォーカスを奪わないための正本方針です。定期実行から可視ブラウザを直接起動せず、通常処理は画面外で実行し、人の操作が必要な場合だけ時間制限付きで引き継ぎます。

avocadominiの10個の道具と総合司令室に組み込む共通の実行・自己修復条件は、[`avocadomini-safety-gate.ja.md`](avocadomini-safety-gate.ja.md)を正本とします。

## すぐ開く

| 入口 | 用途 | 公開範囲 |
|---|---|---|
| [avocadomini正式フロント](https://effect-os-verified.kirin-999.chatgpt.site/start) | 利用者が道具を選び、Telegramへ進む | 正式フロント |
| [Rockstar_ibot One Hub](https://life-manager-one-hub.kirin-999.chatgpt.site) | Today、Body/Mind、Money、Work、Connections、Proof | 所有者限定 |
| [Automation Control Center](https://mr-automation-control-20260904.kirin-999.chatgpt.site) | 画面影響、移行対象、停止・再開UIの確認 | 所有者限定の設計プレビュー |
| [Mr. GitHub](https://github.com/k999ln/Mr.) | コード、運用文書、変更履歴の正本 | repository権限に従う |

> Automation Control Centerの操作は現在プレビュー内だけに反映されます。実機のloop停止・再開とはまだ接続していません。

実機の画面占有制御はCLIへ接続済みです。`bin/lm-screen`が可視操作の承認、単発実行、失効、取消、監査を所有します。WebのControl CenterをこのCLIへ接続する作業はP2として未完了です。

## 結論

画面ジャックの原因はlaunchdそのものではなく、ログイン中ユーザーのLaunchAgentから可視Chrome / Chromiumを「KeepAlive」で起動していることです。再起動や接続回復のたびに新しいウィンドウが前面へ出る可能性があります。

P0では、既存の定期browser ownerをheadlessへ固定し、registry、launchd環境変数、実行時検査の3層で`screen_impact=none`を強制します。可視操作だけを`lm-screen`の単発leaseへ分離します。P1ではブラウザ起動を一つのBrowser Execution Brokerへ集約し、次の順序だけを許可します。

1. 「remote_headless」: Railway private network上のSteelを標準にする
2. 「local_headless」: オフライン時など、許可された処理だけの限定fallback
3. 「interactive_handoff」: 人の明示承認後、最長15分だけ可視化する

定期実行が自動的に「interactive_handoff」へ昇格してはいけません。CAPTCHA、2FA、本人確認、passkeyなどが必要になった場合は「waiting_for_human」で停止し、通知だけを送ります。

## 2026-09-05時点のsource確認結果

次の状態は変更後sourceとインストール定義から確認したものです。現在実行中かどうかを断定するlive process readbackはP0のrelease適用後に記録します。

| 経路 | 現在の実行面 | 画面影響 | 判断 |
|---|---|---|---|
| Rockstar_ibot browser jobs | Railway内Steel | なし | 維持する |
| Affiliate browser group | local persistent context、「headless=True」 | なし | 維持する |
| 「hf-gig-browser」 | isolated local Chrome、`--headless=new` | なし | release適用待ち |
| 「mr-bot-daily-driver」 | local persistent context、headless標準 | なし | 次回登録から適用 |
| 「job-search-browser」 | isolated local Chromium、`--headless=new` | なし | 次回登録から適用 |

## 2026-09-05 08:03 JSTの実機readback

- 変更前の`hf-gig-browser`はrelease `f61b89f9`から`ProcessType=Interactive`、headed Google Chrome、CDP `127.0.0.1:9223`で`loaded-running`だった
- screen-safe実装release `4240e0367ba1dfefa6b467127265da9384f89e72`を作成し、永続stop対応を含む管理release `3bd4cf55f53559554b557b025bc96d66e61cb9ce`を`~/loops/current`へ設定した
- 新releaseのactivationは、Kaiの現行方針`mode=core_only`、`autonomousRuntimeActivation=false`、legacy quarantine中であるためfail closedになった
- 旧headed ownerは`bin/lm-loop stop hf-gig-browser`と`bin/launchctl-safe disable`で停止・永続disableした
- readbackはlaunchd `disabled`、旧owner PID不在、`:9223` listener不在、CDP到達不能、`lm-screen=protected`だった
- 停止前、停止中の50ms連続sample、停止後のforeground applicationはすべて`Code`で変化しなかった

このため現在の画面占有経路は停止済みです。headless ownerを再開するのは、Kai所有adapterの再構築後にowner runtime policyとquarantineが明示的に解除された場合だけです。旧plistを直接bootstrapしてはいけません。

関連source:

- Steel経路: [apps/rockstar_ibot/lib/browser-job-runtime.js](../apps/rockstar_ibot/lib/browser-job-runtime.js)
- Steel driver: [apps/rockstar_ibot/lib/stagehand-steel-driver.js](../apps/rockstar_ibot/lib/stagehand-steel-driver.js)
- Affiliate headless owner: [skills/affiliate/scripts/local_browser.py](../skills/affiliate/scripts/local_browser.py)
- Gig browser owner: [skills/earn/gig/scripts/launch_gig_browser.sh](../skills/earn/gig/scripts/launch_gig_browser.sh)
- Mr. Bot persistent owner: [skills/browser/cdp_persistent_context.py](../skills/browser/cdp_persistent_context.py)
- Job search browser owner: [apps/job-search-loop/scripts/run-browser.sh](../apps/job-search-loop/scripts/run-browser.sh)
- Loop正本: [config/loop-registry.json](../config/loop-registry.json)

Affiliate系は[PR #1](https://github.com/k999ln/Mr./pull/1)でheadless化され、[PR #3](https://github.com/k999ln/Mr./pull/3)で初期navigation失敗時の再起動ループも対策済みです。同じ契約を残りのブラウザ経路へ広げます。

## 必須の実行契約

browserを使うすべてのloopは、「config/loop-registry.json」に次の情報を持たせます。

~~~json
{
  "browser_policy": {
    "execution_surface": "remote_headless",
    "screen_impact": "none",
    "interactive_handoff": "approval_required",
    "interactive_timeout_seconds": 900
  }
}
~~~

許可値:

- 「execution_surface」: 「remote_headless」、「local_headless」、「interactive_handoff」
- 「screen_impact」: 定期実行では「none」のみ
- 「interactive_handoff」: 「denied」または「approval_required」
- 「interactive_timeout_seconds」: 60〜900秒。省略時は900秒

守ること:

- P1完了後はloopからChrome、Chromium、CloakBrowserを直接起動せずBrokerへ要求する
- 通常の個人用Chrome profileを自動化に使わない
- 自動化ごとに分離したprofile / Steel sessionを使う
- headless失敗時に可視ブラウザへ自動fallbackしない
- visible browserを「KeepAlive」にしない
- session、profile、lease、終了理由を監査ログへ残す
- Steelのdebug URLや認証情報をログ、Git、Telegramへ保存しない

## Browser Execution Broker（P1目標）

既存の「apps/rockstar_ibot/lib/browser-job-runtime.js」を入口にし、各loopはブラウザではなく実行要求を送る設計です。P0時点では未接続で、既存のlocal ownerをheadless化して画面占有だけを先に閉じています。

~~~text
scheduled loop
    |
    v
Browser Execution Broker
    |-- remote_headless ----> Railway private Steel
    |-- local_headless -----> isolated local profile
    |
    '-- waiting_for_human --> owner notification
                                 |
                                 '-- approved interactive handoff (max 15 min)
~~~

Brokerが返す状態:

- 「queued」
- 「running」
- 「waiting_for_human」
- 「completed」
- 「failed」
- 「canceled」

### 実装済みのローカル画面制御

定期browser ownerは常にheadlessで起動します。可視操作の例外は次の順序だけを許可します。

~~~bash
bin/lm-screen status
bin/lm-screen approve <loop-id> --seconds 900
bin/lm-screen run <loop-id> -- <可視操作command>
bin/lm-screen revoke [<loop-id>]
~~~

- `approve`は60〜900秒の1回限りの承認を作る
- `run`は承認された同じloop IDだけを起動し、承認を即時消費する
- 同時に動かせる可視handoffは1つだけ
- 期限切れまたは`revoke`で子process groupを停止する
- 完了、失敗、期限切れ、取消の後は必ず`protected`へ戻る
- 監査ログはloop ID、時刻、結果だけを記録し、command、cookie、token、debug URLを記録しない
- browser ownerへの`bin/lm-loop stop`はlaunchdを永続disableしてから停止し、logout/login後の再出現も防ぐ。`start` / `restart`はowner activation gateを通過した場合だけenableする

状態と監査は`~/.local/state/rockstar_ibot/screen-control/`へowner-only permissionで保存します。テスト時だけ`LIFE_MANAGER_SCREEN_CONTROL_ROOT`で隔離先を指定できます。

P1の統合read modelで最低限保存する値:

- 「job_id」
- 「loop_id」
- 「execution_surface」
- 「session_id」
- 「screen_impact」
- 「started_at」 / 「finished_at」
- 「last_safe_point」
- 「failure_code」
- 「release_sha」

## 実装順序

### P0: 画面を奪う経路を止める

1. ✅ 「cdp_persistent_context.py」をheadless標準にし、可視化は承認済み「--interactive」だけにする
2. ✅ 「launch_gig_browser.sh」、「run-browser.sh」、Lancers browser ownerをheadless標準にする
3. ✅ 定期実行からheaded browserが到達可能なら失敗するregistry・launcher回帰テストを追加する
4. ⚠️ 新release `4240e036`は作成済み。現行owner quarantineがactivationを拒否したため、旧headed ownerを停止・永続disableしてfail closedを維持
5. ✅ 停止操作の前・50ms連続sample・後でforeground applicationが`Code`から変わらないことを実機readback

### P1: 実行を一元管理する

1. Browser Execution Brokerへlease、timeout、releaseを追加する
2. provider選択を「remote_headless」優先に固定する
3. 人が必要な失敗を「waiting_for_human」へ正規化する
4. browser sessionと「lm-loop」状態を一つのread modelへ集約する

### P2: 管理画面を実データへ接続する

利用者向け「/panel」とは分離し、所有者専用「/admin/automations」として実装します。

必要な表示:

- loop名、domain、schedule、installed / registered / running
- 実行面、headless状態、画面影響
- 最終実行、次回実行、最終成功、失敗理由
- session、release SHA、provider
- 「waiting_for_human」と残り時間

必要な操作:

- scheduleの一時停止 / 再開
- 安全地点で停止
- 一回だけ再実行
- 失敗の再試行
- 15分限定のinteractive handoff
- log / receipt / session viewerの確認

推奨API:

~~~text
GET  /api/admin/automations
GET  /api/admin/automations/:loop_id
POST /api/admin/automations/:loop_id/pause
POST /api/admin/automations/:loop_id/resume
POST /api/admin/automations/:loop_id/run
POST /api/admin/automations/:loop_id/stop-at-safe-point
POST /api/admin/automations/:loop_id/interactive-handoff
GET  /api/admin/browser-sessions
~~~

変更操作は既存の「lm-loop」制御面へ委譲し、macOS lifecycle変更は必ず「bin/launchctl-safe」を通します。Web APIから「launchctl」を直接呼びません。

## 管理画面の安全境界

- owner / operator認証を必須にする
- 読み取りと変更権限を分離する
- pause、resume、handoffをすべて監査する
- 一括停止は対象件数を表示し、再確認を要求する
- raw token、cookie、profile path、debug URLを返さない
- session viewerは認証付きproxyまたは短命な一回限りURLを使う
- UIが状態を推測せず、必ずproviderとhostのreadbackを表示する

## 完了条件

- すべての定期browser loopを10回起動してもMacのforeground applicationが変わらない
- 「headless=False」またはheadless指定なしの経路が定期実行から到達不能
- 人の承認なしに可視ウィンドウが開かない
- pause / resume / retryの結果がprovider readbackと一致する
- stale sessionがtimeout後に解放される
- 管理画面と監査ログに秘密値が出ない
- Affiliate、Gig、Mr. Bot、Job Searchの回帰テストが通る

## 運用時の確認

~~~bash
bin/lm-loop status all
bin/lm-screen status
~~~

状態変更が必要な場合は「bin/lm-loop」と「bin/launchctl-safe」を使います。直接「launchctl」を実行したり、可視ブラウザを手動で常駐登録したりしません。

異常時は「画面を開いて続行」ではなく、該当loopを止め、「waiting_for_human」、最後の安全地点、session release結果を確認してから再開します。

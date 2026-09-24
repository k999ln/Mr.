# anicca-rockstar_ibot — MAP (SSOT、 毎回 search しないための記憶)

> このファイル = 「誰が何を動かすか」の唯一の真実。 混乱したらまずここを読む。
> 更新日: 2026-06-09 (lateness-guard 統合・refactor 後)

## 結論: 新規deploymentの正本は `apps/rockstar_ibot`

この文書以下は旧ローカル構成の移行資料。新規deploymentではCoreがTelegram、
音声bridge、schedulerを所有し、このskillのTelegram/Pipecat/Sutando daemonは起動しない。

```
旧ローカル構成であなたを呼ぶ仕組み = launchd ai.anicca.lateness-heartbeat (5分毎)。
  → bash anicca-rockstar_ibot/scripts/run.sh  (純シェル/Python = ゼロ円)
  → 現行Coreへ移行するまで電話経路は無効
```

## トリガー一覧 (これが全部。 他に呼ぶものは無い)

| トリガー | 種別 | 状態 | 動かすもの | コスト |
|---|---|---|---|---|
| `ai.anicca.lateness-heartbeat` (launchd, 5分) | OS時計, bash直 | ✅ ON | `scripts/run.sh` → `lateness_check.py` + `arrival.py` | ゼロ円 (純Python) |
| `anicca-lateness-heartbeat-shell` (openclaw cron) | agent run | ❌ OFF (重複) | (同上) | — |
| `anicca-morning-leave-check` (openclaw cron) | agent run | 🗑️ 削除済 (2026-06-09) | 旧 lateness-guard | — |

- **真実の確認方法**: `openclaw cron list` = gateway の真実。 `cron/jobs.json` は stale seed なので信用しない。
- launchd 確認: `launchctl print gui/$(id -u)/ai.anicca.lateness-heartbeat`
- 実走ログ: `state/run.log` (5分毎の判定が追記される)

## フォルダ (全部 self-contained。 lateness-guard は削除済 = import も自分自身)

```
anicca-rockstar_ibot/
├── SKILL.md / MAP.md(これ)
├── scripts/
│   ├── run.sh              ← launchd の入口
│   ├── lateness_check.py   ← 判定エンジン decide() + haversine_m()  ★核心★
│   ├── gcal_departures.py  ← gcal→出発時刻 + directions_travel_min()
│   ├── route_lookup.py / transit_lookup.py  ← ルート検索 (transitous)
│   ├── arrival.py          ← 到着クロージャー
│   ├── guide_me_now.py     ← 道案内 (lc/gd を自分の scripts から import)
│   ├── saas_lateness.py    ← 将来のSaaSマルチテナント版 (cloud移行の種)
│   ├── renraku.py          ← 関係者連絡 (承認制)
│   ├── realtime_guide.py   ← 24/7 ガイド daemon
│   └── telegram_bot.py     ← 退役済み・Coreへ案内するfail-closed入口
└── state/  (run.log / notified.json / nudge_sent.json / renraku_sent.json / saas_sent.json)
```

## コスト構造 (token を気にする時はここ)

- 5分毎の判定ループ = **全部 純 Python = ゼロ円** (LLM 呼ばない)
- 旧Sutando/Pipecat電話daemonは退役済み。音声は現行Coreだけが所有する。
- openclaw cron (agent run) は LLM を起動 = トークン課金。 だから lateness は launchd (bash直) に置いてある = 安い + openclaw が落ちても動く。

## local → cloud (同一 core、 deploy フラグで2モード)

- `lateness_check.py::decide()` = local と cloud で**同一コード** (共有 core)。
- local = launchd 1人 / ファイル状態。 cloud = Temporal N人 / Supabase。
- 詳細 spec: `anicca-products` repo `docs/superpowers/specs/2026-06-09-anicca-rockstar_ibot-fix-and-roadmap.md`

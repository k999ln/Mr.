# TOOLS.md — Kai environment

2026-08-28 時点の確認結果。認証済みでも、対象プロジェクトの所有権まで自動的に保証するものではない。

| Tool | 状態 | 用途 |
|---|---|---|
| `gh` | `k999ln` として認証済み | GitHub |
| Sites | Kai 所有 Hub を確認済み | Rockstar_ibot One Hub |
| `wrangler` | インストール済み | Cloudflare |
| `stripe` | インストール済み・対象アカウント未確認 | 決済 |
| `supabase` | インストール済み・対象 project 未設定 | DB/Auth |
| `vercel` | インストール済み・対象 project 未確認 | Web hosting |
| Railway CLI | 未導入 | 必要時のみ |

秘密値はここへ記載しない。接続状態の検査には `npm --prefix apps/rockstar_ibot run owner:check` を使う。

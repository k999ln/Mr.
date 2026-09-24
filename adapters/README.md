# adapters/

Integration layer between Anicca's runtime graphs (`runtime/`) and the
outside world (Gmail, Slack, GitHub, Lancers, Coconala, X, etc.).

**Rule:** if a Composio integration exists for a tool, use it. Only
write a custom adapter when Composio does not cover the surface
(Lancers / Coconala / TikTok scrape / Postiz private API are the
known gaps as of 2026-06-03).

## Stack

| Layer | Library | Version | Why |
|---|---|---|---|
| Composio | `@composio/core` | latest compatible release | 1000+ tool integrations, active maintenance |

## How to start

```bash
cd adapters
npm install
node -e "import('@composio/core').then(m => console.log(Object.keys(m).slice(0,5)))"
```

The command must print a non-empty array.

## Convention

- One subfolder per provider: `composio/`, `agentmail/`, `lancers/`, `coconala/`.
- Each exports a thin TypeScript module the runtime imports.
- Secrets (API keys, OAuth refresh tokens) **never** live in this repo
  — they come from `~/.openclaw/.env` at runtime (HARD RULE A0.5).

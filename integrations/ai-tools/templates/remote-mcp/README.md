# Remote MCP package template

This directory is a non-runnable template. `api.example.invalid` is deliberately reserved and cannot become a production endpoint.

1. Copy this directory with `npm run ai-tools:scaffold -- <directory> --name <reverse-dns/server> --title <title> --remote <https-url>`.
2. Declare only the minimum data, credential slots, network hosts, effects, and retention needed in `rockstar_ibot-tool.json`.
3. Run `npm run ai-tools:validate -- <directory>`.
4. Submit both manifests for operator review. Validation does not approve, install, connect, or execute a tool.

Secret values never belong in either manifest. A credential slot is only a logical reference for a future tenant-scoped credential broker.

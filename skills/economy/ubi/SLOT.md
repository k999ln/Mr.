# Slot: `economy/ubi` — dormant

Recipient cash distribution was retired on 2026-08-28. This slot is not eligible for runtime selection.

- `run.sh` exits before reading telemetry, calling providers, or writing a distribution plan.
- `ubi.js` remains as historical pure calculation code only; it does not authorize a transfer.
- Wallet, bank, email-wallet, mobile-money, and streaming payout entrypoints in `skills/ubi/` fail closed.
- No environment variable or runtime option re-enables recipient payouts.

Current recipient support uses [`../../essentials-aid/`](../../essentials-aid/) and the [essentials-distribution design](../../../docs/superpowers/specs/2026-08-28-rockstar_ibot-essentials-distribution-design.ja.md). It requires recipient consent, an authorized human or partner need assessment, a verified vendor, and vendor-direct provision with separate purchase, dispatch, and receipt evidence.

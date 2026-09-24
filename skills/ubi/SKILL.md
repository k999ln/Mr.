---
name: ubi
description: Retired legacy cash-distribution implementation retained for audit only. Its automatic, wallet, and bank payout entrypoints fail closed under Rockstar_ibot's essentials-only support policy. Do not use it to support recipients; use essentials-aid to validate in-kind requests and create human-approved vendor-direct procurement plans.
---

# ubi — retired cash-distribution implementation

Owner direction changed on 2026-08-28. Recipient support is now limited to verified essential goods and provider-delivered services. Cash, bank payout, crypto, gift cards, prepaid cards, and unrestricted vouchers are prohibited.

The historical modules below remain readable so prior design and safety work are not erased, but the live entrypoints are disabled:

- `earn/run.sh` no longer calls a payout bridge;
- `distribute-ubi.mjs` records a policy skip and never reads balances or executes transfers;
- `execute-ubi.py` cannot sign or send;
- `ubi-watcher-daemon.sh`, `ubi-watcher.mjs`, and `ubi-payout-watcher.mjs` exit gated;
- Bridge, Crossmint, Kotani, Fern, and GDA recipient payout submissions remain blocked.
- `gmo-furikomi.mjs` is retained as a purpose-gated general bank adapter for verified vendor procurement, business expenses, and customer refunds; it rejects recipient-support destinations.

Use `../essentials-aid/` for the current policy and intake planner. Live procurement and delivery providers are not yet connected.

## Historical modules
| File | Role |
|---|---|
| `distribute-ubi.mjs` | Policy-gated legacy bridge; records `cash_distribution_retired_essentials_only`. |
| `execute-ubi.py` | Policy-gated legacy ERC20 implementation; cannot sign or send. |
| `bank-watcher.mjs` / `bank-payout-watcher.mjs` | Legacy bank-payout logic retained for audit; live submission is blocked. |
| `gmo-furikomi.mjs` | Retained bank-transfer adapter. Live submit requires an allowed purpose, approval reference, payee-verification reference, and idempotency key; aid-recipient destinations are rejected. |
| `bridge-payout.mjs` / `crossmint-offramp.mjs` / `kotani-payout.mjs` / `fern-payout.mjs` / `gda-pool.mjs` | Historical recipient payout rails; every write/submit entrypoint is blocked. |
| `ubi-watcher.mjs` / `ubi-payout-watcher.mjs` / `ubi-watcher-daemon.sh` / `com.anicca.ubi-watcher.plist` | Disabled watcher entrypoints retained for audit. |
| `lib/ubi.mjs` | Pure: buildRecipients / planUbi / alreadyDone. |
| `lib/bank-fanout.mjs` / `lib/bank-recipients.mjs` | Bank fan-out planning + recipient parsing. |

## Shared infra (`../_shared/lib/`)
`ledger.mjs` `usdc.mjs` `transfer.mjs` `identity-guard.mjs` `verify-tx.mjs` — used by both earn and ubi. Import as `../_shared/lib/X.mjs` (root modules) or `../../_shared/lib/X.mjs` (from `lib/`).

## Current safety invariant

No recipient cash or cash-like transfer may be initiated from this directory. Historical transfer safety tests remain useful as regression evidence, but they do not authorize reactivation.

## Tests
`__tests__/` includes the retired-distributor gate and historical pure helpers. Current in-kind policy tests live in `../essentials-aid/__tests__/`.

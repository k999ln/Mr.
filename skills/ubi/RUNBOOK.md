# Retired UBI payout runbook

The former recipient cash, bank, email-wallet, and on-chain payout demonstration is retired as of 2026-08-28.

Do not use this directory to send money, crypto, gift cards, prepaid cards, or unrestricted vouchers to a recipient. Its historical implementations remain in source control for audit, but active entrypoints fail closed and no launch daemon should be loaded.

The underlying GMO bank-transfer adapter remains available for verified vendor procurement, approved business expenses, and customer refunds. It is not a recipient-aid rail: live submission requires purpose, approval, payee-verification, and idempotency references, while the old `recipients` watcher remains gated.

Current recipient support is defined by [`../essentials-aid/SKILL.md`](../essentials-aid/SKILL.md) and [`../../docs/superpowers/specs/2026-08-28-rockstar_ibot-essentials-distribution-design.ja.md`](../../docs/superpowers/specs/2026-08-28-rockstar_ibot-essentials-distribution-design.ja.md):

1. record a privacy-minimized request and recipient consent reference;
2. have an authorized human or partner verify the need;
3. choose a verified vendor or licensed provider;
4. pay the vendor directly, never the recipient;
5. verify purchase, dispatch or appointment, and receipt or exception separately.

Live vendor, inventory, delivery, and care-provider integrations are not yet connected. A policy or procurement plan is not proof that anything was purchased or delivered.

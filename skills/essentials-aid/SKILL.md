---
name: essentials-aid
description: Plan privacy-minimized, in-kind support requests for essential goods or provider-delivered services. Reject cash-like assistance, require authorized human approval, and direct any procurement payment only to a verified vendor. This skill plans and validates; it does not purchase, decide eligibility, or claim delivery.
---

# essentials-aid

This skill implements Rockstar_ibot's essentials-only support boundary.

## What it does

- validates a pseudonymous request for approved essential categories;
- requires a private reference proving recipient consent;
- rejects cash, bank payout, crypto, unrestricted vouchers, and gift cards;
- requires a private-vault reference instead of a raw delivery address;
- requires an authorized human or partner approval, a need-assessment reference, and a vendor-verification reference before procurement planning;
- produces a vendor-direct plan with explicit receipt checkpoints.
- can prepare a purpose-bound bank-transfer request for the verified vendor; the underlying bank adapter also remains available for approved business expenses and customer refunds.

## What it does not do

- decide eligibility on its own;
- autonomously purchase an item, move money, or create a vendor account;
- store raw health, identity, bank, or address data;
- claim that an item was ordered, dispatched, or received.

The bank-transfer adapter is retained in code but no Kai-owned live bank account/token is configured. The old recipient payout watcher remains disabled. Live vendor ordering and delivery adapters remain unconfigured.

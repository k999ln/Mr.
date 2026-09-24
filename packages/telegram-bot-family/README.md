# Rockstar_ibot Telegram Bot Family

This package defines twenty behavior profiles behind one owner-controlled Telegram bot and one Rockstar_ibot Core contract:

- sixteen optional personality-style overlays (`ENTP` through `ISFJ`);
- four operating roles: `Mr. Bot`, `BotMother`, `Baby`, and `Life Guard`.

`Rockstar_ibot` is deliberately not a twenty-first behavior profile and not another public bot. It is the bounded commerce workspace opened with `/commerce` inside the same gateway. `Baby` covers earning from external work opportunities; `Rockstar_ibot` covers selling the owner's own products and managing payments, purchasers, delivery, and retention. `Life Guard` reviews both paths but does not execute either one.

`Mr. Bot` (`@avocadominibot`) is the only public Telegram account and the single main entry point. The other nineteen packages are internal profiles, not separate Telegram bots. Mr. Bot receives an unclassified request, keeps the system-wide context, and switches to a specialist profile with the user's choice; specialist results return to the main profile for the next system-level decision.

No public announcement channel is configured. A channel must stay unset until Kai separately confirms ownership and grants the intended permission.

The style selector is a consent-based self-reflection aid. It is not a medical, psychological, employment, education, housing, credit, insurance, or eligibility assessment. A user can choose or override a style at any time.

## Runtime boundary

The runtime is `byob_single`: one public BotFather bot, one deployment, and one external-vault token binding. All twenty profiles run as internal prompt and policy overlays in that deployment. No profile can add permissions or access a second Telegram credential.

The catalog contains no tokens or secrets. BotFather tokens must never be committed, printed, copied into screenshots, or placed in public configuration.

## Validate

```bash
npm test
npm run validate
```

The generated plan always targets `@avocadominibot`. Its BotFather token belongs only in the external vault and is never committed to Git.

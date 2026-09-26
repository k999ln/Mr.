# Mr. Automation Hub / avocadomini

Mr. is intended to bring first-party and external automation tools into one hub that can be used from the web, apps, and dedicated work environments. The new base-plan design is **USD 8.88 per month (the electricity plan), with 0% of user revenue shared**. Usage-based AI charges and paid external tools are separate, and live monthly billing has not yet been connected.

The current foundation adds an inventory and search experience for 15 tools, clear usage-state distinctions, the ability to save candidate tools to a work list, offline generation of Coconala proposal drafts and delivery checks, and a shared local runner. The new web version has been verified and preserved, but publishing it over the existing public site is waiting for owner confirmation. A dedicated OS image, signed desktop distribution, execution of every tool, and automatic revenue generation are not considered complete.

- [New service design and implementation scope](docs/mr-automation-hub-foundation.ja.md)
- [Shared tool catalog and pricing contract](packages/automation-hub/README.md)
- [Using the local runner](services/automation-runner/README.md)
- [OS runtime foundation](deploy/automation-os/README.md)

In the new web version, `/` is the tool hub. Existing life, work, finance, Service Cell, connection, distribution, and data-management features live under `/life`. Recent Sites additions that had not yet reached GitHub have also been preserved and use the same authentication and stored data. `/owner` is not a privileged administration screen; it aggregates design material and the signed-in owner's own data. Run `npm run test:automation-hub` and the Site's `npm test` to verify this foundation. The existing Telegram service is described below. The previous free tier, Stars, one-off sales, and Stripe products remain separate legacy behavior until migration to the new monthly plan is complete.

avocadomini is a Telegram-operated work control room for organizing requests, creating learning materials, reviewing content, preparing products for sale, marketing, guiding customers, confirming payment, delivering work, analyzing results, and distributing rewards.

## Telegram entry points

Start with the [Mr. main channel and entry point](https://t.me/RockstarMrBot). From there, open [avocadomini](https://t.me/avocadominibot), the public tool hub, or [ibot](https://t.me/Rockstar_ibot), the operations and development bot. Send `/start` after opening a bot and `/help` to view its menu.

The official name of the full system is `Rockstar_ibot`. `Mr. Commerce` and `Doraemon` remain as internal package names for compatibility; the user-facing product name is **avocadomini**.

> The current production scope lets a user choose one to three of ten tool categories, send a natural-language request through Telegram, receive a draft or review result from an isolated Codex session, and revise, complete, or resume the job. An operation is not treated as successful without external-provider credentials and authoritative readback.

<!-- hourly-repository-sync:start -->
## Hourly repository sync

| Item | Status |
|---|---|
| Last automatic sync | 2026-09-26 18:00 UTC |
| Target branch | `main` |
| Tracked files | 7,153 |
| Run receipt | [run 36263198149](https://github.com/k999ln/Mr./actions/runs/36263198149) |

> GitHub Actions updates this block every hour. Product descriptions and operating status are updated in the body alongside the change that provides the supporting evidence.
<!-- hourly-repository-sync:end -->

[Official site](https://effect-os-verified.kirin-999.chatgpt.site/start) · [Screen-takeover prevention](docs/automation-browser-screen-takeover-prevention.ja.md) · [Automation control room](https://mr-automation-control-20260904.kirin-999.chatgpt.site) · [New-chat handoff](docs/CHAT-HANDOFF.ja.md) · [Connection registry](docs/owner-account-registry.ja.md) · [External change log](docs/operations-change-log.ja.md) · [User journey and release gates](docs/avocadomini-release-gates.ja.md) · [Project index](docs/PROJECT_MEMORY_INDEX.ja.md) · [Rockstar_ibot One Hub](https://life-manager-one-hub.kirin-999.chatgpt.site) · [GitHub](https://github.com/k999ln/Mr.) · [Telegram setup](docs/telegram-bot-setup.ja.md) · [Product design](project.md) · [MIT License](LICENSE)

## Send instructions from Telegram to Codex and receive results

General users send ordinary text to a tool room or the main control room in `@avocadominibot`. Codex on the Mac creates drafts and review results inside an empty, read-only temporary folder and returns them to the same Telegram conversation. Kai-only operations, approvals, and monitoring are designed to remain separate in `@Rockstar_ibot`; the live owner-bot connection receipt is not yet complete. `/codex` is for investigating Mr., while `/codex edit` is for explicitly requested repository changes. The connection and safety boundaries are documented in the [Telegram ↔ Codex handoff](docs/codex-telegram-bridge.ja.md).

Common user commands are `/start`, `/home`, `/tools`, `/jobs`, `/today`, and `/help`. When Core starts, it automatically compares the BotFather command list and description and repairs only differences. `/help` continues to return explanatory text even when the database is temporarily paused.

Scheduled browsers on the Mac are fixed to headless mode and normally do not take over the screen or input focus. When a one-off visible action is unavoidable, run `bin/lm-screen approve <loop-id> --seconds 60..900`, followed by `bin/lm-screen run <loop-id> -- <command>`. `bin/lm-screen revoke` stops an active handoff, and approvals are never reused.

## Production requirements for first-time readers

Mr. is not an application that runs entirely on one website. The user-facing site, the backend server that answers through Telegram, and the database that stores information work together.

### What is a database?

A database is an online ledger used by the site and bots. It resembles an Excel table, but the application reads and writes it automatically. Mr. stores Telegram user IDs, selected features, acceptance of terms, usage history, and payment and execution results. It is not a site users ordinarily view directly.

### External services and verification status

The following table records what this installation environment had verified as of 2026-09-05 01:10 JST. “Unverified” does not mean that the service does not exist; it means that the owner's administration screen or configuration could not be confirmed from this environment.

| Service | Role | Verification status |
|---|---|---|
| GitHub `k999ln/Mr.` | Source of record for Mr.; target branch is `main` | Connected. Do not use `vvvv`. |
| Codex Sites / publishing | Official user-facing site for avocadomini | Owner-verified; version 44 deployed successfully; `/start` returned HTTP 200. |
| Vercel | Redirect users of the old `doraos.vercel.app` site to the official site | Account and project verified; every path and query redirects to Codex Sites with HTTP 307. Automatic deployment from GitHub remains unconfigured. |
| Railway | Backend for customer-bot `/start`, job intake, and replies | `avocadomini-production` / `avocadomini-core` running; successful deployment, HTTP 200 health response, and build SHA verified. The owner-bot service is not deployed. |
| Supabase | Core database for selections, jobs, state, and receipts | Required migrations applied to `Kai Mr` / `avocadomini-production`; RLS and service-role-only permissions read back. |
| Telegram customer bot / BotFather | Customer intake, webhook, and replies | `@avocadominibot` passed `getMe`; webhook registered. Token rotation and a real job end-to-end test remain incomplete. |
| Telegram owner bot / BotFather | Kai-only approval, monitoring, stopping, and Life OS | `@Rockstar_ibot` is authoritative. Independent deployment, `getMe`, webhook, allowlist, and live send/receive receipt remain incomplete. |
| Resend | Email and diagnostic-PDF delivery | Not required for the initial Telegram path. A sending key and sender domain are needed only when email features are enabled. |
| Stripe | Payments for paid features | It may be configured, but authoritative verification through the current dashboard is incomplete. It is not required for choosing three free features. |

### Information required for the initial Telegram path

Only three things are needed for “choose one to three items on the site → open Telegram → reflect the selection with `/start`”:

1. A place to run the backend server, such as Railway, and permission to administer it.
2. A Supabase database project and permission to apply migrations.
3. Permission to run a BotFather-created Telegram bot from the server.

Never paste secrets such as bot tokens, webhook secrets, or Supabase service-role keys into GitHub, a README, an issue, or chat. Store them in Railway or Supabase environment variables, Keychain, or an approved secret store.

### Additional services for all features

Enabling all ten sales functions also requires owner-controlled connections for Resend email, Stripe payments, Google Calendar and Maps, AI providers, Telnyx voice calls, and browser execution where needed. These are not prerequisites for validating the initial free Telegram path.

The [external-service connection registry](docs/owner-account-registry.ja.md) and [new-chat handoff](docs/CHAT-HANDOFF.ja.md) contain each service account, project, secret-storage location, verification time, receipt, and open item. New chats should read those records first instead of asking again about confirmed connections.

### Source repository and cloning

The official GitHub source repository is `k999ln/Mr.`, including the trailing period. A clone URL ending in `Mr..git` is therefore correct. Changes, commits, pushes, and deployments target only this repository's `main` branch. Do not use the legacy `vvvv` repository as a change, push, or deployment target.

## X, landing-page, and email sales funnel

The source of record for the public site is `apps/doraemon-marketing-site`. It implements a free diagnostic PDF, a consent-aware form, UTM tracking, immediate delivery through Resend, a four-message email sequence, and unsubscribe handling.

- X posts: `marketing/x/posts.json` (three per day for 30 days)
- Human-readable calendar: `marketing/x/30-day-calendar.ja.md`
- Free resource: `apps/doraemon-marketing-site/public/resources/sales-automation-checklist-v1.pdf`
- Email design: `marketing/email/sequence.ja.md`
- Owner tasks and pre-publication checks: `docs/doraemon-marketing-launch.ja.md`

Live posting, general publication, payment, and email delivery are enabled only after connecting Kai-owned X, Sites, Stripe, Telegram, Resend, and Turnstile accounts and verifying each receipt.

## Ten tools

1. Organize a request.
2. Create learning material.
3. Review content.
4. Build a storefront.
5. Expand marketing reach.
6. Nurture prospects.
7. Confirm payment.
8. Deliver the product.
9. Measure results.
10. Distribute rewards.

This is not a broadcast-only bot. Human approval, duplicate-execution prevention, authoritative provider results, and records connecting initiatives to long-term outcomes are part of one workflow.

## Capabilities

| Area | Main capability | Current state |
|---|---|---|
| Telegram customer bot | Intake, tool selection, requests, progress, and delivery | `@avocadominibot` connected; token rotation and a real job end-to-end test remain. |
| Telegram owner bot | Approval, stopping, state review, and Life OS | Designed as a separate Kai-only `@Rockstar_ibot` deployment; live receipt incomplete. |
| Rockstar_ibot Core | Schedule, movement, notifications, and life/work/finance workflows | Some parts are live; others are waiting for provider connections. |
| MetaMask destination | Register a Base Mainnet USDC receiving address in Core Panel with an ownership signature | Implemented and available after the DB migration. It does not request transfer authority. |
| Rockstar_ibot One Hub | Today, Body/Mind, Money, Work, Connections, and Proof | Running for the owner only. |
| Service Cells | Standardized creation, marketing, sales, learning, and delivery services | Executors are being implemented in stages. |
| Rockstar_ibot commerce | Unified product, payment-observation, permission, consent, initiative, and outcome data | Authoritative data model and safe storage boundaries implemented. |
| External AI catalog | MCP and other manifests, permissions, and digest verification | Metadata only; installation, execution, and billing are disabled. |
| iOS | Native SwiftUI client | Preview and Simulator verification complete. |
| Local runtime | API, scheduler, worker, Postgres, and object storage | Docker setup exists; a fresh Core baseline schema is incomplete. |

## Two Telegram bots and their responsibilities

The authoritative topology uses two bots: Kai-only `@Rockstar_ibot` and customer-facing `@avocadominibot`. The customer bot is connected; the owner bot still needs an independent deployment and authoritative readback. Mr. Bot, BotMother, Baby, and Life Guard are conversation roles within `@avocadominibot`, not additional bots.

~~~text
@Rockstar_ibot (Kai-only owner bot)
└── Operations, approvals, monitoring, stopping, and Life OS

@avocadominibot (public customer bot)
├── Conversation roles
│   ├── Mr. Bot       General coordinator
│   ├── BotMother     Essential-goods and required-service support
│   ├── Baby          External work and opportunity-based earnings
│   └── Life Guard    Safety, permissions, and evidence checks
├── Business workspace
│   └── Rockstar_ibot The user's products, payments, customers, and delivery
└── Conversation style
    └── 16 styles      Different expression without changing role or authority
~~~

| Name | Open with | Responsible for | Not responsible for |
|---|---|---|---|
| Mr. Bot | `/main` | Unclassified requests; coordinating schedule, life, work, and money; routing work | Detailed sales operations or specialist review |
| Rockstar_ibot | `/commerce` | The user's products, sales initiatives, orders, payments, customers, consent, delivery, and sales analysis | Finding external jobs, life support, or safety review itself |
| BotMother | `/mother` | Organizing applications for essential goods and required services | Cash benefits, sales CRM, or unapproved orders |
| Baby | `/baby` | External opportunities suited to the user's skills, proposals, work, and reward confirmation | Selling the user's own products or managing buyers |
| Life Guard | `/guard` | Cross-cutting safety, permission, privacy, evidence, and completion-condition review | Acting as the executor for sales, work, or support |
| Conversation style | `/style` | Changing how the same role communicates and reasons | Adding features, adding authority, or psychological diagnosis |

### Similar-looking entry points

| Entry point | Difference |
|---|---|
| `/status` / `/today` / `/analytics` | `/status` covers all of Life Manager, `/today` shows sales items requiring action, and `/analytics` shows receipt-verified sales results. |
| `/baby` / `/commerce` | Baby helps with earning from external work; Rockstar_ibot runs the user's own product sales. |
| Launch button after product creation / `launch_offer` | The same integrated launch flow; the button is a shortcut that reduces input. |
| `/delivery` / `deliver_order` | `/delivery` proposes a standalone delivery; `deliver_order` connects payment confirmation, delivery, and notification. |
| Approval button / `/approve` | The same approval process; the command is a fallback when a button cannot be used. |
| Selection in `/tools` / provider connection | Selection only reserves usage scope. Credentials, an adapter, and provider verification are still required for a connected state. |

## Rockstar_ibot

Rockstar_ibot is the name of the overall sales and decision platform with Telegram as its operating surface. `@Rockstar_ibot` is the Kai-only owner control plane; `@avocadominibot` is the customer and revenue plane. The commerce workspace opens from the customer bot with `/commerce`.

~~~text
Freeze the Product, Offer, and Promise as versions
        ↓
Create initiative candidates and let an approver choose
        ↓
Execute posting, notification, payment, or entitlement changes
        ↓
Observe the provider's authoritative result
        ↓
Record purchases, refunds, renewals, cancellations, and mismatches
        ↓
Evaluate the initiative and long-term outcome
~~~

### Implemented authoritative data

- Immutable Offer Versions and Promise Versions
- Order, Payment, Refund, and Chargeback observations
- Desired and observed states for buyer Entitlements
- Consent, Purpose, Notice Version, and Withdrawal
- Decision Opportunities, all candidates, rejections, selection probability, and approval
- Experiments, holdouts, Outcomes, and references to net economic value
- Webhook inbox, leases, retries, and reconciliation evidence
- Pseudonymous references to approvers and approval policies

The system does not create a cross-merchant identifier for tracking a person. It does not store raw email addresses, phone numbers, tokens, passwords, or conversation bodies in the decision ledger. It uses merchant-scoped pseudonymous references and approved aggregate results.

### Consistency guarantees

- Receiving the same provider webhook 100 times converges on one observation.
- A stale worker holding an expired lease cannot finalize a result.
- A Refund or Chargeback can reverse only its corresponding original Payment.
- Total reversals cannot exceed the original Payment.
- An Order is pinned to exact Offer and Promise Versions.
- A nonexistent historical Version cannot be used as a `supersedes` target.
- Revenue and completion are not shown without real provider readback.
- The canonical evidence store separates tenant, merchant, idempotency, and authorization boundaries.

See the [Rockstar_ibot integration policy](docs/revenue-assurance-integration.ja.md).

## Verify in five minutes

### Requirements

- Git
- Node.js 20.19.0 or later
- npm
- Docker, if running the local stack

### 1. Clone

This repository contains submodules.

~~~bash
git clone --recurse-submodules https://github.com/k999ln/Mr..git
cd Mr.
~~~

For an existing clone:

~~~bash
git submodule update --init --recursive
~~~

### 2. Commerce tests

~~~bash
cd apps/rockstar_ibot
npm ci
npm run test:commerce
~~~

The current Commerce suite contains 125 tests covering Telegram approval, tenant isolation, payment observations, webhook redelivery, entitlements, consent, and decisions. In environments without server dependencies, one HTTP integration check is skipped.

### 3. Local stack

Run these commands from the repository root:

~~~bash
./scripts/local-up.sh
./scripts/local-up.sh status
./scripts/local-up.sh logs
~~~

Stop it with:

~~~bash
./scripts/local-up.sh down
~~~

The local stack starts Postgres, object storage, the API, scheduler, and worker. Telegram, Supabase, Calendar, and similar services use installer-owned external configuration, so starting the stack does not make every feature connected.

## Initial setup

### Secrets

Never paste secrets into Git, a README, an issue, or chat. The first `./scripts/local-up.sh` run creates `deploy/local/.env` for the local stack with mode 0600 and generates a random MinIO password. Do not copy `.env.example` directly to `.env`.

Store other secrets in a mode-0600 private environment file, Keychain, or a tenant vault. Jobs, events, and manifests receive references, not credential values.

### Check installer-owned providers

~~~bash
npm run owner:check -- --profile base,calendar,voice,billing
~~~

This command checks required variable names and formats without printing values. It does not prove provider ownership, balance, OAuth consent, migration application, or webhook reachability.

- [Installer account intake](docs/owner-account-intake.ja.md)
- [Provider setup guide](docs/owner-tools-setup.ja.md)

### Connect a Telegram bot

The runtime standard is `byob_single`: one BotFather bot owned by each deployment. Kai's two bots connect to two independent deployments, one bot per deployment; never place both tokens in one process.

~~~bash
npm run telegram:configure -- \
  --public-url https://your-rockstar-ibot.example \
  --register
~~~

Enter the token through the hidden prompt. The webhook needs a Telegram-reachable HTTPS URL. Do not overwrite another bot's existing webhook without explicit permission.

## Purchase with Stripe and connect Telegram

The purchase page is `GET /doraemon`. The buyer moves to Stripe-hosted checkout and returns to `GET /doraemon/complete?session_id={CHECKOUT_SESSION_ID}` after payment. Viewing the success page alone does not grant access.

~~~text
Begin purchase at /doraemon
  → issue a public client_reference_id
  → pay through a Stripe Payment Link
  → receive signed checkout.session.completed / async_payment_succeeded
  → show a one-time Telegram link to the same browser only
  → atomically consume /start doraemon_<token>
  → connect the purchase entitlement to the Telegram account
~~~

The raw connection token is not stored in the database; only its SHA-256 hash is stored. Connection is rejected before payment, after expiration, after use by another Telegram account, or before webhook verification.

### Stripe configuration

1. Create the product and Payment Link in a Stripe account owned by the installer.
2. Set the Payment Link's post-payment behavior to `redirect` and use `https://<LM_PUBLIC_URL>/doraemon/complete?session_id={CHECKOUT_SESSION_ID}`.
3. Configure `POST https://<LM_PUBLIC_URL>/api/stripe/webhook` as a webhook endpoint and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and subscription lifecycle events.
4. Apply `apps/rockstar_ibot/migrations/2026-09-01-lm-doraemon-purchase-claims.sql` to Supabase.
5. Store the following values in private environment variables. Never commit secrets to Git.

~~~dotenv
LM_DORAEMON_PAYMENT_LINK=https://buy.stripe.com/...
STRIPE_WEBHOOK_SECRET=whsec_...
LM_TELEGRAM_BOT_TOKEN=
LM_TELEGRAM_BOT_USERNAME=
LM_TELEGRAM_WEBHOOK_SECRET=
~~~

Standard Stripe pricing in Japan has no setup or monthly fee, but a 3.6% processing fee applies to successful card payments. Payment Links are included without an additional fee beyond standard Payments pricing. Pricing can change; recheck [Stripe Japan pricing](https://stripe.com/jp/pricing) before production launch.

## Telegram owner operations

- `/commerce` — Rockstar_ibot sales menu
- `/tools` — connector selection and status
- `/product` — begin a product workflow
- `/campaign` — begin a campaign workflow
- `/approve <id>` — approve a waiting workflow
- `/pause` — stop new executions

These are ultimately owner-only operations for `@Rockstar_ibot`. Until owner-bot migration is complete, they must not be exposed to customers. `/approve` and `/pause` run only in the linked owner's private Telegram chat when the actual user ID and chat ID both match. Groups, unlinked actors, and actor substitution are rejected before side effects.

Selecting a connector does not make it connected or executable. Work remains blocked or awaiting approval until a credential reference, adapter, required capability, and provider verification are all present.

## Architecture

~~~text
Telegram / Hub / iOS
        │
        ▼
Rockstar_ibot API and approval boundary
        │
        ├── Core workflows
        │
        └── Rockstar_ibot canonical stores
              ├── Offer / Promise
              ├── Payment observations
              ├── Entitlement reconciliation
              ├── Consent / Rights
              └── Decision / Outcome
        │
        ▼
Durable queue, effect fence, and append-only ledger
        │
        ▼
Replaceable provider adapters
        │
        ▼
Authoritative readback, receipts, and reconciliation
~~~

External providers are not the source of record. Stripe, Telegram Stars, LMS, community, CRM, and similar systems are replaceable adapters that execute commands and return observations.

## Open-source evaluation submodules

`vendor/commerce-upstreams/` pins the following sources to fixed commits:

| Project | Evaluation area |
|---|---|
| Formance Ledger | Money ledger |
| Temporal | Long-running workflows |
| OpenFGA | Authorization |
| grammY | Telegram adapter |
| Payload | Content and evidence revisions |
| GrowthBook | Experiments |
| Casdoor | Operator IAM |
| Chatwoot | Support adapter |
| Medusa | Commerce adapter |

These projects are for evaluation and are not necessarily selected for production. License, security advisories, telemetry, tenant isolation, backup, export, deletion, and replaceability must be reviewed before adoption as an independent service or an adapter behind a port. Fixed commits are listed in [commerce-upstreams.json](config/commerce-upstreams.json).

## Tests

### Commerce only

~~~bash
cd apps/rockstar_ibot
npm run test:commerce
~~~

### All Rockstar_ibot tests

~~~bash
cd apps/rockstar_ibot
npm test
~~~

Known issue: the baseline commit currently has an existing `test:legacy-paths` failure that detects old OpenClaw/Anicca paths. It is independent of Commerce changes and must be resolved before distribution.

## Current limitations

| Item | State |
|---|---|
| Authoritative Commerce schema, stores, and tests | Implemented |
| Telegram approver-actor validation | Implemented |
| Durable inbox for provider webhooks | Implemented |
| MetaMask receiving-address registration in Core Panel | Implemented for Base Mainnet, chain ID 8453, with a five-minute one-time signature challenge and session, Origin, CSRF, and tenant boundaries. Automatic transfer is a separate feature. |
| Production Stripe and Telegram credentials | Waiting for installer configuration; fails closed without secrets. |
| Stripe purchase → Telegram connection | Implemented; enabled after the Supabase migration, Payment Link redirect, and webhook setup. |
| Other Commerce provider routes and adapters | Not connected; catalog, selection, and workflow boundaries are implemented. |
| Fresh-Supabase Core baseline schema | Minimum avocadomini-entry bootstrap implemented and applied; full-Core baseline incomplete. |
| Production outbox consumer from Hub to Core | Incomplete |
| Shared multi-bot SaaS registry | Incomplete |
| `@Rockstar_ibot` owner deployment | Incomplete; needs `getMe`, webhook, Kai allowlist, owner commands, and a real send/receive receipt. |
| Production mobile API, APNs, and StoreKit | Incomplete |
| All Service Cell executors | Partially implemented |
| Isolation and load testing at 3,000-user scale | Unproven |
| General public release | Not approved |

The presence of configuration is not proof of safe production operation. Features without external credentials and authoritative readback remain fail-closed.

## Repository layout

| Path | Role |
|---|---|
| `apps/rockstar_ibot/` | API, Telegram, scheduler, worker, and Commerce |
| `apps/rockstar_ibot-hub/` | Rockstar_ibot One Web Hub |
| `apps/rockstar_ibot-ios/` | Native SwiftUI iOS client |
| `apps/doraemon-marketing-site/` | Public sales site, entry flow, and legal/privacy pages |
| `apps/dora-launch-blueprint-site/` | Site and PDF for sharing the launch blueprint |
| `apps/mcp-bot-hub-patent-site/` | Site and PDF for sharing the MCP Bot Hub patent concept |
| `apps/rockstar_ibot/migrations/` | Core and Commerce schema changes |
| `runtime/` | Durable jobs, effect fences, and economic runtime |
| `skills/` | Reusable agent capabilities |
| `services/` | Compute, settlement, and shared services |
| `integrations/ai-tools/` | External AI package manifests and catalog |
| `vendor/commerce-upstreams/` | Evaluation OSS pinned to fixed commits |
| `config/` | Machine-readable policies and catalogs |
| `docs/` | Designs, runbooks, audits, and evidence |
| `specs/` | Implementation plans and design history |

## Data and safety contract

- Existing Telegram projections are isolated by tenant; the canonical evidence store is isolated by tenant and merchant.
- Do not create an identity for tracking a person across merchants.
- Handle only lawful, contracted business data.
- Do not store raw personally identifiable information, credentials, or conversation bodies in decision and outcome ledgers.
- Record consent purpose, notice version, withdrawal, and expiration separately.
- Keep unobserved, pending, and false distinct.
- Do not report completion without a receipt tied to the artifact and external readback.
- Do not perform irreversible external or financial actions without current explicit approval.
- Do not guarantee revenue, search rank, health, or investment outcomes.
- Do not use the system for personal tracking, targeting, or weapons.

## Key documents

- [project.md](project.md) — source of record for product design and roadmap
- [Rockstar_ibot integration policy](docs/revenue-assurance-integration.ja.md)
- [Telegram bot setup runbook](docs/telegram-bot-setup.ja.md)
- [Provider configuration and incomplete boundaries](docs/owner-tools-setup.ja.md)
- [Separating public information from secrets](docs/owner-account-intake.ja.md)
- [External-service operations change log](docs/operations-change-log.ja.md)
- [Project index](docs/PROJECT_MEMORY_INDEX.ja.md)
- [External site connection and reconnection registry for avocadomini / PRIVATE/PIXEL](docs/doraemon-site-reconnection.ja.md)
- [Complete two-task deliverable inventory](docs/DORA_OS_%E5%85%A8%E6%88%90%E6%9E%9C%E3%82%A4%E3%83%B3%E3%83%99%E3%83%B3%E3%83%88%E3%83%AA_2026-09-02.md)
- [Chat deletion and recovery audit](docs/maintenance/chat-deletion-readiness-2026-09-04.ja.md)
- [External AI package specification](integrations/ai-tools/README.md)
- [SOUL.md](SOUL.md) and [THESIS.md](THESIS.md)

## Contributing

1. Read the nearest `AGENTS.md` and relevant design documents first.
2. Do not commit secrets, real customer data, or credential-bearing URLs.
3. Design external effects around explicit approval, idempotency, receipts, and reconciliation.
4. Add focused tests for the implementation.
5. Run `git diff --check` and the relevant tests.
6. Distinguish implemented behavior from unconnected behavior in the README and documentation.

## License

MIT License. See [LICENSE](LICENSE) for details.

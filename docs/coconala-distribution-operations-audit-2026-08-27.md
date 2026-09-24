# Coconala distribution and operations audit — 2026-08-27

## Scope and disposition

This audit covers the public Coconala four-lane package, its installer/release path, model
context, local state, and the implications of distributing the whole Rockstar_ibot repository.
It does not treat tests, process liveness, or a local model result as proof of marketplace
permission, revenue, delivery, or privacy compliance.

The repository-owner identity defect is fixed in this change:

- `reply_composer.py` no longer contains a TikTok handle, follower count, or a universal
  video-editing prohibition.
- `requested_estimate.py` no longer contains that social profile, owner-specific fact IDs,
  customer-specific few-shots, or reusable v26/v27 semantic receipts.
- `proposal_feedback.py` no longer derives age/prefecture from a job-search profile or uses a
  repository-owner allowlist.
- `verified_owner_profile.py` is the single private fact loader/admin surface. It opens a bounded,
  owner-owned, mode-0600 regular file without following symlinks and requires explicit contexts,
  evidence, verification time, optional expiry, and exact HTTPS URLs. Private evidence never
  enters prompts.
- Repeat onboarding preserves facts only for an unchanged `owner_id`; an owner mismatch fails
  before overwrite.

Residual fact risk: verification is an operator attestation, not an independent online check.
Time-sensitive claims therefore need `expires_at`; an automated evidence verifier remains future
work.

## External control references

1. **Coconala Terms of Use**, <https://coconala.com/pages/terms_user>. Core text:
   “出品者又は購入者の判断に錯誤を与えるおそれのある行為”. The same current terms also
   prohibit unfair information manipulation and allow suspension/cancellation for violations.
2. **OWASP GenAI LLM01 Prompt Injection**, <https://genai.owasp.org/llmrisk/llm01-prompt-injection/>.
   Core text: “Disclosure of sensitive information” and “Executing arbitrary commands”.
3. **OWASP GenAI LLM02 Sensitive Information Disclosure**,
   <https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/>. Core text:
   “perform adequate data sanitization”.
4. **NIST AI 600-1 Generative AI Profile**,
   <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf>. Core text: “govern, map, measure,
   and manage risks”.
5. **Stripe Connect platform pricing**, <https://docs.stripe.com/connect/platform-pricing-tools>.
   Core text: an “application fee” is allowed only where the platform is permitted to charge it.

## Findings

### P0 — Marketplace automation has no Coconala-specific authorization receipt

**Evidence.** `skills/earn/gig/install.sh` activates all effect lanes after account, email, SMS,
seller-information, eKYC, and bank readback. `coconala_onboarding.py` records those account gates,
but not an automation permission, transport approval, terms version, jurisdiction, or expiry.
The generic `provider_authorization.py` contract exists and `application_effect_fence.py` can
require `approved_browser`, but the Coconala Apply, Reply, Storefront, and Paid entry paths do not
resolve a Coconala authorization receipt before every external effect.

**Impact.** Global distribution could activate browser submissions, listing edits, replies, and
formal deliveries without proving that the marketplace permits this transport and action for the
current account and terms version. Account suspension and customer harm are plausible even when
the browser automation is technically correct.

**Required control.** Default new installs to observation/shadow mode. Enable each effect only
from a current, expiring Coconala authorization receipt keyed by account, action, transport,
jurisdiction, terms version, and evidence hash. Obtain written platform approval or use an official
supported API before public effect-mode distribution. A terms change must invalidate the receipt.

### P0 — Raw customer conversations are retained beyond a defined privacy purpose

**Evidence.** `reply_executor.py` sends the entire reply context to `reply_transcript.py`.
`reply_transcript.py::transcript_row` stores `outgoing_body`, `buyer_last_said`, and the full
conversation in `~/gig/reply-transcripts.jsonl`. `evidence_gc.py` declares every `*.jsonl` protected
from deletion. Several production source comments/prompts also contain historical talkroom IDs,
buyer handles, buyer quotations, order details, and measured outcomes (for example
`buyer_voice.py`, `near_duplicate_reply.py`, `first_contact.py`, `followup_draft.py`, and
`paid_conversation_compose.py`).

**Impact.** Buyer content is sent to model providers, copied into long-lived local ledgers, and in
some cases committed to the public repository. There is no documented consent, purpose limit,
retention period, per-buyer export/deletion path, processor inventory, or breach response.

**Required control.** Remove real customer examples from source and replace them with synthetic
fixtures. Store hashes/labels instead of message bodies when learning does not need the body.
Encrypt necessary raw content per installation/tenant, add configurable TTL and legal hold,
implement buyer/account export and deletion, and publish a privacy notice listing every model
processor and retention purpose. Do not protect customer-content JSONL files forever merely
because they are ledgers.

### P0 — The package is single-install/single-seller, not a hosted multi-tenant system

**Evidence.** State defaults to `~/gig`; the shared Chromium profile and CDP port 9223 are fixed;
the four lanes share one logged-in browser; many ledgers and SQLite databases are installation-wide.
The outbox supports `account_key`, but the top-level state roots, browser session, release jobs,
profile, encryption boundary, and operator brakes are not tenant-namespaced.

**Impact.** It is safe only as one seller per isolated macOS account/device. Running many sellers
inside one service process or OS account can mix sessions, facts, customer content, effects,
brakes, capacity, and evidence.

**Required control.** Either state clearly that the supported architecture is one isolated Mac/OS
user per seller, or build a real tenant boundary: immutable tenant ID on every row/path/effect,
separate database/encryption key/browser profile/CDP endpoint, tenant-scoped authorization and
rate limits, cross-tenant negative tests, and an administrative access audit log.

### P0 — Automatic updates trust an unsigned moving branch

**Evidence.** `scripts/bootstrap-coconala.sh` executes a raw GitHub script and fast-forwards
`origin/main`. `gig_release.py watch` fetches `origin/main`, archives that commit, and atomically
publishes it every five minutes. No signed-tag/commit verification, release manifest signature,
pinned digest, staged rollout, or canary promotion gate is required.

**Impact.** Compromise of the GitHub account, branch, dependency installer, or CI publishing path
can become remote code execution on every installed seller Mac, including access to logged-in
browser sessions and customer data.

**Required control.** Publish versioned signed releases; pin bootstrap to a digest; verify signature,
commit allowlist, checksums, SBOM, and minimum test/evaluation receipt before install; stage rollout;
retain one-click rollback; and never auto-promote an arbitrary moving branch to all customers.

### P1 — Buyer content can indirectly instruct tool-capable production agents

**Evidence.** The semantic reply route is tool-less and explicitly treats message instructions as
data. Paid owners, however, read buyer messages and attachments while holding bounded file/tool
capabilities. Deterministic delivery guards reduce external effects, but there is no repository-wide
taint label proving which strings came from a buyer, nor an injection evaluation covering every
file/desktop tool broker.

**Impact.** A malicious attachment or message can attempt to redirect artifact generation, read
unrelated project data, disclose internal prompts, or request an unauthorized tool action.

**Required control.** Mark all marketplace text/attachments as untrusted data, maintain provenance
through compiled context, block instructions from changing system/tool policy, keep project
sandboxes and allowlisted broker arguments, scan outputs for secrets/cross-project references, and
run adversarial indirect-injection evals for every new capability.

### P1 — Whole-repository distribution still contains other operator identities

**Evidence.** Outside the Coconala default jobs, repository runtime files contain fixed operator
homes, Gmail accounts, AgentMail inboxes, support addresses, handles, and account-creation rules.
Examples include `runtime/earn/*.sh`, `skills/earn/marketing-engine/provision_prompt.sh`,
`skills/writer-agent/scripts/opportunity_response.py`, `skills/report/*`, and Capafy publishing
defaults.

**Impact.** A user who enables adjacent skills can operate under the repository owner's identity,
send reports to the wrong mailbox, read the wrong account, or simply fail because a private path
does not exist.

**Required control.** Maintain a machine-readable identity-literal denylist in CI, require every
account/address/path from a private per-owner profile or environment contract, and make missing
identity fail closed. The Coconala fix must be generalized before advertising the whole repository
as owner-neutral.

### P1 — Revenue-share collection is not implemented and cannot be enforced in this MIT client

**Evidence.** The Coconala package has no transaction metering, platform fee instruction, connected
account model, payout reconciliation to a platform, or tamper-resistant entitlement. The separate
Rockstar_ibot app contains subscription billing primitives, but they do not meter or gate Coconala
revenue. The repository is MIT licensed, so a recipient may legally remove client-side fee logic.

**Impact.** Adding a local percentage calculation does not collect money and is trivially bypassed.
Trying to divert a Coconala buyer payment off-platform would create a direct-trade/terms risk.

**Required control.** Choose one compliant model: hosted subscription for software/service access;
or marketplace/platform fees through a provider designed for connected accounts and supported
countries. Keep Coconala transactions on Coconala. Meter only a server-side service the operator
actually provides, use idempotent signed usage events and refund/chargeback reconciliation, and
obtain tax/payment legal review before global rollout.

### P1 — Main is not release-ready: repository test suite is red

**Evidence.** On 2026-08-27 the full `skills/earn/gig/tests` run passed 689 tests and failed 11.
The failures are seven disk-safety policy contracts, three Storefront
incremental/baseline/source-order contracts, and one environment-dependent Upwork browser test.
The targeted owner-profile and reply suite passes.

**Impact.** A red main branch is incompatible with unattended global auto-update. Disk guard and
Storefront failures affect safety and revenue behavior, not cosmetic formatting.

**Required control.** Require a green hermetic CI suite before signing a release. Separate optional
real-browser acceptance tests from unit tests, but do not waive disk-safety or Storefront contract
failures. Auto-update must consume only a signed, green release.

### P1 — Geographic and platform limits contradict “global” positioning

**Evidence.** The installer requires Apple Silicon macOS, a Japanese mobile number, Coconala eKYC,
and a matching domestic bank account. Browser selectors and customer-facing behavior are
Coconala/Japanese-specific.

**Impact.** Source-code availability is global, but the revenue system is not usable by the global
population. Scaling installs does not remove marketplace eligibility, language, banking, tax,
support, or model-cost limits.

**Required control.** Market this release as a Japan/Coconala/macOS public beta. Define a provider
adapter certification contract for each new country/marketplace, including official transport,
KYC/payout, terms version, language QA, tax documents, refund/dispute flow, and capacity limits.

## Release gates

Do not call the system globally distributable until all P0 items are closed and evidenced. Minimum
release evidence:

1. Current platform authorization receipt for every effect action.
2. One-tenant-per-install enforcement or proven tenant isolation.
3. Published privacy notice, processor list, retention/deletion/export tests.
4. Signed immutable release, green hermetic suite, canary, rollback.
5. Synthetic-only public fixtures/source examples and identity-literal CI scan.
6. Financial model that does not divert marketplace transactions and has jurisdictional review.
7. Incident controls: remote kill switch scoped by release/tenant/lane, audit log, support and breach
   runbook.

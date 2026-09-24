// node:test — the bridge wiring: proves the data-contract fixes, fully OFFLINE + deterministic.
// (1) B1/B2: a run.sh-shape line (earn_usdc/cost_usdc, NO net_usdc) is re-derived via deriveLine
//     so isProfitable passes — without this the dry plan would be 'funding_not_profitable'.
// (2) N1: sibling-AI recipients are read from children.jsonl rows' `wallet` field (not childWallet).
// (3) B3: in dry-run the bridge SKIPS the live RPC balance read, so the test passes ONLINE too
//     (no network; the fake wallet's real balance would otherwise be 0 -> insufficient_balance).
// UBI_DRY_RUN=1 so NOTHING is sent on-chain; the overspend test injects opts.balanceFn (no RPC).
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { distribute } from "../distribute-ubi.mjs";

const SELF = "0x9999999999999999999999999999999999999999";
const CHILD = "0x1111111111111111111111111111111111111111";

test("legacy distributor is permanently gated by the essentials-only policy", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ubi-"));
  const childrenFile = path.join(dir, "children.jsonl");
  const ubiLedger = path.join(dir, "ubi-ledger.jsonl");
  // child-spec.js:37 shape: the wallet is under `wallet`, status active.
  await fs.writeFile(childrenFile, JSON.stringify({ child_id: "anicca-c001", wallet: CHILD, status: "active" }) + "\n");
  // EXACT run.sh 0xwork $JSON shape: earn_usdc/cost_usdc + external:true, but NO net_usdc.
  const rawLine = { wallet: SELF, source: "0xwork", task: "t1", earn_usdc: 1.0, cost_usdc: 0, tx: "0x" + "a".repeat(64), status: "0x1", external: true, wake: "w-derive" };
  process.env.UBI_DRY_RUN = "1";
  process.env.UBI_MIN_POOL_USDC = "0.0001";
  delete process.env.UBI_HUMAN_WALLETS; // AI-only: forces the children.jsonl `wallet` read to matter
  const { line } = await distribute(rawLine, { childrenFile, ubiLedger });
  assert.equal(line.outcome, "skipped");
  assert.equal(line.reason, "cash_distribution_retired_essentials_only");
  assert.equal(line.recipients, 0);
  assert.equal(line.pool_usdc, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test("legacy distributor never reaches balance or transfer code", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ubi-"));
  const childrenFile = path.join(dir, "children.jsonl");
  const ubiLedger = path.join(dir, "ubi-ledger.jsonl");
  await fs.writeFile(childrenFile, JSON.stringify({ child_id: "anicca-c001", wallet: CHILD, status: "active" }) + "\n");
  const rawLine = { wallet: SELF, source: "0xwork", task: "t1", earn_usdc: 1.0, cost_usdc: 0, tx: "0x" + "a".repeat(64), status: "0x1", external: true, wake: "w-overspend" };
  delete process.env.UBI_DRY_RUN;                // real path -> the live-balance guard is active
  process.env.UBI_MIN_POOL_USDC = "0.0001";
  delete process.env.UBI_HUMAN_WALLETS;
  let balanceCalls = 0;
  const { line, sent } = await distribute(rawLine, {
    childrenFile,
    ubiLedger,
    balanceFn: async () => { balanceCalls += 1; return 100; },
  });
  assert.equal(sent, false);
  assert.equal(line.outcome, "skipped");
  assert.equal(line.reason, "cash_distribution_retired_essentials_only");
  assert.equal(balanceCalls, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

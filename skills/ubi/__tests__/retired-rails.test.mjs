import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { submitTransfer } from "../bridge-payout.mjs";
import { submitOfframp as submitCrossmintOfframp } from "../crossmint-offramp.mjs";
import { submitOfframp as submitKotaniOfframp } from "../kotani-payout.mjs";
import { createTransaction } from "../fern-payout.mjs";
import { bankWatcherPass } from "../bank-watcher.mjs";
import { makeGmoAdapter, pass, pollPass, reconcilePass } from "../bank-payout-watcher.mjs";

const reason = /cash_distribution_retired_essentials_only/;

test("every exported recipient payout submitter fails before calling its transport", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("transport must not be called");
  };
  await assert.rejects(submitTransfer({}, { apiKey: "x", fetchImpl }), reason);
  await assert.rejects(submitCrossmintOfframp({}, { apiKey: "x", fetchImpl }), reason);
  await assert.rejects(submitKotaniOfframp({}, { apiKey: "x", fetchImpl }), reason);
  await assert.rejects(createTransaction({ quoteId: "legacy" }), reason);
  assert.equal(calls, 0);
});

test("the optional GDA module gates its send before invoking the wallet adapter", async () => {
  const source = await readFile(fileURLToPath(new URL("../gda-pool.mjs", import.meta.url)), "utf8");
  assert.match(
    source,
    /export async function sendGdaCall[\s\S]*?throw new Error\("cash_distribution_retired_essentials_only"\);\s*}/,
  );
});

test("bank payout orchestration and live passes are gated before reading or mutating recipients", async () => {
  let calls = 0;
  const result = await bankWatcherPass({
    readBankRecipients: async () => { calls += 1; return []; },
  });
  assert.equal(result.reason, "cash_distribution_retired_essentials_only");

  const adapter = makeGmoAdapter({ submit: async () => { calls += 1; } });
  await assert.rejects(adapter([]), reason);

  for (const run of [pass, pollPass, reconcilePass]) {
    const gated = await run();
    assert.equal(gated.reason, "cash_distribution_retired_essentials_only");
  }
  assert.equal(calls, 0);
});

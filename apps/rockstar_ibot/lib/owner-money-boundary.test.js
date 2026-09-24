"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { requirePayoutAuthority } = require("./owner-money-boundary.js");

const COMPLETE = Object.freeze({
  AGENT_WALLET_ADDRESS: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  LM_AGENT_WALLET_PATH: "/protected/kai-wallet.json",
  LM_PAYOUT_RESERVE_USDC_ATOMIC: "46000000",
  LM_PAYOUT_MAX_USDC_ATOMIC: "5000000",
});

test("payout authority has no implicit wallet or unbounded amount fallback", () => {
  const authority = requirePayoutAuthority(COMPLETE);
  assert.equal(authority.walletAddress, COMPLETE.AGENT_WALLET_ADDRESS);
  for (const name of Object.keys(COMPLETE)) {
    const incomplete = { ...COMPLETE };
    delete incomplete[name];
    assert.throws(() => requirePayoutAuthority(incomplete), new RegExp(name));
  }
});

test("payout authority rejects invalid addresses and zero maximums", () => {
  assert.throws(() => requirePayoutAuthority({ ...COMPLETE, AGENT_WALLET_ADDRESS: "old-wallet" }), /EVM address/);
  assert.throws(() => requirePayoutAuthority({ ...COMPLETE, LM_PAYOUT_MAX_USDC_ATOMIC: "0" }), /maximum/);
});

"use strict";

function required(env, name) {
  const value = String((env || {})[name] || "").trim();
  if (!value) throw new Error(`${name} is required; no former-owner or implicit wallet fallback is allowed`);
  return value;
}

function requirePayoutAuthority(env) {
  const walletAddress = required(env, "AGENT_WALLET_ADDRESS");
  const walletPath = required(env, "LM_AGENT_WALLET_PATH");
  const reserveAtomic = required(env, "LM_PAYOUT_RESERVE_USDC_ATOMIC");
  const maxPayoutAtomic = required(env, "LM_PAYOUT_MAX_USDC_ATOMIC");
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error("AGENT_WALLET_ADDRESS must be an explicit EVM address");
  }
  if (!/^\d+$/.test(reserveAtomic) || !/^\d+$/.test(maxPayoutAtomic) || BigInt(maxPayoutAtomic) <= 0n) {
    throw new Error("payout reserve and maximum must be explicit non-negative atomic USDC values");
  }
  return Object.freeze({ walletAddress, walletPath, reserveAtomic, maxPayoutAtomic });
}

module.exports = { requirePayoutAuthority };

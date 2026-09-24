// Kai-owned wallets used only to exclude self-payments from revenue.
// Configure a comma-separated list; there are deliberately no repository defaults.
const ADDRESS = /^0x[0-9a-f]{40}$/;

const configured = [
  ...String(process.env.LIFE_MANAGER_SELF_WALLETS || "").split(","),
  process.env.X402_PAYTO,
  process.env.LIFE_MANAGER_PAY_TO,
]
  .map((value) => String(value || "").trim().toLowerCase())
  .filter((value) => ADDRESS.test(value));

export const SELF_WALLETS = [...new Set(configured)];
export const SELF_WALLET_SET = new Set(SELF_WALLETS);

/** Resolve the one owner-approved endpoint before any wallet is loaded or used. */
export function resolveBuyerTarget(environment = process.env) {
  const raw = String(environment.MR_BOT_X402_BUY_URL || "").trim();
  if (!raw) {
    throw new Error("MR_BOT_X402_BUY_URL is required; no payment target is selected by default");
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new Error("MR_BOT_X402_BUY_URL must be an absolute HTTPS URL");
  }
  if (target.protocol !== "https:") {
    throw new Error("MR_BOT_X402_BUY_URL must use HTTPS");
  }
  if (target.username || target.password) {
    throw new Error("MR_BOT_X402_BUY_URL must not contain credentials");
  }
  if (target.hash) {
    throw new Error("MR_BOT_X402_BUY_URL must not contain a fragment");
  }
  return target.href;
}

// SPDX-License-Identifier: MIT
// runtime/agentmail/inboxes-hermes.ts — closes G1 by provisioning the hermes
// inbox in a sibling AgentMail org.
//
// Historical provisioning utility. It is quarantined and requires explicit
// Kai-owned account values before it can contact AgentMail or Gmail.
//
// The agent-native workaround: client.agent.signUp() creates a brand-new org
// with its own free-plan quota and its own API key. Each sibling Anicca
// instance can hold its own sovereign org without ever touching billing.
//
// Idempotent: if AGENTMAIL_HERMES_API_KEY is present we only confirm the inbox.
import { AgentMailClient } from "agentmail";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const HERMES_USERNAME = "anicca-001-hermes";
const HERMES_HUMAN_EMAIL = String(process.env.HERMES_HUMAN_EMAIL || "").trim();
const GOG_ACCOUNT = String(process.env.GOG_ACCOUNT || "").trim();
const OTP_GMAIL_QUERY = process.env.HERMES_OTP_QUERY ?? "from:agentmail subject:verification";
if (process.env.LIFE_MANAGER_ALLOW_AGENTMAIL_PROVISIONING !== "1"
    || !HERMES_HUMAN_EMAIL || !GOG_ACCOUNT) {
  throw new Error("AgentMail provisioning is quarantined until Kai-owned email values and explicit approval are provided");
}

async function existingHermes(): Promise<{ key: string; inbox: string } | null> {
  const key = process.env.AGENTMAIL_HERMES_API_KEY;
  if (!key) return null;
  const c = new AgentMailClient({ apiKey: key });
  try {
    const list = await c.inboxes.list();
    const inbox = list.inboxes.find(i => (i.email ?? i.inboxId ?? "").startsWith(HERMES_USERNAME));
    if (inbox) return { key, inbox: inbox.email ?? (inbox.inboxId as string) };
  } catch (e) {
    console.warn(`existingHermes() check failed: ${(e as Error).message}`);
  }
  return null;
}

function readOtpFromGmail(): string | null {
  // Use `gog gmail messages list ... --full` and grep for the 6-digit code in the body.
  const r = spawnSync("/opt/homebrew/bin/gog", [
    "gmail", "messages", "list",
    "-a", GOG_ACCOUNT,
    "--max=1",
    OTP_GMAIL_QUERY,
    "--full", "--plain",
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    console.warn(`gog read failed: ${r.stderr}`);
    return null;
  }
  const m = r.stdout.match(/\b(\d{6})\b/);
  return m?.[1] ?? null;
}

const existing = await existingHermes();
if (existing) {
  console.log(`= ${existing.inbox} already provisioned via AGENTMAIL_HERMES_API_KEY`);
  process.exit(0);
}

console.log(`+ no hermes org yet — signing up via human_email=${HERMES_HUMAN_EMAIL}`);
const seedClient = new AgentMailClient({ apiKey: "placeholder" });
const signup = await seedClient.agent.signUp({
  humanEmail: HERMES_HUMAN_EMAIL,
  username: HERMES_USERNAME,
  source: "agentmail-node@0.5.8",
  referrer: "spec-10-anicca-inbox-keeper",
});
console.log(`+ org=${signup.organizationId}  inbox=${signup.inboxId}`);
console.log("  api_key: created (value not printed)");

// Wait + read OTP. agent.verify() is idempotent so retrying is safe.
let otp: string | null = null;
for (let i = 0; i < 10 && !otp; i++) {
  await sleep(5000);
  otp = readOtpFromGmail();
  if (otp) break;
  console.log(`  OTP not yet in gog gmail (${i + 1}/10) …`);
}
if (!otp) {
  console.error("OTP did not arrive within 50s — manual retry via client.agent.verify({otpCode}) when it does");
  process.exit(2);
}
const verifyClient = new AgentMailClient({ apiKey: signup.apiKey });
const result = await verifyClient.agent.verify({ otpCode: otp });
console.log(`+ verified: ${JSON.stringify(result).slice(0, 200)}`);

console.log("\nStore AGENTMAIL_HERMES_API_KEY and AGENTMAIL_HERMES_ORG_ID in the Kai-owned secret store; values are not printed.");
console.log("Then subscribe a webhook and store AGENTMAIL_WEBHOOK_SECRET_HERMES in the same secret store.");
console.log(`then 'launchctl kickstart -k gui/$UID/ai.anicca.agentmail-webhook'.`);

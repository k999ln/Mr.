import { readFile } from "node:fs/promises";

const owner = JSON.parse(await readFile(new URL("../config/owner-public.json", import.meta.url), "utf8"));
const checks = [
  ["公開サイト", Boolean(owner.links?.web), ["config/owner-public.json: links.web"]],
  ["X所有アカウント", Boolean(owner.social?.x), ["config/owner-public.json: social.x"]],
  ["Telegram公開Bot", Boolean(owner.telegram?.botUsername), ["config/owner-public.json: telegram.botUsername"]],
  ["Stripe Payment Link", Boolean(owner.money?.stripePaymentLink || process.env.LM_DORAEMON_PAYMENT_LINK), ["owner money.stripePaymentLink または LM_DORAEMON_PAYMENT_LINK"]],
  ["Core公開URL", Boolean(owner.links?.core || process.env.DORAEMON_CORE_URL || process.env.LM_PUBLIC_URL), ["owner links.core または DORAEMON_CORE_URL"]],
  ["Turnstile", Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY), ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]],
  ["Resend", Boolean(process.env.RESEND_API_KEY && process.env.DORAEMON_MAIL_FROM && process.env.DORAEMON_REPLY_TO), ["RESEND_API_KEY", "DORAEMON_MAIL_FROM", "DORAEMON_REPLY_TO"]],
  ["法定メール表示", Boolean(process.env.DORAEMON_LEGAL_NAME && process.env.DORAEMON_LEGAL_ADDRESS && process.env.DORAEMON_PRIVACY_CONTACT), ["DORAEMON_LEGAL_NAME", "DORAEMON_LEGAL_ADDRESS", "DORAEMON_PRIVACY_CONTACT"]],
];

let ok = true;
console.log("ドラえもん マーケティング運用準備");
for (const [label, passed, needed] of checks) {
  console.log(`${passed ? "READY" : "MISSING"} ${label}`);
  if (!passed) {
    ok = false;
    console.log(`  必要: ${needed.join(", ")}`);
  }
}
console.log("秘密値は表示していません。");
process.exitCode = ok ? 0 : 2;

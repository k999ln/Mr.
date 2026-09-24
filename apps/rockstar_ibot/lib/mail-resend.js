"use strict";
// Own-domain email for the WEB ask/reply loop. We NEVER read the user's Gmail — we SEND from our own
// verified domain via Resend, and route replies back via a short opaque token in the Reply-To local-part
// (reply+<token>@<LM_REPLY_DOMAIN> → the installation's inbound route → POST /inbound-email, which
// looks the token up in lm_ask_log). The CALLER generates the token (newReplyToken) and stores
// token→(uid,eventId) before sending. No operator or repository domain is a safe distribution default.
const RESEND_URL = "https://api.resend.com/emails";

function configuredMailFrom(value) {
  return String(value === undefined ? (process.env.LM_MAIL_FROM || "") : value).trim();
}

function configuredReplyDomain(value) {
  const domain = String(value === undefined ? (process.env.LM_REPLY_DOMAIN || "") : value).trim().toLowerCase();
  if (!domain || domain.includes("/") || domain.includes(":") || /\s|@/.test(domain)) return "";
  try { return new URL(`https://${domain}`).hostname === domain ? domain : ""; }
  catch { return ""; }
}

// reply+<token>@<owner-domain> — the catch-all inbound address. The local part remains under 64 chars.
function replyToFor(token, replyDomain) {
  const domain = configuredReplyDomain(replyDomain);
  if (!token || !domain) return "";
  return `reply+${token}@${domain}`;
}

// Low-level Resend send. Fail-closed (no owner From/key/recipient → {sent:false}), never throws.
async function resendSend({ to, subject, text, replyTo, resendKey, fetchImpl, idempotencyKey, mailFrom }) {
  if (!resendKey) return { sent: false, error: "no RESEND_API_KEY" };
  const from = configuredMailFrom(mailFrom);
  if (!from) return { sent: false, error: "no LM_MAIL_FROM" };
  if (!to || (Array.isArray(to) && to.length === 0) || !subject) return { sent: false, error: "missing to/subject" };
  const f = fetchImpl || fetch;
  try {
    const r = await f(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, reply_to: replyTo }),
    });
    const d = await r.json().catch(() => ({}));
    return { sent: !!r.ok, id: d.id, status: r.status, error: r.ok ? undefined : (d.message || `http ${r.status}`) };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

// Ask the USER where an event is. Reply-To carries the signed token → their reply hits /inbound-email,
// which parses the token, matches the event, and patches the calendar.
async function sendAsk({ to, replyToken, event, resendKey, fetchImpl, mailFrom, replyDomain }) {
  const name = (event && event.summary) || "your event";
  const subject = `Where is “${name}”?`;
  const text =
    `Hi — I'm setting up travel time for “${name}”, but I can't find where it is.\n\n` +
    `Just reply to this email with the address or place name, and I'll add it to your calendar and call you in time.\n\n— Rockstar_ibot`;
  const replyTo = replyToFor(replyToken, replyDomain);
  if (!replyTo) return { sent: false, error: "no LM_REPLY_DOMAIN" };
  return resendSend({ to, subject, text, replyTo, resendKey, fetchImpl, mailFrom });
}

// Tell the ATTENDEES the user is running late. Sent from our domain "on behalf of <userName>"; Reply-To is
// the user's REAL email so attendee replies reach the human directly.
async function sendLateNotice({ toAttendees, userName, event, etaMinutes, userEmail, resendKey, fetchImpl, bodySnapshot, idempotencyKey, mailFrom }) {
  const name = (event && event.summary) || "the meeting";
  const who = userName || "Your contact";
  const subject = `Running late: ${name}`;
  const eta = Number.isFinite(etaMinutes) ? `about ${etaMinutes} minutes` : "a little";
  const text = bodySnapshot ||
    `Hi — ${who} is running ${eta} late to “${name}” and wanted you to know.\n\n` +
    `(Sent automatically by Rockstar_ibot on ${who}'s behalf — reply to reach ${who} directly.)`;
  return resendSend({ to: toAttendees, subject, text, replyTo: userEmail, resendKey, fetchImpl, idempotencyKey, mailFrom });
}

module.exports = { sendAsk, sendLateNotice, resendSend, replyToFor, configuredMailFrom, configuredReplyDomain };

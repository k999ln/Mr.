import { createHash, randomBytes } from "node:crypto";

export function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function makeToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function cleanText(value: unknown, maxLength: number) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function verifyTurnstile(token: string, remoteIp?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  scheduledAt?: Date;
};

export async function sendResendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DORAEMON_MAIL_FROM;
  const replyTo = process.env.DORAEMON_REPLY_TO;
  if (!apiKey || !from || !replyTo) {
    throw new Error("Email delivery is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: replyTo,
      subject: input.subject,
      html: input.html,
      ...(input.scheduledAt ? { scheduled_at: input.scheduledAt.toISOString() } : {}),
    }),
  });

  const payload = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !payload.id) {
    throw new Error(payload.message || `Resend failed (${response.status})`);
  }
  return payload.id;
}

export async function cancelResendEmail(messageId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return response.ok;
}

export function absoluteOrigin(request?: Request) {
  const configured = String(process.env.DORAEMON_PUBLIC_ORIGIN || "").replace(/\/$/, "");
  if (/^https:\/\//.test(configured)) return configured;
  if (request) return new URL(request.url).origin;
  return "";
}

export function emailShell(heading: string, body: string, action?: { label: string; href: string }, unsubscribeUrl?: string) {
  const legalName = process.env.DORAEMON_LEGAL_NAME || "";
  const legalAddress = process.env.DORAEMON_LEGAL_ADDRESS || "";
  const contact = process.env.DORAEMON_PRIVACY_CONTACT || "";
  return `<!doctype html><html lang="ja"><body style="margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"><div style="max-width:620px;margin:0 auto;padding:48px 22px"><p style="font-weight:700">avocadomini / 10</p><div style="background:#fff;border-radius:24px;padding:34px"><h1 style="font-size:28px;line-height:1.25;margin:0 0 18px">${heading}</h1><p style="font-size:16px;line-height:1.75;color:#515154">${body}</p>${action ? `<p style="margin-top:28px"><a href="${action.href}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0071e3;color:white;text-decoration:none">${action.label}</a></p>` : ""}</div>${unsubscribeUrl ? `<p style="font-size:12px;color:#86868b;line-height:1.6;margin-top:22px">このメールは任意の情報配信に同意した方へ送信しています。<a href="${unsubscribeUrl}" style="color:#515154">配信停止</a></p>` : ""}<p style="font-size:11px;color:#86868b;line-height:1.7;margin-top:22px">送信者：${legalName}<br>住所：${legalAddress}<br>問い合わせ先：${contact}</p></div></body></html>`;
}

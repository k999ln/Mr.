import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { leadDownloadTokens, leadEmailSchedules, leadEvents, marketingLeads } from "../../../db/schema";
import { LEAD_ASSET_KEY, NURTURE_SEQUENCE, PRIVACY_VERSION, RESOURCE_CONSENT_TEXT } from "../../../lib/lead-constants";
import { absoluteOrigin, cleanText, emailShell, isValidEmail, makeToken, normalizeEmail, sendResendEmail, sha256, verifyTurnstile } from "../../../lib/lead-server";

export async function POST(request: Request) {
  try {
    if (!process.env.TURNSTILE_SECRET_KEY || !process.env.RESEND_API_KEY || !process.env.DORAEMON_MAIL_FROM || !process.env.DORAEMON_REPLY_TO || !process.env.DORAEMON_LEGAL_NAME || !process.env.DORAEMON_LEGAL_ADDRESS || !process.env.DORAEMON_PRIVACY_CONTACT) {
      return Response.json({ ok: false, message: "受付設定を準備中です。" }, { status: 503 });
    }

    const input = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) return Response.json({ ok: false, message: "有効なメールアドレスを入力してください。" }, { status: 400 });
    if (input.resourceConsent !== true) return Response.json({ ok: false, message: "PDF送付に必要な同意を確認してください。" }, { status: 400 });

    const remoteIp = request.headers.get("cf-connecting-ip");
    const human = await verifyTurnstile(String(input.turnstileToken || ""), remoteIp);
    if (!human) return Response.json({ ok: false, message: "セキュリティ確認をやり直してください。" }, { status: 400 });

    const db = getDb();
    const now = new Date();
    const emailHash = sha256(email);
    const existing = await db.select().from(marketingLeads).where(eq(marketingLeads.emailHash, emailHash)).limit(1);
    const leadId = existing[0]?.id || randomUUID();
    const unsubscribeToken = makeToken();
    const downloadToken = makeToken();
    const marketingConsent = input.marketingConsent === true;
    const shouldScheduleMarketing = marketingConsent && !(existing[0]?.status === "active" && existing[0]?.marketingConsent);
    const effectiveMarketingConsent = existing[0]?.status === "active" && existing[0]?.marketingConsent ? true : marketingConsent;
    const utm = (input.utm || {}) as Record<string, unknown>;
    const channels = Array.isArray(input.channels) ? input.channels.map((v) => cleanText(v, 30)).filter(Boolean).slice(0, 8) : [];
    const row = {
      email,
      emailHash,
      status: "active" as const,
      businessType: cleanText(input.businessType, 80),
      monthlyOrders: cleanText(input.monthlyOrders, 40),
      channelsJson: JSON.stringify(channels),
      primaryBottleneck: cleanText(input.primaryBottleneck, 100),
      telegramUsage: cleanText(input.telegramUsage, 60),
      marketingConsent: effectiveMarketingConsent,
      privacyVersion: PRIVACY_VERSION,
      consentTextHash: sha256(RESOURCE_CONSENT_TEXT),
      consentAt: now,
      unsubscribeTokenHash: shouldScheduleMarketing || !existing[0] ? sha256(unsubscribeToken) : existing[0].unsubscribeTokenHash,
      source: cleanText(utm.source, 100),
      medium: cleanText(utm.medium, 100),
      campaign: cleanText(utm.campaign, 100),
      content: cleanText(utm.content, 100),
      term: cleanText(utm.term, 100),
      updatedAt: now,
      unsubscribedAt: null,
    };
    if (existing[0]) await db.update(marketingLeads).set(row).where(eq(marketingLeads.id, leadId));
    else await db.insert(marketingLeads).values({ id: leadId, ...row, createdAt: now });

    await db.insert(leadDownloadTokens).values({
      tokenHash: sha256(downloadToken), leadId, assetKey: LEAD_ASSET_KEY,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), createdAt: now,
    });
    await db.insert(leadEvents).values({ id: randomUUID(), leadId, eventType: "lead_captured", metadataJson: JSON.stringify({ submittedMarketingConsent: marketingConsent, effectiveMarketingConsent, channels }), createdAt: now });

    const origin = absoluteOrigin(request);
    const downloadUrl = `${origin}/download?token=${encodeURIComponent(downloadToken)}`;
    const unsubscribeUrl = `${origin}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    let delivery: "sent" | "screen_only" = "sent";
    try {
      await sendResendEmail({
        to: email,
        subject: "【無料PDF】販売事故・売上漏れ 10項目診断",
        html: emailShell("販売事故・売上漏れ診断をお届けします。", "10項目を順番に確認すると、自動化の前に塞ぐべき売上漏れが分かります。ダウンロードリンクは7日間有効です。", { label: "診断PDFを開く", href: downloadUrl }),
      });
    } catch (error) {
      delivery = "screen_only";
      await db.insert(leadEvents).values({ id: randomUUID(), leadId, eventType: "resource_email_failed", metadataJson: JSON.stringify({ error: error instanceof Error ? error.message : "unknown" }), createdAt: now });
    }

    if (shouldScheduleMarketing) {
      for (const item of NURTURE_SEQUENCE) {
        const scheduledAt = new Date(now.getTime() + item.days * 24 * 60 * 60 * 1000);
        try {
          const providerMessageId = await sendResendEmail({ to: email, subject: item.subject, html: emailShell(item.heading, item.body, undefined, unsubscribeUrl), scheduledAt });
          await db.insert(leadEmailSchedules).values({ id: randomUUID(), leadId, sequenceKey: item.key, providerMessageId, scheduledAt, status: "scheduled", createdAt: now, updatedAt: now }).onConflictDoNothing();
        } catch (error) {
          await db.insert(leadEvents).values({ id: randomUUID(), leadId, eventType: "email_schedule_failed", metadataJson: JSON.stringify({ sequenceKey: item.key, error: error instanceof Error ? error.message : "unknown" }), createdAt: now });
        }
      }
    }

    return Response.json({
      ok: true,
      downloadUrl,
      delivery,
      message: delivery === "sent" ? "メールを送信しました。この画面からもPDFを受け取れます。" : "メール送信が一時的に失敗しました。この画面からPDFをダウンロードしてください。",
    });
  } catch (error) {
    console.error("lead capture failed", error);
    return Response.json({ ok: false, message: "受付処理に失敗しました。時間を置いて再度お試しください。" }, { status: 500 });
  }
}

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { leadEmailSchedules, leadEvents, marketingLeads } from "../../../db/schema";
import { cancelResendEmail, sha256 } from "../../../lib/lead-server";

export async function POST(request: Request) {
  const input = await request.json() as { token?: string };
  const tokenHash = sha256(String(input.token || ""));
  const db = getDb();
  const leads = await db.select().from(marketingLeads).where(eq(marketingLeads.unsubscribeTokenHash, tokenHash)).limit(1);
  const lead = leads[0];
  if (!lead) return Response.json({ ok: false, message: "配信停止リンクが無効です。" }, { status: 400 });
  const now = new Date();
  await db.update(marketingLeads).set({ status: "unsubscribed", marketingConsent: false, unsubscribedAt: now, updatedAt: now }).where(eq(marketingLeads.id, lead.id));
  const scheduled = await db.select().from(leadEmailSchedules).where(eq(leadEmailSchedules.leadId, lead.id));
  for (const item of scheduled.filter((row) => row.status === "scheduled" && row.providerMessageId)) {
    const canceled = await cancelResendEmail(item.providerMessageId!);
    await db.update(leadEmailSchedules).set({ status: canceled ? "canceled" : "failed", updatedAt: now }).where(eq(leadEmailSchedules.id, item.id));
  }
  await db.insert(leadEvents).values({ id: randomUUID(), leadId: lead.id, eventType: "marketing_unsubscribed", metadataJson: "{}", createdAt: now });
  return Response.json({ ok: true });
}

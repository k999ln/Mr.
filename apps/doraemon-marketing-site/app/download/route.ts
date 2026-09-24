import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { leadDownloadTokens, leadEvents } from "../../db/schema";
import { LEAD_ASSET_KEY, LEAD_ASSET_PATH } from "../../lib/lead-constants";
import { sha256 } from "../../lib/lead-server";
import { randomUUID } from "node:crypto";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return new Response("リンクが無効です。", { status: 400 });
  const db = getDb();
  const rows = await db.select().from(leadDownloadTokens).where(and(
    eq(leadDownloadTokens.tokenHash, sha256(token)),
    eq(leadDownloadTokens.assetKey, LEAD_ASSET_KEY),
    gt(leadDownloadTokens.expiresAt, new Date()),
  )).limit(1);
  const row = rows[0];
  if (!row) return new Response("リンクの有効期限が切れています。もう一度フォームから取得してください。", { status: 410 });
  const now = new Date();
  await db.update(leadDownloadTokens).set({ downloadCount: sql`${leadDownloadTokens.downloadCount} + 1`, firstDownloadedAt: row.firstDownloadedAt || now }).where(eq(leadDownloadTokens.tokenHash, row.tokenHash));
  await db.insert(leadEvents).values({ id: randomUUID(), leadId: row.leadId, eventType: "resource_downloaded", metadataJson: JSON.stringify({ assetKey: LEAD_ASSET_KEY }), createdAt: now });
  return Response.redirect(new URL(LEAD_ASSET_PATH, request.url), 302);
}

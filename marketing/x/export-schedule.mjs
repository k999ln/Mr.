import { readFile, writeFile } from "node:fs/promises";

const start = process.env.START_DATE || "2026-09-02";
const source = JSON.parse(await readFile(new URL("./posts.json", import.meta.url), "utf8"));
const times = { "朝": "09:00", "昼": "13:00", "夜": "20:00" };
const base = new Date(`${start}T00:00:00+09:00`);
const csvRows = [["day", "slot", "scheduled_at_jst", "type", "theme", "text", "thread_json", "cta", "asset", "claim_status"]];

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

for (const post of source) {
  const date = new Date(base.getTime() + (post.day - 1) * 86400000);
  const yyyyMmDd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const scheduledAt = `${yyyyMmDd} ${times[post.slot]} Asia/Tokyo`;
  csvRows.push([post.day, post.slot, scheduledAt, post.type, post.theme, post.text, JSON.stringify(post.thread || []), post.cta, post.asset, post.claim_status]);
}

const output = csvRows.map((row) => row.map(csv).join(",")).join("\n") + "\n";
await writeFile(new URL("./schedule.csv", import.meta.url), output, "utf8");
console.log(`Wrote ${source.length} scheduled posts from ${start}`);

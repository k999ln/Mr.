#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const START_MARKER = "<!-- hourly-repository-sync:start -->";
export const END_MARKER = "<!-- hourly-repository-sync:end -->";

export function formatUtcHour(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("README sync time must be a valid date");
  }
  date.setUTCMinutes(0, 0, 0);
  return `${date.toISOString().slice(0, 13).replace("T", " ")}:00 UTC`;
}

export function renderSyncBlock({ syncedAt, branch, trackedFiles, runReceipt }) {
  return [
    START_MARKER,
    "## 毎時リポジトリ同期",
    "",
    "| 項目 | 状態 |",
    "|---|---|",
    `| 最終自動同期 | ${syncedAt} |`,
    `| 対象ブランチ | \`${branch}\` |`,
    `| 追跡ファイル | ${trackedFiles.toLocaleString("en-US")}件 |`,
    `| 実行receipt | ${runReceipt} |`,
    "",
    "> この範囲は毎時のGitHub Actionsが更新します。製品説明や運用状態は、根拠となる変更と同じcommitで本文を更新します。",
    END_MARKER,
  ].join("\n");
}

function insertionOffset(readme) {
  const firstQuote = readme.search(/^> /m);
  if (firstQuote >= 0) {
    const quoteEnd = readme.indexOf("\n\n", firstQuote);
    if (quoteEnd >= 0) return quoteEnd + 2;
  }

  const firstHeadingEnd = readme.indexOf("\n");
  return firstHeadingEnd >= 0 ? firstHeadingEnd + 1 : readme.length;
}

export function upsertSyncBlock(readme, block) {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
    throw new Error("README hourly sync markers are incomplete or out of order");
  }

  if (start >= 0) {
    const existing = readme.slice(start, end + END_MARKER.length);
    if (existing === block) return readme;
    return `${readme.slice(0, start)}${block}${readme.slice(end + END_MARKER.length)}`;
  }

  const offset = insertionOffset(readme);
  return `${readme.slice(0, offset)}${block}\n\n${readme.slice(offset)}`;
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

export async function updateReadme({ now = process.env.README_SYNC_AT || new Date() } = {}) {
  const repositoryRoot = git(["rev-parse", "--show-toplevel"]);
  const readmePath = path.join(repositoryRoot, "README.md");
  const syncedAt = formatUtcHour(now);
  const branch = process.env.GITHUB_REF_NAME || git(["branch", "--show-current"]) || "main";
  const trackedFiles = git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean).length;
  const runReceipt = process.env.GITHUB_SERVER_URL
    && process.env.GITHUB_REPOSITORY
    && process.env.GITHUB_RUN_ID
    ? `[run ${process.env.GITHUB_RUN_ID}](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID})`
    : "ローカル実行";
  const original = await readFile(readmePath, "utf8");
  const block = renderSyncBlock({ syncedAt, branch, trackedFiles, runReceipt });
  const updated = upsertSyncBlock(original, block);

  if (updated === original) {
    process.stdout.write(`README.md is already synchronized for ${syncedAt}.\n`);
    return false;
  }

  await writeFile(readmePath, updated, "utf8");
  process.stdout.write(`README.md synchronized for ${syncedAt}.\n`);
  return true;
}

const isDirectRun = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  await updateReadme();
}

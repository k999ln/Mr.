import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  END_MARKER,
  START_MARKER,
  formatUtcHour,
  renderSyncBlock,
  upsertSyncBlock,
} from "../scripts/update-readme-hourly.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("formats and rounds the synchronization time to a UTC hour", () => {
  assert.equal(formatUtcHour("2026-09-04T18:47:22-04:00"), "2026-09-04 22:00 UTC");
  assert.throws(() => formatUtcHour("not-a-date"), /valid date/);
});

test("inserts one generated block and remains idempotent during the same hour", () => {
  const syncedAt = "2026-09-04 22:00 UTC";
  const block = renderSyncBlock({
    syncedAt,
    branch: "main",
    trackedFiles: 7075,
    runReceipt: "[run 123](https://github.com/example/repo/actions/runs/123)",
  });
  const source = "# avocadomini\n\n説明です。\n\n> 現在の状態です。\n\n[リンク](docs)\n";
  const once = upsertSyncBlock(source, block);
  const twice = upsertSyncBlock(once, block);

  assert.equal(twice, once);
  assert.equal(once.split(START_MARKER).length - 1, 1);
  assert.equal(once.split(END_MARKER).length - 1, 1);
  assert.ok(once.indexOf(END_MARKER) < once.indexOf("[リンク]"));
});

test("replaces the generated block on a later hour", () => {
  const firstAt = "2026-09-04 22:00 UTC";
  const secondAt = "2026-09-04 23:00 UTC";
  const first = renderSyncBlock({
    syncedAt: firstAt,
    branch: "main",
    trackedFiles: 1,
    runReceipt: "[run 1](https://github.com/example/repo/actions/runs/1)",
  });
  const second = renderSyncBlock({
    syncedAt: secondAt,
    branch: "main",
    trackedFiles: 2,
    runReceipt: "[run 2](https://github.com/example/repo/actions/runs/2)",
  });
  const source = upsertSyncBlock("# title\n\nbody\n", first);
  const updated = upsertSyncBlock(source, second);

  assert.match(updated, /2026-09-04 23:00 UTC/);
  assert.match(updated, /actions\/runs\/2/);
  assert.doesNotMatch(updated, /actions\/runs\/1/);
  assert.equal(updated.split(START_MARKER).length - 1, 1);
});

test("workflow runs hourly and grants only the required repository write scope", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github/workflows/hourly-readme-sync.yml"),
    "utf8",
  );

  assert.match(workflow, /cron: ["']17 \* \* \* \*["']/);
  assert.match(workflow, /permissions:\n  contents: write/);
  assert.match(workflow, /node scripts\/update-readme-hourly\.mjs/);
  assert.match(workflow, /git status --porcelain=v1 --untracked-files=all/);
  assert.match(workflow, /git add -- README\.md/);
  assert.match(workflow, /refusing to force-push/);
  assert.doesNotMatch(workflow, /git push[^\n]*--force/);
});

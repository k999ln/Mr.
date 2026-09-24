import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../.github/workflows/deploy-avocadomini-core.yml", import.meta.url), "utf8");
const vercel = await readFile(new URL("../.github/workflows/deploy-vercel-compat.yml", import.meta.url), "utf8");

test("Core deployment verifies the exact SHA, durable boundaries, and public health before success", () => {
  assert.match(core, /RAILWAY_PROJECT_ID: 334bb7a0-5431-4863-b6b3-9793b6063c3a/);
  assert.match(core, /RAILWAY_SERVICE: avocadomini-core/);
  assert.match(core, /LM_BUILD_SHA=\$GITHUB_SHA/);
  assert.match(core, /npm run test:doraemon-runtime/);
  assert.match(core, /npm audit --omit=dev --audit-level=moderate/);
  assert.match(core, /x\.build!==process\.argv\[2\]/);
  assert.match(core, /secrets\.RAILWAY_TOKEN/);
  assert.doesNotMatch(core, /vvvv|Mr\.\.git|LM_TELEGRAM_BOT_TOKEN=/);
});

test("Vercel deployment preserves every route while keeping its token encrypted", () => {
  assert.match(vercel, /VERCEL_PROJECT_ID: prj_6wzteHyxCBahc6ZwG24AEm0kDg0Q/);
  assert.match(vercel, /secrets\.VERCEL_TOKEN/);
  assert.match(vercel, /vercel@59\.11\.7 deploy --prebuilt --prod/);
  assert.match(vercel, /307 https:\/\/effect-os-verified\.kirin-999\.chatgpt\.site\/start\?tools=request%2Ccheck/);
  assert.doesNotMatch(vercel, /vvvv|Mr\.\.git/);
});


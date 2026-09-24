import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveBuyerTarget } from "../lib/buyer-target.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("paid buyers have no implicit target", () => {
  assert.throws(() => resolveBuyerTarget({}), /is required/);
});

test("paid buyers reject plaintext, embedded credentials, and fragments", () => {
  assert.throws(
    () => resolveBuyerTarget({ MR_BOT_X402_BUY_URL: "http://seller.example/item" }),
    /HTTPS/,
  );
  assert.throws(
    () => resolveBuyerTarget({ MR_BOT_X402_BUY_URL: "https://user:pass@seller.example/item" }),
    /credentials/,
  );
  assert.throws(
    () => resolveBuyerTarget({ MR_BOT_X402_BUY_URL: "https://seller.example/item#approval" }),
    /fragment/,
  );
});

test("paid buyers accept an explicit HTTPS target", () => {
  assert.equal(
    resolveBuyerTarget({ MR_BOT_X402_BUY_URL: "https://seller.example/item?q=1" }),
    "https://seller.example/item?q=1",
  );
});

test("paid buyers do not contain the retired host or BUY_URL fallback", () => {
  for (const name of ["buyer-cdp-v2.mjs", "verify-settle-fail-replay.mjs"]) {
    const source = readFileSync(join(here, "..", name), "utf8");
    assert.doesNotMatch(source, /aniccanomac-mini-1|BUY_URL\s*\|\|/);
    assert.match(source, /resolveBuyerTarget\(\)/);
    assert.ok(source.indexOf("resolveBuyerTarget()") < source.indexOf("loadEvmKey()"));
  }

  const compatibilitySource = readFileSync(join(here, "..", "buyer-cdp.mjs"), "utf8");
  assert.match(compatibilitySource, /import\("\.\/buyer-cdp-v2\.mjs"\)/);
  assert.doesNotMatch(compatibilitySource, /x402-fetch|loadEvmKey|BUY_URL/);
});

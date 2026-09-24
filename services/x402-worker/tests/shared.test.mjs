import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_USDC,
  ROUTE,
  discoveryDocument,
  openApiDocument,
  parseReceiptJson,
  paymentHeaders,
  paymentRequirements,
  verifyReceipt,
} from "../shared.mjs";

const PAY_TO = "0x1111111111111111111111111111111111111111";

test("both adapters receive one canonical payment contract", () => {
  const resource = `https://example.test${ROUTE}`;
  const requirement = paymentRequirements(resource, PAY_TO);
  const headers = paymentHeaders(PAY_TO);
  assert.equal(requirement.resource, resource);
  assert.equal(requirement.payTo, PAY_TO);
  assert.equal(requirement.asset, BASE_USDC);
  assert.equal(headers["x402-pay-to"], PAY_TO);
  assert.equal(headers["x402-asset"], BASE_USDC);
  assert.equal(discoveryDocument("https://example.test", PAY_TO).resources[0].payTo, PAY_TO);
  assert.ok(openApiDocument("https://example.test").paths[ROUTE]);
});

test("receipt parser fails closed for invalid and incomplete input", () => {
  assert.equal(parseReceiptJson("not-json"), null);
  assert.equal(parseReceiptJson(JSON.stringify({ chain_id: 8453 })), null);
});

test("verification rejects wrong recipient before touching nonce storage", async () => {
  let nonceCalls = 0;
  const result = await verifyReceipt({
    chain_id: 8453,
    verifying_contract: BASE_USDC,
    from: "0x2222222222222222222222222222222222222222",
    to: "0x3333333333333333333333333333333333333333",
    value_atomic: "1000",
    valid_after: "0",
    valid_before: "9999999999",
    nonce: `0x${"1".repeat(64)}`,
    signature: `0x${"2".repeat(130)}`,
  }, {
    payTo: PAY_TO,
    nonceSeen: async () => { nonceCalls += 1; return false; },
    nonceMark: async () => { nonceCalls += 1; },
  });
  assert.deepEqual(result, { ok: false, reason: "wrong_pay_to" });
  assert.equal(nonceCalls, 0);
});

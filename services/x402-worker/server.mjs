// Standalone Node adapter for the canonical x402 contract in shared.mjs.
// Only HTTP and on-disk nonce storage are runtime-specific here.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  ROUTE,
  discoveryDocument,
  openApiDocument,
  parseReceiptJson,
  paymentHeaders,
  paymentRequirements,
  verifyReceipt,
} from "./shared.mjs";

const PAY_TO = String(process.env.LIFE_MANAGER_PAY_TO || "").trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(PAY_TO)) throw new Error("LIFE_MANAGER_PAY_TO is required");
const PORT = Number(process.env.PORT || 8402);
const NONCE_FILE = path.join(process.env.STATE_DIR || ".", "nonces.json");

function loadNonces() {
  try { return JSON.parse(fs.readFileSync(NONCE_FILE, "utf8")); } catch { return {}; }
}

function nonceSeen(key) {
  const all = loadNonces();
  return Boolean(all[key] && all[key] > Math.floor(Date.now() / 1000));
}

function nonceMark(key) {
  const all = loadNonces();
  all[key] = Math.floor(Date.now() / 1000) + 86400;
  fs.writeFileSync(NONCE_FILE, JSON.stringify(all));
}

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function send402(res, resource) {
  send(res, 402, {
    x402Version: 2,
    error: "payment required",
    accepts: [paymentRequirements(resource, PAY_TO)],
  }, paymentHeaders(PAY_TO));
}

function parseReceipt(header) {
  try {
    return parseReceiptJson(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health") {
    return send(res, 200, { ok: true, service: "rockstar_ibot-x402", wave: 2 });
  }
  if (url.pathname === "/.well-known/x402") {
    return send(res, 200, discoveryDocument(url.origin, PAY_TO));
  }
  if (url.pathname === "/openapi.json") {
    return send(res, 200, openApiDocument(url.origin));
  }
  if (url.pathname !== ROUTE) return send(res, 404, { error: "no such route" });

  const header = req.headers["x-payment"];
  if (!header) return send402(res, url.origin + ROUTE);
  const receipt = parseReceipt(Array.isArray(header) ? header[0] : header);
  if (!receipt) return send(res, 402, { error: "invalid_receipt", reason: "unparseable" });
  const result = await verifyReceipt(receipt, { payTo: PAY_TO, nonceSeen, nonceMark });
  if (!result.ok) return send(res, 402, { error: "invalid_receipt", reason: result.reason });
  return send(res, 200, {
    ok: true,
    service: "rockstar_ibot-x402",
    buyer: result.buyer,
    served_at: Math.floor(Date.now() / 1000),
  });
});

server.listen(PORT, () => console.log(`x402-serve listening on :${PORT} pay_to=${PAY_TO}`));

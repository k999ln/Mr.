// Cloudflare Worker adapter for the canonical x402 contract in shared.mjs.
// Only Request/Response handling and KV nonce storage are runtime-specific here.
import {
  ROUTE,
  discoveryDocument,
  openApiDocument,
  parseReceiptJson,
  paymentHeaders,
  paymentRequirements,
  verifyReceipt,
} from "./shared.mjs";

interface Env {
  NONCE_KV: KVNamespace;
  LIFE_MANAGER_PAY_TO: string;
}

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(extraHeaders ?? {}) },
  });
}

function send402(resource: string, payTo: string): Response {
  return json(402, {
    x402Version: 2,
    error: "payment required",
    accepts: [paymentRequirements(resource, payTo)],
  }, paymentHeaders(payTo));
}

function parseReceipt(header: string) {
  try {
    return parseReceiptJson(atob(header));
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const payTo = String(env.LIFE_MANAGER_PAY_TO || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
      return json(503, { ok: false, error: "owner_wallet_not_configured" });
    }
    if (url.pathname === "/health") {
      return json(200, { ok: true, service: "rockstar_ibot-x402", wave: 2 });
    }
    if (url.pathname === "/.well-known/x402") {
      return json(200, discoveryDocument(url.origin, payTo));
    }
    if (url.pathname === "/openapi.json") {
      return json(200, openApiDocument(url.origin));
    }
    if (url.pathname !== ROUTE) return json(404, { error: "no such route" });

    const header = request.headers.get("x-payment");
    if (!header) return send402(url.origin + ROUTE, payTo);
    const receipt = parseReceipt(header);
    if (!receipt) return json(402, { error: "invalid_receipt", reason: "unparseable" });

    const result = await verifyReceipt(receipt, {
      payTo,
      nonceSeen: async (key: string) => Boolean(await env.NONCE_KV.get(key)),
      nonceMark: async (key: string) => env.NONCE_KV.put(key, "1", { expirationTtl: 86400 }),
    });
    if (!result.ok) return json(402, { error: "invalid_receipt", reason: result.reason });
    return json(200, {
      ok: true,
      service: "rockstar_ibot-x402",
      buyer: result.buyer,
      served_at: Math.floor(Date.now() / 1000),
    });
  },
} satisfies ExportedHandler<Env>;

export const BASE_CHAIN_ID = 8453;
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const PRICE_ATOMIC = 1000n;
export const ROUTE = "/paid";

const REQUIRED_FIELDS = [
  "chain_id",
  "verifying_contract",
  "from",
  "to",
  "value_atomic",
  "valid_after",
  "valid_before",
  "nonce",
  "signature",
];

const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function paymentRequirements(resource, payTo) {
  return {
    scheme: "exact",
    network: "eip155:8453",
    asset: BASE_USDC,
    amount: PRICE_ATOMIC.toString(),
    payTo,
    resource,
    description: "Paid echo endpoint — pay 0.001 USDC on Base to receive a signed 200.",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
    extensions: {
      bazaar: {
        info: {
          input: { type: "http", method: "GET" },
          output: {
            type: "json",
            example: { ok: true, service: "life-manager-x402", buyer: "0x…", served_at: 0 },
          },
        },
      },
    },
  };
}

export function paymentHeaders(payTo) {
  return {
    "WWW-Authenticate":
      `x402 network="base", asset="${BASE_USDC}", amount="${PRICE_ATOMIC}", ` +
      `pay_to="${payTo}", chain_id="${BASE_CHAIN_ID}", route="${ROUTE}"`,
    "x402-network": "base",
    "x402-asset": BASE_USDC,
    "x402-amount": PRICE_ATOMIC.toString(),
    "x402-pay-to": payTo,
    "x402-chain-id": String(BASE_CHAIN_ID),
  };
}

export function discoveryDocument(origin, payTo) {
  const resource = origin + ROUTE;
  return {
    x402Version: 2,
    resources: [{ resource, ...paymentRequirements(resource, payTo) }],
  };
}

export function openApiDocument(origin) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Rockstar_ibot x402 paid echo",
      version: "1.0.0",
      description: "Pay 0.001 USDC on Base (EIP-3009) to receive a signed 200.",
    },
    servers: [{ url: origin }],
    paths: {
      [ROUTE]: {
        get: {
          operationId: "paidEcho",
          summary: "Paid echo — returns a signed 200 after x402 payment",
          "x-payment-info": { x402: {} },
          responses: { "200": { description: "OK" }, "402": { description: "Payment Required" } },
        },
      },
    },
  };
}

export function parseReceiptJson(raw) {
  try {
    const receipt = JSON.parse(raw);
    if (!receipt || typeof receipt !== "object") return null;
    for (const field of REQUIRED_FIELDS) {
      if (receipt[field] === undefined || receipt[field] === null) return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

async function recoverSigner(receipt) {
  try {
    const { recoverTypedDataAddress } = await import("viem");
    const domain = {
      name: "USD Coin",
      version: "2",
      chainId: Number(receipt.chain_id),
      verifyingContract: receipt.verifying_contract,
    };
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    const message = {
      from: receipt.from,
      to: receipt.to,
      value: BigInt(receipt.value_atomic),
      validAfter: BigInt(receipt.valid_after),
      validBefore: BigInt(receipt.valid_before),
      nonce: receipt.nonce,
    };
    return await recoverTypedDataAddress({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message,
      signature: receipt.signature,
    });
  } catch {
    return null;
  }
}

export async function verifyReceipt(receipt, { payTo, nonceSeen, nonceMark, nowSeconds }) {
  try {
    if (!eq(receipt.to, payTo)) return { ok: false, reason: "wrong_pay_to" };
    if (Number(receipt.chain_id) !== BASE_CHAIN_ID) return { ok: false, reason: "wrong_chain" };
    if (!eq(receipt.verifying_contract, BASE_USDC)) return { ok: false, reason: "wrong_asset" };
    if (BigInt(receipt.value_atomic) < PRICE_ATOMIC) return { ok: false, reason: "insufficient_amount" };
    const now = nowSeconds ? nowSeconds() : Math.floor(Date.now() / 1000);
    if (Number(receipt.valid_after) > now) return { ok: false, reason: "not_yet_valid" };
    if (Number(receipt.valid_before) <= now) return { ok: false, reason: "expired" };

    const recovered = await recoverSigner(receipt);
    if (!recovered) return { ok: false, reason: "bad_signature" };
    if (!eq(recovered, receipt.from)) return { ok: false, reason: "signer_not_from" };
    if (eq(recovered, payTo)) return { ok: false, reason: "self_signed_rejected" };

    const nonceKey = `nonce:${String(receipt.from).toLowerCase()}:${String(receipt.nonce).toLowerCase()}`;
    if (await nonceSeen(nonceKey)) return { ok: false, reason: "nonce_replay" };
    await nonceMark(nonceKey);
    return { ok: true, buyer: recovered };
  } catch {
    return { ok: false, reason: "malformed_fields" };
  }
}

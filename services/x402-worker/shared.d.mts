export const BASE_CHAIN_ID: number;
export const BASE_USDC: string;
export const PRICE_ATOMIC: bigint;
export const ROUTE: string;

export interface PaymentReceipt {
  chain_id: number | string;
  verifying_contract: string;
  from: string;
  to: string;
  value_atomic: number | string;
  valid_after: number | string;
  valid_before: number | string;
  nonce: string;
  signature: string;
}

export interface PaymentRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
  extensions: Record<string, unknown>;
}

export function paymentRequirements(resource: string, payTo: string): PaymentRequirement;
export function paymentHeaders(payTo: string): Record<string, string>;
export function discoveryDocument(origin: string, payTo: string): Record<string, unknown>;
export function openApiDocument(origin: string): Record<string, unknown>;
export function parseReceiptJson(raw: string): PaymentReceipt | null;
export function verifyReceipt(
  receipt: PaymentReceipt,
  options: {
    payTo: string;
    nonceSeen: (key: string) => boolean | Promise<boolean>;
    nonceMark: (key: string) => void | Promise<void>;
    nowSeconds?: () => number;
  },
): Promise<{ ok: true; buyer: string } | { ok: false; reason: string }>;

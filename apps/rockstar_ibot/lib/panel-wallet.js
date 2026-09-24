"use strict";

const crypto = require("node:crypto");
const { getAddress, isAddress, verifyMessage } = require("viem");

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = "0x2105";
const BASE_NETWORK = "eip155:8453";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const NONCE_RE = /^[A-Za-z0-9]{8,64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

function walletError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function normalizeWalletAddress(value) {
  const raw = String(value || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || !isAddress(raw, { strict: true })) {
    throw walletError("wallet_address_invalid");
  }
  try {
    return getAddress(raw);
  } catch {
    throw walletError("wallet_address_invalid");
  }
}

function panelOrigin(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw walletError("wallet_origin_unavailable", 503); }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw walletError("wallet_origin_unavailable", 503);
  }
  return url.origin;
}

function walletChallengeMessage(input = {}) {
  const origin = panelOrigin(input.origin);
  const address = normalizeWalletAddress(input.address);
  const nonce = String(input.nonce || "");
  if (!NONCE_RE.test(nonce)) throw walletError("wallet_challenge_invalid");
  const issuedAt = new Date(input.issuedAt);
  const expiresAt = new Date(input.expiresAt);
  if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || expiresAt <= issuedAt) {
    throw walletError("wallet_challenge_invalid");
  }
  const authority = new URL(origin).host;
  return `${authority} wants you to sign in with your Ethereum account:\n${address}\n\n` +
    "Register this address as the Base USDC payout destination for this Rockstar_ibot account.\n\n" +
    `URI: ${origin}/panel\n` +
    "Version: 1\n" +
    `Chain ID: ${BASE_CHAIN_ID}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt.toISOString()}\n` +
    `Expiration Time: ${expiresAt.toISOString()}`;
}

function scoped(scope) {
  const uid = String(scope && scope.uid || "").trim();
  const chatId = String(scope && scope.chatId || "").trim();
  if (!uid || !chatId) throw walletError("unauthorized", 401);
  return { uid, chatId };
}

async function issueWalletChallenge(scope, input, opts = {}) {
  if (!exactKeys(input, ["address"])) throw walletError("wallet_request_invalid");
  const owner = scoped(scope);
  const address = normalizeWalletAddress(input.address);
  const origin = panelOrigin(opts.panelOrigin || opts.panelBaseUrl);
  const random = (opts.randomBytes || crypto.randomBytes)(48);
  if (!Buffer.isBuffer(random) || random.length !== 48) throw walletError("wallet_challenge_unavailable", 503);
  const challenge = random.subarray(0, 32).toString("base64url");
  const nonce = random.subarray(32).toString("hex");
  const nowMs = opts.nowMs == null ? Date.now() : opts.nowMs;
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + CHALLENGE_TTL_MS).toISOString();
  const message = walletChallengeMessage({ origin, address, nonce, issuedAt, expiresAt });
  const store = opts.store;
  if (!store || typeof store.createWalletChallenge !== "function") {
    throw walletError("wallet_challenge_unavailable", 503);
  }
  const created = await store.createWalletChallenge(owner, {
    challengeHash: crypto.createHash("sha256").update(challenge).digest("hex"),
    address,
    nonce,
    message,
    issuedAt,
    expiresAt,
  });
  if (!created) throw walletError("wallet_challenge_unavailable", 503);
  return {
    challenge,
    address,
    message,
    chainId: BASE_CHAIN_ID,
    chainHex: BASE_CHAIN_HEX,
    network: BASE_NETWORK,
    asset: "USDC",
    expiresAt,
  };
}

function challengeRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  return {
    uid: String(row.uid || ""),
    chatId: String(row.chatId || row.chat_id || ""),
    address: String(row.address || ""),
    nonce: String(row.nonce || ""),
    message: String(row.message || ""),
    issuedAt: String(row.issuedAt || row.issued_at || ""),
    expiresAt: String(row.expiresAt || row.expires_at || ""),
    usedAt: row.usedAt || row.used_at || null,
  };
}

async function verifyWalletChallenge(scope, input, opts = {}) {
  if (!exactKeys(input, ["challenge", "address", "signature"])) throw walletError("wallet_request_invalid");
  const owner = scoped(scope);
  const challenge = String(input.challenge || "");
  if (!CHALLENGE_RE.test(challenge)) throw walletError("wallet_challenge_invalid");
  const address = normalizeWalletAddress(input.address);
  const signature = String(input.signature || "");
  if (!SIGNATURE_RE.test(signature)) throw walletError("wallet_signature_invalid");
  const store = opts.store;
  if (!store || typeof store.readWalletChallenge !== "function" || typeof store.commitWalletConnection !== "function") {
    throw walletError("wallet_verification_unavailable", 503);
  }
  const challengeHash = crypto.createHash("sha256").update(challenge).digest("hex");
  const row = challengeRow(await store.readWalletChallenge(owner, challengeHash, address));
  if (!row || row.uid !== owner.uid || row.chatId !== owner.chatId || row.usedAt) {
    throw walletError("wallet_challenge_rejected", 409);
  }
  const expiresAtMs = Date.parse(row.expiresAt);
  const nowMs = opts.nowMs == null ? Date.now() : opts.nowMs;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) throw walletError("wallet_challenge_expired", 410);
  const expectedMessage = walletChallengeMessage({
    origin: opts.panelOrigin || opts.panelBaseUrl,
    address,
    nonce: row.nonce,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
  });
  if (row.address !== address || row.message !== expectedMessage) throw walletError("wallet_challenge_rejected", 409);
  let valid = false;
  try {
    valid = await (opts.verifyMessageImpl || verifyMessage)({ address, message: expectedMessage, signature });
  } catch { valid = false; }
  if (!valid) throw walletError("wallet_signature_rejected", 403);
  const signatureHash = crypto.createHash("sha256").update(signature.toLowerCase()).digest("hex");
  const destination = await store.commitWalletConnection(owner, { challengeHash, address, signatureHash });
  if (!destination || destination.type !== "wallet" || destination.status !== "usable"
    || normalizeWalletAddress(destination.address) !== address
    || destination.network !== BASE_NETWORK || destination.asset !== "USDC") {
    throw walletError("wallet_registration_failed", 409);
  }
  return {
    address,
    shortAddress: `${address.slice(0, 6)}…${address.slice(-4)}`,
    provider: "metamask",
    chainId: BASE_CHAIN_ID,
    network: BASE_NETWORK,
    asset: "USDC",
  };
}

module.exports = {
  BASE_CHAIN_ID,
  BASE_CHAIN_HEX,
  BASE_NETWORK,
  BASE_USDC,
  CHALLENGE_TTL_MS,
  normalizeWalletAddress,
  walletChallengeMessage,
  issueWalletChallenge,
  verifyWalletChallenge,
};

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { privateKeyToAccount } = require("viem/accounts");
const { handlePanelApiRequest } = require("./panel-api.js");

const {
  BASE_CHAIN_ID,
  BASE_CHAIN_HEX,
  BASE_NETWORK,
  issueWalletChallenge,
  normalizeWalletAddress,
  verifyWalletChallenge,
  walletChallengeMessage,
} = require("./panel-wallet.js");

const NOW = Date.parse("2026-09-05T12:00:00.000Z");
const ORIGIN = "https://panel.example";
const SCOPE = Object.freeze({ uid: "tenant-a", chatId: "101" });
const ACCOUNT = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
const OTHER_ACCOUNT = privateKeyToAccount(`0x${"02".padStart(64, "0")}`);

function memoryStore() {
  let row = null;
  return {
    get row() { return row; },
    async createWalletChallenge(scope, value) {
      row = {
        uid: scope.uid,
        chat_id: scope.chatId,
        address: value.address,
        nonce: value.nonce,
        message: value.message,
        issued_at: value.issuedAt,
        expires_at: value.expiresAt,
        used_at: null,
        challenge_hash: value.challengeHash,
      };
      return true;
    },
    async readWalletChallenge(scope, challengeHash, address) {
      return row && row.uid === scope.uid && row.chat_id === scope.chatId
        && row.challenge_hash === challengeHash && row.address === address ? { ...row } : null;
    },
    async commitWalletConnection(scope, value) {
      if (!row || row.used_at || row.uid !== scope.uid || row.chat_id !== scope.chatId
        || row.challenge_hash !== value.challengeHash || row.address !== value.address) return null;
      row.used_at = new Date(NOW).toISOString();
      row.signature_hash = value.signatureHash;
      return {
        type: "wallet",
        status: "usable",
        address: value.address,
        provider: "metamask",
        network: BASE_NETWORK,
        chain_id: BASE_CHAIN_ID,
        asset: "USDC",
        verification: "siwe_eip4361",
        confirmed_at: new Date(NOW).toISOString(),
      };
    },
  };
}

function deterministicRandom(size) {
  assert.equal(size, 48);
  return Buffer.from(Array.from({ length: size }, (_, index) => index + 1));
}

async function withWalletApi(store, run) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handlePanelApiRequest(req, res, {
      commandStore: store,
      nowMs: NOW,
      panelOrigin: ORIGIN,
      randomBytes: deterministicRandom,
      sessionScopeImpl: async (session) => session === "wallet-session"
        ? { ...SCOPE, csrf: "wallet-csrf" }
        : null,
    })).catch((error) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function walletRequest(base, endpoint, body, headers = {}) {
  return fetch(`${base}/api/panel/wallet/${endpoint}`, {
    method: "POST",
    headers: {
      Cookie: "lm_panel_session=wallet-session",
      Origin: ORIGIN,
      "content-type": "application/json",
      "x-lm-csrf": "wallet-csrf",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("MetaMask challenge is server-authored SIWE bound to Base, address, origin, and five minutes", async () => {
  const store = memoryStore();
  const challenge = await issueWalletChallenge(SCOPE, { address: ACCOUNT.address.toLowerCase() }, {
    store, panelOrigin: ORIGIN, nowMs: NOW, randomBytes: deterministicRandom,
  });
  assert.equal(challenge.address, ACCOUNT.address);
  assert.equal(challenge.chainId, 8453);
  assert.equal(challenge.chainHex, BASE_CHAIN_HEX);
  assert.equal(challenge.network, "eip155:8453");
  assert.equal(challenge.asset, "USDC");
  assert.equal(challenge.expiresAt, "2026-09-05T12:05:00.000Z");
  assert.match(challenge.message, /^panel\.example wants you to sign in with your Ethereum account:/);
  assert.match(challenge.message, new RegExp(`\\n${ACCOUNT.address}\\n\\n`));
  assert.match(challenge.message, /URI: https:\/\/panel\.example\/panel/);
  assert.match(challenge.message, /Chain ID: 8453/);
  assert.match(challenge.message, /Expiration Time: 2026-09-05T12:05:00\.000Z$/);
  assert.equal(challenge.message, store.row.message);
  assert.doesNotMatch(JSON.stringify(store.row), /privateKey|seed|mnemonic/i);
});

test("a valid MetaMask personal_sign registers exactly one usable Base USDC payout destination", async () => {
  const store = memoryStore();
  const challenge = await issueWalletChallenge(SCOPE, { address: ACCOUNT.address }, {
    store, panelOrigin: ORIGIN, nowMs: NOW, randomBytes: deterministicRandom,
  });
  const signature = await ACCOUNT.signMessage({ message: challenge.message });
  const result = await verifyWalletChallenge(SCOPE, {
    challenge: challenge.challenge,
    address: challenge.address,
    signature,
  }, { store, panelOrigin: ORIGIN, nowMs: NOW });
  assert.deepEqual(result, {
    address: ACCOUNT.address,
    shortAddress: `${ACCOUNT.address.slice(0, 6)}…${ACCOUNT.address.slice(-4)}`,
    provider: "metamask",
    chainId: 8453,
    network: "eip155:8453",
    asset: "USDC",
  });
  assert.match(store.row.signature_hash, /^[a-f0-9]{64}$/);
  await assert.rejects(verifyWalletChallenge(SCOPE, {
    challenge: challenge.challenge, address: challenge.address, signature,
  }, { store, panelOrigin: ORIGIN, nowMs: NOW }), /wallet_challenge_rejected/);
});

test("wallet HTTP endpoints enforce session, Origin, CSRF, JSON, and one-time verification", async () => {
  const store = memoryStore();
  await withWalletApi(store, async (base) => {
    const addressBody = { address: ACCOUNT.address };
    assert.equal((await walletRequest(base, "challenge", addressBody, { Cookie: "" })).status, 401);
    assert.equal((await walletRequest(base, "challenge", addressBody, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await walletRequest(base, "challenge", addressBody, { "x-lm-csrf": "wrong" })).status, 403);
    assert.equal((await walletRequest(base, "challenge", addressBody, { "content-type": "text/plain" })).status, 415);

    const challengeResponse = await walletRequest(base, "challenge", addressBody);
    assert.equal(challengeResponse.status, 200);
    const challenge = await challengeResponse.json();
    const signature = await ACCOUNT.signMessage({ message: challenge.message });
    const verifyBody = { challenge: challenge.challenge, address: challenge.address, signature };
    const verifyResponse = await walletRequest(base, "verify", verifyBody);
    assert.equal(verifyResponse.status, 200);
    assert.deepEqual(await verifyResponse.json(), {
      address: ACCOUNT.address,
      shortAddress: `${ACCOUNT.address.slice(0, 6)}…${ACCOUNT.address.slice(-4)}`,
      provider: "metamask",
      chainId: 8453,
      network: "eip155:8453",
      asset: "USDC",
    });
    assert.equal((await walletRequest(base, "verify", verifyBody)).status, 409);
  });
});

test("wrong signer, tenant, origin, expiry, and malformed payload all fail closed", async (t) => {
  const make = async () => {
    const store = memoryStore();
    const challenge = await issueWalletChallenge(SCOPE, { address: ACCOUNT.address }, {
      store, panelOrigin: ORIGIN, nowMs: NOW, randomBytes: deterministicRandom,
    });
    return { store, challenge };
  };
  await t.test("wrong signer", async () => {
    const { store, challenge } = await make();
    const signature = await OTHER_ACCOUNT.signMessage({ message: challenge.message });
    await assert.rejects(verifyWalletChallenge(SCOPE, { challenge: challenge.challenge, address: challenge.address, signature }, {
      store, panelOrigin: ORIGIN, nowMs: NOW,
    }), /wallet_signature_rejected/);
    assert.equal(store.row.used_at, null);
  });
  await t.test("wrong tenant", async () => {
    const { store, challenge } = await make();
    const signature = await ACCOUNT.signMessage({ message: challenge.message });
    await assert.rejects(verifyWalletChallenge({ uid: "tenant-b", chatId: "202" }, { challenge: challenge.challenge, address: challenge.address, signature }, {
      store, panelOrigin: ORIGIN, nowMs: NOW,
    }), /wallet_challenge_rejected/);
  });
  await t.test("wrong origin", async () => {
    const { store, challenge } = await make();
    const signature = await ACCOUNT.signMessage({ message: challenge.message });
    await assert.rejects(verifyWalletChallenge(SCOPE, { challenge: challenge.challenge, address: challenge.address, signature }, {
      store, panelOrigin: "https://evil.example", nowMs: NOW,
    }), /wallet_challenge_rejected/);
  });
  await t.test("expired", async () => {
    const { store, challenge } = await make();
    const signature = await ACCOUNT.signMessage({ message: challenge.message });
    await assert.rejects(verifyWalletChallenge(SCOPE, { challenge: challenge.challenge, address: challenge.address, signature }, {
      store, panelOrigin: ORIGIN, nowMs: NOW + 5 * 60 * 1000,
    }), /wallet_challenge_expired/);
  });
  await t.test("extra client-controlled field", async () => {
    const { store, challenge } = await make();
    const signature = await ACCOUNT.signMessage({ message: challenge.message });
    await assert.rejects(verifyWalletChallenge(SCOPE, { challenge: challenge.challenge, address: challenge.address, signature, chainId: 1 }, {
      store, panelOrigin: ORIGIN, nowMs: NOW,
    }), /wallet_request_invalid/);
  });
});

test("address normalization enforces EVM shape and EIP-55 mixed-case checksum", () => {
  assert.equal(normalizeWalletAddress(ACCOUNT.address.toLowerCase()), ACCOUNT.address);
  assert.throws(() => normalizeWalletAddress("0x1234"), /wallet_address_invalid/);
  const corrupted = "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359".replace("fB69", "Fb69");
  assert.throws(() => normalizeWalletAddress(corrupted), /wallet_address_invalid/);
});

test("migration makes payout_destination jsonb and atomically consumes a scoped challenge", () => {
  const bootstrap = fs.readFileSync(path.join(__dirname, "../migrations/2026-09-04-lm-doraemon-fresh-bootstrap.sql"), "utf8");
  const migration = fs.readFileSync(path.join(__dirname, "../migrations/2026-09-05-lm-panel-metamask-wallet.sql"), "utf8");
  assert.match(bootstrap, /payout_destination jsonb/);
  assert.doesNotMatch(bootstrap, /payout_destination text/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.lm_panel_wallet_challenges/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.commit_lm_panel_wallet_connection/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /'network', 'eip155:8453'/);
  assert.match(migration, /'asset', 'USDC'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.commit_lm_panel_wallet_connection/);
});

test("SIWE message rejects untrusted origins and invalid expiration", () => {
  assert.throws(() => walletChallengeMessage({ origin: "http://evil.example", address: ACCOUNT.address, nonce: "12345678", issuedAt: NOW, expiresAt: NOW + 1 }), /wallet_origin_unavailable/);
  assert.throws(() => walletChallengeMessage({ origin: ORIGIN, address: ACCOUNT.address, nonce: "12345678", issuedAt: NOW, expiresAt: NOW }), /wallet_challenge_invalid/);
});

# Rockstar_ibot x402 worker

Buyer-signed EIP-3009 payment endpoint for Base USDC. It has no default recipient.

## Ownership gate

Set `LIFE_MANAGER_PAY_TO` to a Kai-owned EVM address before local startup or deployment. If the variable is absent or malformed, the Node server exits and the Cloudflare Worker returns `503 owner_wallet_not_configured`. Former-owner wallets are never used as fallback values.

| Setting | Value |
|---|---|
| recipient | `LIFE_MANAGER_PAY_TO` |
| asset | Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| network | `eip155:8453` |
| price | 1000 atomic = 0.001 USDC |

## Endpoints

| Route | Behavior |
|---|---|
| `GET /health` | configured worker health |
| `GET /.well-known/x402` | canonical x402 discovery document |
| `GET /openapi.json` | canonical OpenAPI discovery document |
| `GET /paid` without receipt | `402` payment requirements |
| `GET /paid` with receipt | verifies signer, recipient, asset, amount, time window, and nonce |

## Local verification

```bash
export LIFE_MANAGER_PAY_TO=0xYOUR_KAI_OWNED_ADDRESS
npm install
npx wrangler dev --var "LIFE_MANAGER_PAY_TO:$LIFE_MANAGER_PAY_TO" --port 8788 --local
BASE_URL=http://localhost:8788 bash tests/test_x402_cloud_e2e.sh
```

## Deploy

```bash
export LIFE_MANAGER_PAY_TO=0xYOUR_KAI_OWNED_ADDRESS
export CLOUDFLARE_API_TOKEN=...
./deploy.sh
```

Deployment changes external state and must be run only against Kai's Cloudflare account.

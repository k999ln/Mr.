#!/usr/bin/env node
// Compatibility entrypoint for the maintained x402 v2 buyer. The v1 package was
// retired; target validation and owner-key gating remain in buyer-cdp-v2.mjs.
await import("./buyer-cdp-v2.mjs");

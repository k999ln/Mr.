#!/usr/bin/env node
// Compatibility entrypoint. The retired x402 v1 seller was removed because its
// dependency chain is unmaintained; every existing caller now uses the maintained
// v2 implementation without changing its command or launchd configuration.
await import("./serve-v2.mjs");

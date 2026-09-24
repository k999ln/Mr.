#!/usr/bin/env node
import { validateAidRequest } from "./lib/policy.mjs";

let input = {};
try {
  input = JSON.parse(process.argv[2] || "{}");
} catch {
  console.error(JSON.stringify({ ok: false, errors: ["invalid_json"] }));
  process.exit(2);
}

const result = validateAidRequest(input);
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 2);

#!/usr/bin/env node
import { tools, servicePlan } from '../../packages/automation-hub/index.mjs';
import { parseDraft, readInput, startRunner } from './server.mjs';

const help = `Mr. Automation Runner — local draft foundation

node services/automation-runner/cli.mjs [--stdio|draft] < input.json
node services/automation-runner/cli.mjs tools
node services/automation-runner/cli.mjs serve

Default: read one JSON object from stdin; return proposal, checklist, warnings.
serve: requires MR_RUNNER_TOKEN (32 random bytes as 64 hex characters).
MR_RUNNER_HOST: 127.0.0.1 (default) or ::1 only.
MR_RUNNER_PORT: 8888 (default). Every HTTP endpoint requires Bearer auth.
No external tool execution, marketplace posting, or real payments.
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--stdio';
  if (args.length > 1) throw new Error('invalid_command');
  if (command === '--help' || command === '-h') { process.stdout.write(help); return; }
  if (command === '--stdio' || command === 'draft') {
    if (process.stdin.isTTY) throw new Error('stdin_json_required');
    process.stdout.write(JSON.stringify(parseDraft(await readInput(process.stdin)), null, 2) + '\n');
    return;
  }
  if (command === 'tools') {
    process.stdout.write(JSON.stringify({ tools, servicePlan }, null, 2) + '\n');
    return;
  }
  if (command === 'serve') {
    const suppliedPort = process.env.MR_RUNNER_PORT;
    if (suppliedPort !== undefined && !/^\d{1,5}$/.test(suppliedPort)) throw new Error('invalid_port');
    const runner = await startRunner({
      token: process.env.MR_RUNNER_TOKEN,
      host: process.env.MR_RUNNER_HOST || '127.0.0.1',
      port: suppliedPort === undefined ? 8888 : Number(suppliedPort),
    });
    process.stderr.write(`Mr. local runner: ${runner.origin} (authentication required)\n`);
    const stop = async () => { await runner.close(); process.exitCode = 0; };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return;
  }
  throw new Error('invalid_command');
}

try { await main(); }
catch (error) {
  const known = ['invalid_command', 'stdin_json_required', 'loopback_host_required', 'invalid_port', 'MR_RUNNER_TOKEN_must_be_32_random_bytes_as_hex'];
  const code = error.code === 'EADDRINUSE' ? 'port_in_use' : error.code === 'EACCES' ? 'port_unavailable' : error.code || (known.includes(error.message) ? error.message : 'runner_failed');
  process.stderr.write(JSON.stringify({ error: code }) + '\n');
  process.exitCode = 1;
}

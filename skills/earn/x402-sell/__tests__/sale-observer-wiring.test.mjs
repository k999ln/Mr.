import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sale observer is wired as a five-minute one-shot LaunchAgent with a private candidate store', () => {
  const runner = readFileSync(new URL('../sale-observer.mjs', import.meta.url), 'utf8');
  const boot = readFileSync(new URL('../sale-observer-boot.sh', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../launchd/ai.anicca.x402-sale-observer.plist', import.meta.url), 'utf8');

  assert.match(runner, /appendUniqueSaleCandidates/);
  assert.match(runner, /x402-sale-candidates\.jsonl/);
  assert.match(runner, /import\.meta\.url ===/);
  assert.match(runner, /candidate_not_verified_revenue/);
  assert.match(runner, /LM_X402_SALE_OBSERVER_CONFIG/);
  assert.match(runner, /config\.schemaVersion must be 1/);
  assert.match(runner, /LIFE_MANAGER_HOME/);
  assert.match(runner, /ANICCA_HOME/);
  assert.match(runner, /'\.local', 'state', 'rockstar_ibot'/);
  for (const formerOwnerDefault of [
    '0x3EcCAD24794ca298D25378E9902A251322ea8749',
    '0xe7747Fd899D8987821Bb4CB3D6aDf22565F87ce9',
    '0x810F6D61F7606dEEE2657d3083E150a222Bc29C5',
    'prod_653429e9dd234895',
    '54a0fabf-a95a-47bd-b2cc-81f3189430cb',
    'https://x402-agents-production.up.railway.app',
    '0x6592EB8EF820aBC092e8C3474fb2042dffCCEDc7',
  ]) {
    assert.equal(runner.includes(formerOwnerDefault), false);
  }
  assert.doesNotMatch(runner, /console\.(?:log|error)\([^\n]*(?:apiKey|api_key|credentials)/i);
  assert.match(boot, /exec \/usr\/bin\/env node "\$DIR\/sale-observer\.mjs"/);
  assert.doesNotMatch(boot, /mkdir[^\n]*\.anicca/);
  assert.match(plist, /<string>ai\.anicca\.x402-sale-observer<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/);
  assert.match(plist, /<key>StartInterval<\/key><integer>300<\/integer>/);
  assert.doesNotMatch(plist, /<key>KeepAlive<\/key>/);
});

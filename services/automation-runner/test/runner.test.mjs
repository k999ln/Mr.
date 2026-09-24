import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startRunner, MAX_INPUT_BYTES } from '../server.mjs';
import { buildCoconalaDraft, tools, servicePlan } from '../../../packages/automation-hub/index.mjs';

const cliPath = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const sample = { title: '店舗紹介文', requirements: '提供情報だけを利用', deliverables: '紹介文3案', deadline: '要相談', price: '5000円' };

async function withRunner(t) {
  const token = randomBytes(32).toString('hex');
  const runner = await startRunner({ token, port: 0 });
  t.after(() => runner.close());
  const call = (path, { method = 'GET', headers = {}, body, authenticated = true } = {}) => new Promise((resolve, reject) => {
    const req = request(runner.origin + path, {
      method,
      headers: { ...(authenticated ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { ...runner, token, call };
}

test('rejects missing/short token and every non-loopback bind before listening', async () => {
  await assert.rejects(startRunner({ port: 0 }), /MR_RUNNER_TOKEN/);
  await assert.rejects(startRunner({ token: 'short', port: 0 }), /MR_RUNNER_TOKEN/);
  for (const host of ['0.0.0.0', '::', 'localhost', '192.168.1.1', 'example.com']) {
    await assert.rejects(startRunner({ token: randomBytes(32).toString('hex'), host, port: 0 }), /loopback_host_required/);
  }
});

test('all endpoints require correct bearer authorization including health', async (t) => {
  const { call } = await withRunner(t);
  for (const path of ['/health', '/v1/tools', '/v1/drafts/coconala']) {
    const response = await call(path, { authenticated: false });
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.text), { error: 'unauthorized' });
  }
  assert.equal((await call('/health', { headers: { Authorization: 'Bearer incorrect' } })).status, 401);
  assert.equal((await call('/health', { headers: { Authorization: 'Basic irrelevant' } })).status, 401);
});

test('rejects browser cross-origin, opaque origins, hostile Host and same-site other origins', async (t) => {
  const { call, origin } = await withRunner(t);
  for (const headers of [
    { Origin: 'https://example.com' },
    { Origin: 'null' },
    { Origin: origin + '/' },
    { Origin: origin, 'Sec-Fetch-Site': 'cross-site' },
    { Origin: origin, 'Sec-Fetch-Site': 'same-site' },
    { Host: 'attacker.test' },
  ]) {
    const response = await call('/health', { headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await call('/health', { headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
});

test('returns catalog and pure local proposal without claiming an external delivery', async (t) => {
  const { call, token } = await withRunner(t);
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.text).mode, 'local_draft_only');
  assert.equal(health.headers['cache-control'], 'no-store');
  const catalog = await call('/v1/tools');
  assert.equal(catalog.status, 200);
  assert.deepEqual(JSON.parse(catalog.text), { tools, servicePlan });
  const draft = await call('/v1/drafts/coconala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) });
  assert.equal(draft.status, 200);
  assert.deepEqual(JSON.parse(draft.text), buildCoconalaDraft(sample));
  assert.ok(!draft.text.includes(token));
  assert.equal((await call('/v1/execute', { method: 'POST' })).status, 404);
});

test('rejects malformed, invalid, oversized and non-JSON inputs with redacted errors', async (t) => {
  const { call } = await withRunner(t);
  for (const body of ['{', 'null', '[]', '{"title":42}', '{"command":"echo private"}', JSON.stringify({ title: 'x'.repeat(161) })]) {
    const response = await call('/v1/drafts/coconala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.match(JSON.parse(response.text).error, /invalid_json|invalid_input/);
    assert.ok(!response.text.includes('stack'));
    assert.ok(!response.text.includes('echo private'));
  }
  const giant = await call('/v1/drafts/coconala', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ' '.repeat(MAX_INPUT_BYTES + 1) });
  assert.equal(giant.status, 413);
  const streamed = await call('/v1/drafts/coconala', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, body: ' '.repeat(MAX_INPUT_BYTES + 1) });
  assert.equal(streamed.status, 413);
  const declared = await call('/v1/drafts/coconala', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_INPUT_BYTES + 1) }, body: '{}' });
  assert.equal(declared.status, 413);
  for (const headers of [{}, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }]) {
    assert.equal((await call('/v1/drafts/coconala', { method: 'POST', headers, body: '{}' })).status, 415);
  }
});

test('CLI defaults to one stdin JSON draft and never needs service credentials', () => {
  const result = spawnSync(process.execPath, [cliPath], { input: JSON.stringify(sample), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), buildCoconalaDraft(sample));
  const catalog = spawnSync(process.execPath, [cliPath, 'tools'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.deepEqual(JSON.parse(catalog.stdout), { tools, servicePlan });
});

test('rejects an oversized chunked stream before the client ends its body', { timeout: 3000 }, async (t) => {
  const { origin, token } = await withRunner(t);
  const response = await new Promise((resolve, reject) => {
    const req = request(origin + '/v1/drafts/coconala', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, inputEnded: req.writableEnded, body: Buffer.concat(chunks).toString('utf8') });
        req.destroy();
      });
    });
    req.on('error', reject);
    t.after(() => req.destroy());
    // Deliberately omit req.end(): the body limit must not wait for end-of-input.
    for (let part = 0; part < 70; part += 1) req.write(Buffer.alloc(1024, 32));
  });
  assert.equal(response.status, 413);
  assert.equal(response.inputEnded, false);
  assert.deepEqual(JSON.parse(response.body), { error: 'input_too_large' });
});

test('CLI reports bad payload and missing HTTP credentials without stack traces', () => {
  const invalid = spawnSync(process.execPath, [cliPath, 'draft'], { input: '{', encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.deepEqual(JSON.parse(invalid.stderr), { error: 'invalid_json' });
  const absent = spawnSync(process.execPath, [cliPath, 'serve'], {
    encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH, MR_RUNNER_TOKEN: '' },
  });
  assert.equal(absent.status, 1);
  assert.deepEqual(JSON.parse(absent.stderr), { error: 'MR_RUNNER_TOKEN_must_be_32_random_bytes_as_hex' });
});

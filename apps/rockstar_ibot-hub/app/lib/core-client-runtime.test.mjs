import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./core-client.ts', import.meta.url), 'utf8');

test('Core fetch timeout stays compatible with the Sites Worker runtime', () => {
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /clearTimeout\(timeout\)/);
  assert.doesNotMatch(source, /AbortSignal\.timeout/);
});

test('Core fetch failures log only a bounded, redacted diagnostic', () => {
  assert.match(source, /event: 'core_request_failed'/);
  assert.match(source, /replace\(\/Bearer\\s\+\\S\+\/gi, 'Bearer \[redacted\]'\)/);
  assert.match(source, /slice\(0, 160\)/);
});

test('Core fetch uses the Sites-supported manual redirect mode and rejects every redirect', () => {
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /response\.status >= 300 && response\.status < 400/);
  assert.match(source, /core_redirect_rejected/);
  assert.doesNotMatch(source, /redirect: 'error'/);
});

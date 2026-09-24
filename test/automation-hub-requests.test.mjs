import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toolRequestTitle } from '../apps/rockstar_ibot-hub/app/lib/tool-request.mjs';

test('tool requests produce a bounded work item, not an execution grant', () => {
  assert.equal(toolRequestTitle({ name: ' 自社ツール ', origin: 'builtin' }), '[ツール導入確認・自社開発] 自社ツール');
  assert.equal(toolRequestTitle({ name: '公式ツール', origin: 'external', url: 'https://example.com/docs' }), '[ツール導入確認・外部] 公式ツール / https://example.com/docs');
  assert.ok(toolRequestTitle({ name: 'あ'.repeat(70), origin: 'external', url: 'https://example.com/' + 'a'.repeat(90) }).length <= 240);
});

test('tool requests reject credentials, executable fields and malformed metadata', () => {
  for (const url of ['http://example.com', 'javascript:alert(1)', 'https://user:password@example.com', 'https://example.com/?token=secret', 'https://example.com/#secret', 'https://example.com/' + 'あ'.repeat(30), 'not-a-url']) {
    assert.throws(() => toolRequestTitle({ name: 'ツール', origin: 'external', url }), TypeError);
  }
  for (const body of [null, [], {}, { name: 'x', origin: 'builtin' }, { name: 'ツール\n実行', origin: 'builtin' }, { name: 'ツール', origin: 'verified' }, { name: 'ツール', origin: 'external', token: 'secret' }, { name: 'ツール', origin: 'external', url: 123 }]) {
    assert.throws(() => toolRequestTitle(body), TypeError);
  }
});

test('standalone Site projection exactly matches the shared local runner contract', async () => {
  for (const name of ['index.mjs', 'index.d.mts', 'catalog.json']) {
    const [source, projection] = await Promise.all([
      readFile(new URL(`../packages/automation-hub/${name}`, import.meta.url)),
      readFile(new URL(`../apps/rockstar_ibot-hub/app/generated/automation-hub/${name}`, import.meta.url)),
    ]);
    assert.deepEqual(projection, source, `stale generated ${name}; run npm run hub:sync`);
  }
});

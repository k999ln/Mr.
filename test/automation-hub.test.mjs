import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { servicePlan, tools, buildCoconalaDraft, subscriptionAccess } from '../packages/automation-hub/index.mjs';

const now = Date.parse('2026-09-04T12:00:00Z');
const active = {
  planId: servicePlan.id,
  status: 'active',
  verifiedAt: '2026-09-04T11:00:00Z',
  currentPeriodEnd: '2026-10-04T12:00:00Z',
};

test('monthly price is exactly 888 USD cents, without revenue share or live billing', () => {
  assert.deepEqual(servicePlan, {
    id: 'mr-electricity-monthly-v1', amountMinor: 888, currency: 'USD',
    interval: 'month', revenueShareBps: 0, billingLive: false,
  });
  assert.ok(Number.isSafeInteger(servicePlan.amountMinor));
  assert.throws(() => { servicePlan.billingLive = true; }, TypeError);
});

test('offline draft preserves user facts deterministically, without network or credentials', () => {
  const input = {
    title: '商品案内ページ', requirements: '提供文章を使用\r\nスマートフォン対応',
    deliverables: ['HTML', 'CSS'], deadline: '9月20日（要合意）', price: '30,000円',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network must not be used'); };
  try {
    const result = buildCoconalaDraft(input);
    assert.deepEqual(result, buildCoconalaDraft(input));
    assert.deepEqual(Object.keys(result).sort(), ['checklist', 'proposal', 'warnings']);
    assert.match(result.proposal, /商品案内ページ/);
    assert.match(result.proposal, /・提供文章を使用\n・スマートフォン対応/);
    assert.match(result.proposal, /・HTML\n・CSS/);
    assert.match(result.proposal, /9月20日（要合意）/);
    assert.match(result.proposal, /30,000円/);
    assert.ok(result.checklist.some((line) => line.includes('実現可否')));
    assert.ok(result.warnings.some((line) => line.includes('利益を保証')));
    assert.doesNotMatch(result.proposal, /実績多数|受注済み|送信済み|必ず稼げ|成功率/);
    assert.equal(input.requirements, '提供文章を使用\r\nスマートフォン対応');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('empty draft calls out all missing facts and numeric price never invents a currency', () => {
  const result = buildCoconalaDraft();
  assert.equal(result.warnings.filter((warning) => warning.includes('未入力')).length, 5);
  assert.match(result.proposal, /\[要確認：案件名\]/);
  const priced = buildCoconalaDraft({ price: 12000 });
  assert.match(priced.proposal, /【希望見積り】12000\n/);
  assert.ok(priced.warnings.some((warning) => warning.includes('通貨が明確ではありません')));
});

test('draft rejects malformed input, executable fields and excessive payloads', () => {
  for (const input of [
    null, [], 'title', { title: 42 }, { deadline: {} }, { price: -1 }, { price: Infinity },
    { price: null }, { requirements: [5] }, { requirements: [undefined] },
    { requirements: new Array(2) }, { deliverables: true },
    { title: 'a'.repeat(161) }, { requirements: 'a'.repeat(8001) },
    { deliverables: Array(41).fill('x') }, { requirements: Array(40).fill('x'.repeat(201)) },
    { deadline: 'a'.repeat(201) }, { price: 'a'.repeat(101) }, { title: 'nul\u0000' },
    { command: 'anything' }, { tool: 'shell' }, { __proto__: { title: 'inherited' } },
  ]) assert.throws(() => buildCoconalaDraft(input), TypeError);
  const raw = '<script>alert(1)</script>';
  assert.ok(buildCoconalaDraft({ title: raw }).proposal.includes(raw), 'text remains data, consumer must render plain text');
});

test('subscription policy permits only fresh verified active matching state in its period', () => {
  assert.deepEqual(subscriptionAccess(active, now), { allowed: true, reason: 'active' });
  assert.equal(subscriptionAccess({ ...active, cancelAtPeriodEnd: true }, now).allowed, true);
  assert.equal(subscriptionAccess({ ...active, verifiedAt: now - 1, currentPeriodEnd: now + 1 }, now).allowed, true);
  assert.equal(subscriptionAccess(active, new Date(now)).allowed, true);
});

test('subscription unknown, stale, expired and revoked states fail closed', () => {
  for (const state of [
    undefined, null, {}, [], { ...active, status: 'trialing' }, { ...active, status: 'past_due' },
    { ...active, status: 'canceled' }, { ...active, status: 'unrecognized' },
    { ...active, planId: 'old-payment-link' }, { ...active, revoked: true },
    { ...active, revokedAt: 'invalid' }, { ...active, revoked: 'false' },
    { ...active, verifiedAt: now - 86_400_000 }, { ...active, verifiedAt: now + 1 },
    { ...active, verifiedAt: undefined }, { ...active, currentPeriodEnd: now },
    { ...active, currentPeriodEnd: null }, { ...active, verifiedAt: '2026-02-30T12:00:00Z' },
    { ...active, currentPeriodEnd: '2026-10-04' },
  ]) assert.equal(subscriptionAccess(state, now).allowed, false, JSON.stringify(state));
  assert.deepEqual(subscriptionAccess({ ...active, verifiedAt: now - 86_400_000 }, now), { allowed: false, reason: 'stale' });
  assert.deepEqual(subscriptionAccess({ ...active, revoked: true }, now), { allowed: false, reason: 'revoked' });
  for (const invalidTime of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER, 'tomorrow', new Date(NaN)]) {
    assert.deepEqual(subscriptionAccess(active, invalidTime), { allowed: false, reason: 'invalid_time' });
  }
});

test('catalog is bounded, has traceable source files and does not grant arbitrary execution', async () => {
  const catalog = JSON.parse(await readFile(new URL('../packages/automation-hub/catalog.json', import.meta.url), 'utf8'));
  const schema = JSON.parse(await readFile(new URL('../packages/automation-hub/tool-catalog.schema.json', import.meta.url), 'utf8'));
  assert.ok(tools.length >= 10 && tools.length <= 16);
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(new Set(tools.map((tool) => tool.id)).size, tools.length);
  assert.deepEqual(tools.filter((tool) => tool.status === 'runnable_local').map((tool) => tool.id), ['coconala-proposal-draft']);
  for (const tool of tools) {
    assert.deepEqual(Object.keys(tool).sort(), [...schema.$defs.tool.required].sort());
    assert.match(tool.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(tool.version, /^\d+\.\d+\.\d+$/);
    assert.ok(['builtin', 'external'].includes(tool.origin));
    assert.ok(['runnable_local', 'sign_in_required', 'connection_required', 'catalog_only'].includes(tool.status));
    assert.ok(tool.permissions.length && tool.requirements.length && tool.nextAction);
    assert.ok(tool.costModel.description);
    assert.ok(['included_local', 'provider_usage', 'not_connected'].includes(tool.costModel.mode));
    assert.ok(tool.surfaces.every((surface) => ['web', 'desktop', 'os', 'telegram'].includes(surface)));
    for (const sourcePath of tool.sourcePaths) {
      assert.doesNotMatch(sourcePath, /^\/|(?:^|\/)\.\.(?:\/|$)|\\/);
      assert.equal((await stat(new URL(`../${sourcePath}`, import.meta.url))).isFile(), true, sourcePath);
    }
    assert.equal(Object.hasOwn(tool, 'command'), false);
    assert.equal(Object.hasOwn(tool, 'entrypoint'), false);
    assert.ok(Object.isFrozen(tool) && Object.isFrozen(tool.permissions));
  }
  assert.ok(tools.find((tool) => tool.id === 'external-mcp-packages').sourcePaths.includes('integrations/ai-tools/rockstar_ibot-tool.schema.json'));
});

test('existing ledger and work queue are available after signing in', () => {
  assert.deepEqual(tools.filter((tool) => tool.status === 'sign_in_required').map((tool) => tool.id), ['money-ledger', 'work-queue']);
  for (const id of ['money-ledger', 'work-queue']) {
    const tool = tools.find((entry) => entry.id === id);
    assert.equal(tool.nextAction, 'ログインして利用する');
    assert.ok(tool.requirements.some((requirement) => requirement.includes('ChatGPT')));
    assert.doesNotMatch(`${tool.description} ${tool.requirements.join(' ')}`, /未接続|アカウント連携/);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendUniqueSaleCandidates,
  normalizeClawMerchantSales,
  normalizeImageSales,
  normalizeRailwaySettlements,
  normalizeThe402Sales,
} from '../lib/sale-observer.mjs';
import {
  loadSaleObserverConfig,
  pollSaleSources,
  resolveSaleObserverStateRoot,
  runSaleObserver,
} from '../sale-observer.mjs';

const PAY_TO = '0x1111111111111111111111111111111111111111';
const TX = `0x${'a'.repeat(64)}`;
const RAILWAY_PAY_TO = '0x4444444444444444444444444444444444444444';
const RAILWAY_URL = 'https://railway-observer.example';
const THE402_URL = 'https://the402.example';
const CLAW_URL = 'https://claw.example';

test('image adapter emits only a settled successful sale and strips unapproved fields', () => {
  const rows = [
    {
      ts: '2026-07-23T02:00:00.000Z',
      route: '/image',
      price: '$0.03',
      payer: '0x2222222222222222222222222222222222222222',
      tx: TX.toUpperCase(),
      settled: true,
      status: 200,
      prompt: 'must not persist',
      paymentHeader: 'must not persist',
    },
    { ts: '2026-07-23T02:01:00.000Z', route: '/image', price: '$0.03', tx: null, settled: false, status: 402 },
    { ts: '2026-07-23T02:02:00.000Z', route: '/other', price: '$0.03', tx: TX, settled: true, status: 200 },
  ];

  assert.deepEqual(normalizeImageSales(rows, { payTo: PAY_TO }), [{
    source: 'x402-image',
    source_sale_id: `x402-image:${TX}`,
    offer_id: '/image',
    tx: TX,
    expected_pay_to: PAY_TO,
    expected_usdc_atomic: '30000',
    observed_at: '2026-07-23T02:00:00.000Z',
  }]);
});

test('ClawMerchants adapter accepts only delivered transactions for the pinned asset and amount', () => {
  const assetId = 'asset_test_1';
  const rows = [
    { id: 'cm-sale-1', assetId, amountUsdc: 0.03, status: 'delivered', txHash: TX.toUpperCase(), createdAt: '2026-07-23T02:10:00.000Z', buyer: 'secret' },
    { id: 'cm-sale-2', assetId, amountUsdc: 0.03, status: 'pending', txHash: `0x${'b'.repeat(64)}`, createdAt: '2026-07-23T02:11:00.000Z' },
    { id: 'cm-sale-3', assetId: 'another-asset', amountUsdc: 0.03, status: 'delivered', txHash: `0x${'c'.repeat(64)}`, createdAt: '2026-07-23T02:12:00.000Z' },
    { id: 'cm-sale-4', assetId, amountUsdc: 0.04, status: 'delivered', txHash: `0x${'d'.repeat(64)}`, createdAt: '2026-07-23T02:13:00.000Z' },
  ];

  assert.deepEqual(normalizeClawMerchantSales(rows, {
    assetId,
    payTo: PAY_TO,
    priceUsd: '0.03',
  }), [{
    source: 'clawmerchants',
    source_sale_id: 'clawmerchants:cm-sale-1',
    offer_id: assetId,
    tx: TX,
    expected_pay_to: PAY_TO,
    expected_usdc_atomic: '30000',
    observed_at: '2026-07-23T02:10:00.000Z',
  }]);
});

test('the402 adapter accepts only settled transactions for an allowlisted offer and amount range', () => {
  const serviceId = 'svc_test_1';
  const body = {
    earnings: { settled_usd: 0.95 },
    recent_settlements: [
      { settlement_id: 'set_1', service_id: serviceId, provider_amount_usd: '0.95', status: 'settled', tx_hash: TX.toUpperCase(), settled_at: '2026-07-23T02:20:00.000Z', buyer_brief: 'must not persist' },
      { settlement_id: 'set_2', service_id: serviceId, provider_amount_usd: '0.95', status: 'pending', tx_hash: `0x${'b'.repeat(64)}`, settled_at: '2026-07-23T02:21:00.000Z' },
      { settlement_id: 'set_3', service_id: 'svc_unknown', provider_amount_usd: '0.95', status: 'settled', tx_hash: `0x${'c'.repeat(64)}`, settled_at: '2026-07-23T02:22:00.000Z' },
      { settlement_id: 'set_4', service_id: serviceId, provider_amount_usd: '26', status: 'settled', tx_hash: `0x${'d'.repeat(64)}`, settled_at: '2026-07-23T02:23:00.000Z' },
    ],
  };

  assert.deepEqual(normalizeThe402Sales(body, {
    payTo: PAY_TO,
    allowedOffers: {
      [serviceId]: { minUsd: '0.50', maxUsd: '25' },
    },
  }), [{
    source: 'the402',
    source_sale_id: 'the402:set_1',
    offer_id: serviceId,
    tx: TX,
    expected_pay_to: PAY_TO,
    expected_usdc_atomic: '950000',
    observed_at: '2026-07-23T02:20:00.000Z',
  }]);
});

test('Railway adapter emits allowlisted GET and POST mainnet settlements and strips payer claims', () => {
  const rows = [
    {
      id: 'f738b171-fb73-48b0-b386-aa391def62f4',
      observed_at: '2026-07-27T22:42:00.000Z',
      route: '/intent-router',
      method: 'POST',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amount_atomic: '5000',
      pay_to: RAILWAY_PAY_TO,
      transaction: TX.toUpperCase(),
      payer: '0x2222222222222222222222222222222222222222',
      success: true,
      payment_header: 'must not persist',
    },
    {
      id: '61ad32a4-2d70-42f2-bca4-8a9241acd720',
      observed_at: '2026-07-28T04:30:00.000Z',
      route: '/funding-rates',
      method: 'GET',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amount_atomic: '10000',
      pay_to: RAILWAY_PAY_TO,
      transaction: `0x${'b'.repeat(64)}`,
      success: true,
    },
    {
      id: 'wrong-amount',
      observed_at: '2026-07-27T22:42:01.000Z',
      route: '/intent-router',
      method: 'POST',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amount_atomic: '9999',
      pay_to: RAILWAY_PAY_TO,
      transaction: `0x${'b'.repeat(64)}`,
      success: true,
    },
  ];

  assert.deepEqual(normalizeRailwaySettlements(rows, {
    payTo: RAILWAY_PAY_TO,
    allowedOffers: {
      '/intent-router': '5000',
      '/funding-rates': '10000',
    },
  }), [
    {
      source: 'x402-railway',
      source_sale_id: 'x402-railway:f738b171-fb73-48b0-b386-aa391def62f4',
      offer_id: '/intent-router',
      tx: TX,
      expected_pay_to: RAILWAY_PAY_TO.toLowerCase(),
      expected_usdc_atomic: '5000',
      observed_at: '2026-07-27T22:42:00.000Z',
    },
    {
      source: 'x402-railway',
      source_sale_id: 'x402-railway:61ad32a4-2d70-42f2-bca4-8a9241acd720',
      offer_id: '/funding-rates',
      tx: `0x${'b'.repeat(64)}`,
      expected_pay_to: RAILWAY_PAY_TO.toLowerCase(),
      expected_usdc_atomic: '10000',
      observed_at: '2026-07-28T04:30:00.000Z',
    },
  ]);
});

test('candidate store is 0600, strips extra fields, and dedupes by sale ID and tx', () => {
  const dir = mkdtempSync(join(tmpdir(), 'x402-sale-observer-'));
  const path = join(dir, 'sale-candidates.jsonl');
  const base = {
    source: 'x402-image',
    source_sale_id: `x402-image:${TX}`,
    offer_id: '/image',
    tx: TX,
    expected_pay_to: PAY_TO,
    expected_usdc_atomic: '30000',
    observed_at: '2026-07-23T02:00:00.000Z',
    prompt: 'must not persist',
  };
  const otherTx = `0x${'b'.repeat(64)}`;
  const other = { ...base, source: 'clawmerchants', source_sale_id: 'clawmerchants:cm-sale-2', offer_id: 'asset-2', tx: otherTx };

  assert.deepEqual(appendUniqueSaleCandidates(path, [
    base,
    { ...base, tx: `0x${'c'.repeat(64)}` },
    { ...other, source_sale_id: 'clawmerchants:another-sale', tx: TX },
    other,
    { ...other, source_sale_id: 'bad', tx: 'not-a-tx' },
  ]), { recorded: 2, duplicates: 2, invalid: 1 });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse), [
    {
      source: 'x402-image',
      source_sale_id: `x402-image:${TX}`,
      offer_id: '/image',
      tx: TX,
      expected_pay_to: PAY_TO,
      expected_usdc_atomic: '30000',
      observed_at: '2026-07-23T02:00:00.000Z',
    },
    {
      source: 'clawmerchants',
      source_sale_id: 'clawmerchants:cm-sale-2',
      offer_id: 'asset-2',
      tx: otherTx,
      expected_pay_to: PAY_TO,
      expected_usdc_atomic: '30000',
      observed_at: '2026-07-23T02:00:00.000Z',
    },
  ]);
  assert.deepEqual(appendUniqueSaleCandidates(path, [base, other]), { recorded: 0, duplicates: 2, invalid: 0 });
});

test('runner polls all live sources without sending the402 credentials to ClawMerchants', async () => {
  const assetId = 'asset_test_1';
  const serviceId = 'svc_test_1';
  const productId = 'prod_test_1';
  const calls = [];
  const bodies = new Map([
    [`${THE402_URL}/v1/jobs`, { data: { jobs: [] } }],
    [`${THE402_URL}/v1/threads`, { data: { threads: [] } }],
    [`${THE402_URL}/v1/provider/earnings`, { data: { earnings: { settled_usd: 0.95, held_usd: 0, pending_usd: 0 }, recent_settlements: [{ settlement_id: 'set_1', service_id: serviceId, provider_amount_usd: '0.95', status: 'settled', tx_hash: TX, settled_at: '2026-07-23T02:20:00.000Z' }] } }],
    [`${THE402_URL}/v1/products/${productId}`, { data: { product_id: productId, total_purchases: 1 } }],
    [`${CLAW_URL}/api/v1/assets/${assetId}`, { id: assetId, totalPurchases: 1, discoveryCount: 5 }],
    [`${CLAW_URL}/api/v1/transactions?limit=100`, { transactions: [{ id: 'cm-sale-1', assetId, amountUsdc: 0.03, status: 'delivered', txHash: `0x${'b'.repeat(64)}`, createdAt: '2026-07-23T02:30:00.000Z' }] }],
    [`${RAILWAY_URL}/settlements?limit=100`, { settlements: [{
      id: 'railway-sale-1',
      observed_at: '2026-07-23T02:40:00.000Z',
      route: '/intent-router',
      method: 'POST',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amount_atomic: '5000',
      pay_to: RAILWAY_PAY_TO,
      transaction: `0x${'e'.repeat(64)}`,
      success: true,
    }] }],
  ]);
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {} });
    const body = bodies.get(url);
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
  };

  const result = await pollSaleSources({
    fetchFn,
    imageSources: [{
      payTo: PAY_TO,
      offers: [
        { route: '/image', priceUsd: '0.03' },
        { route: '/base-usdc-balance', priceUsd: '0.003' },
      ],
      rows: [
        { ts: '2026-07-23T02:00:00.000Z', route: '/image', price: '$0.03', tx: `0x${'c'.repeat(64)}`, settled: true, status: 200 },
        { ts: '2026-07-23T02:01:00.000Z', route: '/base-usdc-balance', price: '$0.003', tx: `0x${'d'.repeat(64)}`, settled: true, status: 200 },
      ],
    }],
    the402: { baseUrl: THE402_URL, apiKey: 'the402-secret-value', payTo: PAY_TO, productId, allowedOffers: { [serviceId]: { minUsd: '0.50', maxUsd: '25' }, [productId]: { minUsd: '0.50', maxUsd: '0.50' } } },
    claw: { baseUrl: CLAW_URL, assetId, payTo: PAY_TO, priceUsd: '0.03' },
    railway: { baseUrl: RAILWAY_URL, payTo: RAILWAY_PAY_TO, allowedOffers: { '/intent-router': '5000' } },
  });

  assert.deepEqual(result.candidates.map((row) => row.source), ['x402-image', 'x402-image', 'x402-railway', 'the402', 'clawmerchants']);
  assert.equal(result.candidates[1].offer_id, '/base-usdc-balance');
  assert.equal(result.candidates[1].expected_usdc_atomic, '3000');
  assert.deepEqual(result.metrics, {
    image: { settled_candidates: 2 },
    railway: { settlement_candidates: 1 },
    the402: { jobs: 0, threads: 0, settled_usd: 0.95, held_usd: 0, pending_usd: 0, product_purchases: 1, settlement_candidates: 1 },
    clawmerchants: { purchases: 1, discovery_count: 5, transaction_candidates: 1 },
  });
  assert.deepEqual(result.errors, []);
  assert.equal(calls.filter((call) => call.url.startsWith(`${THE402_URL}/`)).every((call) => call.headers['X-API-Key'] === 'the402-secret-value'), true);
  assert.equal(calls.filter((call) => call.url.startsWith(`${CLAW_URL}/`)).every((call) => call.headers['X-API-Key'] === undefined), true);
});

test('runner isolates a the402 outage and continues image and ClawMerchants polling', async () => {
  const assetId = 'asset_test_1';
  const fetchFn = async (url) => {
    if (url.startsWith(`${THE402_URL}/`)) {
      return { ok: false, status: 503, json: async () => ({ error: 'response body must not leak' }) };
    }
    if (url.endsWith(`/assets/${assetId}`)) {
      return { ok: true, status: 200, json: async () => ({ id: assetId, totalPurchases: 1, discoveryCount: 6 }) };
    }
    return { ok: true, status: 200, json: async () => ({ transactions: [{ id: 'cm-sale-2', assetId, amountUsdc: 0.03, status: 'delivered', txHash: `0x${'b'.repeat(64)}`, createdAt: '2026-07-23T02:30:00.000Z' }] }) };
  };

  const result = await pollSaleSources({
    fetchFn,
    imageSources: [{ payTo: PAY_TO, offers: [{ route: '/image', priceUsd: '0.03' }], rows: [{ ts: '2026-07-23T02:00:00.000Z', route: '/image', price: '$0.03', tx: TX, settled: true, status: 200 }] }],
    the402: { baseUrl: THE402_URL, apiKey: 'the402-secret-value', payTo: PAY_TO, productId: 'prod_test_1', allowedOffers: { svc: { minUsd: '0.50', maxUsd: '25' } } },
    claw: { baseUrl: CLAW_URL, assetId, payTo: PAY_TO, priceUsd: '0.03' },
  });

  assert.deepEqual(result.candidates.map((row) => row.source), ['x402-image', 'clawmerchants']);
  assert.deepEqual(result.errors, [{ source: 'the402', code: 'poll_failed' }]);
  assert.deepEqual(result.metrics.the402, {
    jobs: null, threads: null, settled_usd: null, held_usd: null,
    pending_usd: null, product_purchases: null, settlement_candidates: 0,
  });
  assert.deepEqual(result.metrics.railway, { settlement_candidates: 0 });
  assert.equal(JSON.stringify(result).includes('response body must not leak'), false);
});

test('invalid or missing external config fails before every network call', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'x402-sale-observer-config-'));
  const cases = [
    { env: {}, error: /absolute path/ },
    { env: { LM_X402_SALE_OBSERVER_CONFIG: 'relative.json' }, error: /absolute path/ },
    { config: { schemaVersion: 2, imageSources: [] }, error: /schemaVersion must be 1/ },
    {
      config: {
        schemaVersion: 1,
        railway: { baseUrl: 'https://user@railway-observer.example', payTo: RAILWAY_PAY_TO, allowedOffers: { '/intent-router': '5000' } },
      },
      error: /public HTTPS URL/,
    },
    {
      config: {
        schemaVersion: 1,
        the402: {
          baseUrl: THE402_URL,
          credentialsPath: 'relative-credentials.json',
          payTo: PAY_TO,
          productId: 'prod_test_1',
          allowedOffers: { svc_test_1: { minUsd: '0.50', maxUsd: '25' } },
        },
      },
      error: /absolute path/,
    },
    {
      config: { schemaVersion: 1, railway: { baseUrl: RAILWAY_URL, payTo: 'not-a-wallet', allowedOffers: { '/intent-router': '5000' } } },
      error: /EVM address/,
    },
  ];

  let fetchCalls = 0;
  for (const [index, item] of cases.entries()) {
    let env = item.env;
    if (item.config) {
      const configPath = join(dir, `invalid-${index}.json`);
      writeFileSync(configPath, JSON.stringify(item.config));
      env = { LM_X402_SALE_OBSERVER_CONFIG: configPath };
    }
    await assert.rejects(runSaleObserver({
      env,
      fetchFn: async () => {
        fetchCalls += 1;
        throw new Error('network must not run');
      },
    }), item.error);
  }
  assert.equal(fetchCalls, 0);
});

test('an unreadable credential file fails before network after public config validation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'x402-sale-observer-credentials-'));
  const configPath = join(dir, 'observer.json');
  const credentialsPath = join(dir, 'missing-credentials.json');
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    the402: {
      baseUrl: THE402_URL,
      credentialsPath,
      payTo: PAY_TO,
      productId: 'prod_test_1',
      allowedOffers: { svc_test_1: { minUsd: '0.50', maxUsd: '25' } },
    },
  }));
  let fetchCalls = 0;
  await assert.rejects(runSaleObserver({
    env: { LM_X402_SALE_OBSERVER_CONFIG: configPath },
    fetchFn: async () => {
      fetchCalls += 1;
      throw new Error('network must not run');
    },
  }), /credentials are unreadable/);
  assert.equal(fetchCalls, 0);
});

test('poll input is validated as one unit before another valid source can fetch', async () => {
  let fetchCalls = 0;
  await assert.rejects(pollSaleSources({
    fetchFn: async () => {
      fetchCalls += 1;
      throw new Error('network must not run');
    },
    the402: {
      baseUrl: THE402_URL,
      apiKey: 'the402-secret-value',
      payTo: PAY_TO,
      productId: 'prod_test_1',
      allowedOffers: { svc_test_1: { minUsd: '0.50', maxUsd: '25' } },
    },
    railway: {
      baseUrl: RAILWAY_URL,
      payTo: 'not-a-wallet',
      allowedOffers: { '/intent-router': '5000' },
    },
  }), /EVM address/);
  assert.equal(fetchCalls, 0);
});

test('explicit image config writes only below LIFE_MANAGER_HOME without network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'x402-sale-observer-state-'));
  const stateRoot = join(dir, 'rockstar_ibot-home');
  const salesPath = join(dir, 'sales.jsonl');
  const configPath = join(dir, 'observer.json');
  writeFileSync(salesPath, `${JSON.stringify({
    ts: '2026-08-28T12:00:00.000Z',
    route: '/image',
    price: '$0.03',
    tx: TX,
    settled: true,
    status: 200,
  })}\n`);
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    imageSources: [{ salesPath, payTo: PAY_TO, offers: [{ route: '/image', priceUsd: '0.03' }] }],
  }));
  let fetchCalls = 0;
  let notices = 0;
  const output = await runSaleObserver({
    env: { LM_X402_SALE_OBSERVER_CONFIG: configPath, LIFE_MANAGER_HOME: stateRoot },
    home: join(dir, 'home'),
    now: () => '2026-08-28T12:01:00.000Z',
    fetchFn: async () => {
      fetchCalls += 1;
      throw new Error('network must not run');
    },
    notify: () => { notices += 1; },
  });

  const expectedStore = join(stateRoot, 'state', 'x402-sale-candidates.jsonl');
  assert.equal(fetchCalls, 0);
  assert.equal(notices, 1);
  assert.equal(output.store, expectedStore);
  assert.equal(existsSync(expectedStore), true);
  assert.equal(output.summary.recorded, 1);
  assert.equal(output.summary.observed_at, '2026-08-28T12:01:00.000Z');
  assert.equal(resolveSaleObserverStateRoot({ ANICCA_HOME: stateRoot }, join(dir, 'unused-home')), stateRoot);
  assert.equal(resolveSaleObserverStateRoot({}, join(dir, 'neutral-home')), join(dir, 'neutral-home', '.local', 'state', 'rockstar_ibot'));
});

test('schemaVersion 1 config exposes only explicit public source values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'x402-sale-observer-schema-'));
  const credentialsPath = join(dir, 'credentials.json');
  const configPath = join(dir, 'observer.json');
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    the402: {
      baseUrl: THE402_URL,
      credentialsPath,
      payTo: PAY_TO,
      productId: 'prod_test_1',
      allowedOffers: { svc_test_1: { minUsd: '0.50', maxUsd: '25' } },
    },
    claw: { baseUrl: CLAW_URL, assetId: 'asset_test_1', payTo: PAY_TO, priceUsd: '0.03' },
    railway: { baseUrl: RAILWAY_URL, payTo: RAILWAY_PAY_TO, allowedOffers: { '/intent-router': '5000' } },
  }));

  const config = loadSaleObserverConfig({ LM_X402_SALE_OBSERVER_CONFIG: configPath });
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.the402.baseUrl, THE402_URL);
  assert.equal(config.the402.credentialsPath, credentialsPath);
  assert.equal(config.claw.assetId, 'asset_test_1');
  assert.deepEqual(config.railway.allowedOffers, { '/intent-router': '5000' });
});

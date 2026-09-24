#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  appendUniqueSaleCandidates,
  normalizeClawMerchantSales,
  normalizeImageSales,
  normalizeRailwaySettlements,
  normalizeThe402Sales,
} from './lib/sale-observer.mjs';

const CONFIG_ENV = 'LM_X402_SALE_OBSERVER_CONFIG';
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_ROUTE = /^\/[a-z0-9][a-z0-9/_-]{0,126}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, allowed, required, label) {
  const keys = Object.keys(object(value, label));
  const unexpected = keys.filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !keys.includes(key));
  if (unexpected.length || missing.length) throw new TypeError(`${label} has invalid keys`);
}

function address(value, label) {
  if (typeof value !== 'string' || !EVM_ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a valid EVM address`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) {
    throw new TypeError(`${label} must be a safe identifier`);
  }
  return value;
}

function absolutePath(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path`);
  }
  return value;
}

function publicHttpsBaseUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError(`${label} must be a public HTTPS URL`); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal') || isIP(hostname)) {
    throw new TypeError(`${label} must be a public HTTPS URL`);
  }
  return url.href.replace(/\/+$/, '');
}

function endpoint(baseUrl, relative) {
  return new URL(relative, `${baseUrl}/`).href;
}

function imageOffers(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty array`);
  return value.map((offer, index) => {
    const itemLabel = `${label}[${index}]`;
    exactKeys(offer, ['route', 'priceUsd'], ['route', 'priceUsd'], itemLabel);
    if (typeof offer.route !== 'string' || !SAFE_ROUTE.test(offer.route)) {
      throw new TypeError(`${itemLabel}.route must be a safe route`);
    }
    if (typeof offer.priceUsd !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(offer.priceUsd)
      || Number(offer.priceUsd) <= 0) {
      throw new TypeError(`${itemLabel}.priceUsd must be an exact positive USDC decimal`);
    }
    return { route: offer.route, priceUsd: offer.priceUsd };
  });
}

function the402Offers(value, payTo) {
  object(value, 'the402.allowedOffers');
  if (Object.keys(value).length === 0) throw new TypeError('the402.allowedOffers must not be empty');
  normalizeThe402Sales({}, { payTo, allowedOffers: value });
  return value;
}

function railwayOffers(value, payTo) {
  object(value, 'railway.allowedOffers');
  if (Object.keys(value).length === 0) throw new TypeError('railway.allowedOffers must not be empty');
  normalizeRailwaySettlements([], { payTo, allowedOffers: value });
  return value;
}

function validateConfig(input) {
  exactKeys(input, ['schemaVersion', 'imageSources', 'the402', 'claw', 'railway'], ['schemaVersion'], 'config');
  if (input.schemaVersion !== 1) throw new TypeError('config.schemaVersion must be 1');
  const output = { schemaVersion: 1, imageSources: [] };

  if (input.imageSources !== undefined) {
    if (!Array.isArray(input.imageSources)) throw new TypeError('config.imageSources must be an array');
    output.imageSources = input.imageSources.map((source, index) => {
      const label = `imageSources[${index}]`;
      exactKeys(source, ['salesPath', 'payTo', 'offers'], ['salesPath', 'payTo', 'offers'], label);
      return {
        salesPath: absolutePath(source.salesPath, `${label}.salesPath`),
        payTo: address(source.payTo, `${label}.payTo`),
        offers: imageOffers(source.offers, `${label}.offers`),
      };
    });
  }

  if (input.the402 !== undefined) {
    exactKeys(input.the402, ['baseUrl', 'credentialsPath', 'payTo', 'productId', 'allowedOffers'],
      ['baseUrl', 'credentialsPath', 'payTo', 'productId', 'allowedOffers'], 'the402');
    const payTo = address(input.the402.payTo, 'the402.payTo');
    output.the402 = {
      baseUrl: publicHttpsBaseUrl(input.the402.baseUrl, 'the402.baseUrl'),
      credentialsPath: absolutePath(input.the402.credentialsPath, 'the402.credentialsPath'),
      payTo,
      productId: identifier(input.the402.productId, 'the402.productId'),
      allowedOffers: the402Offers(input.the402.allowedOffers, payTo),
    };
  }

  if (input.claw !== undefined) {
    exactKeys(input.claw, ['baseUrl', 'assetId', 'payTo', 'priceUsd'],
      ['baseUrl', 'assetId', 'payTo', 'priceUsd'], 'claw');
    const payTo = address(input.claw.payTo, 'claw.payTo');
    const assetId = identifier(input.claw.assetId, 'claw.assetId');
    normalizeClawMerchantSales([], { assetId, payTo, priceUsd: input.claw.priceUsd });
    output.claw = {
      baseUrl: publicHttpsBaseUrl(input.claw.baseUrl, 'claw.baseUrl'),
      assetId,
      payTo,
      priceUsd: input.claw.priceUsd,
    };
  }

  if (input.railway !== undefined) {
    exactKeys(input.railway, ['baseUrl', 'payTo', 'allowedOffers'],
      ['baseUrl', 'payTo', 'allowedOffers'], 'railway');
    const payTo = address(input.railway.payTo, 'railway.payTo');
    output.railway = {
      baseUrl: publicHttpsBaseUrl(input.railway.baseUrl, 'railway.baseUrl'),
      payTo,
      allowedOffers: railwayOffers(input.railway.allowedOffers, payTo),
    };
  }

  if (output.imageSources.length === 0 && !output.the402 && !output.claw && !output.railway) {
    throw new TypeError('config must enable at least one sale source');
  }
  return output;
}

export function loadSaleObserverConfig(env = process.env, readFile = readFileSync) {
  const path = absolutePath(String(env[CONFIG_ENV] || '').trim(), CONFIG_ENV);
  let parsed;
  try { parsed = JSON.parse(readFile(path, 'utf8')); } catch { throw new TypeError('sale observer config is unreadable or invalid JSON'); }
  return validateConfig(parsed);
}

export function resolveSaleObserverStateRoot(env = process.env, home = homedir()) {
  const configured = String(env.LIFE_MANAGER_HOME || env.ANICCA_HOME || '').trim();
  return configured
    ? absolutePath(configured, 'LIFE_MANAGER_HOME or ANICCA_HOME')
    : join(home, '.local', 'state', 'rockstar_ibot');
}

function unwrap(body) {
  return body?.data ?? body;
}

function rows(value, key) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function metric(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchJson(fetchFn, url, { apiKey } = {}) {
  const headers = apiKey ? { 'X-API-Key': apiKey } : {};
  const response = await fetchFn(url, { headers, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) throw new Error(`HTTP ${response.status}`);
  return unwrap(body);
}

function validatePollInputs({ imageSources, the402, claw, railway }) {
  if (!Array.isArray(imageSources)) throw new TypeError('imageSources must be an array');
  imageSources.forEach((source, index) => {
    object(source, `imageSources[${index}]`);
    const offers = imageOffers(source.offers, `imageSources[${index}].offers`);
    for (const offer of offers) {
      normalizeImageSales([], { payTo: source.payTo, route: offer.route, priceUsd: offer.priceUsd });
    }
  });
  if (the402) {
    object(the402, 'the402');
    publicHttpsBaseUrl(the402.baseUrl, 'the402.baseUrl');
    if (typeof the402.apiKey !== 'string' || the402.apiKey.length < 16) {
      throw new TypeError('the402.apiKey is invalid');
    }
    identifier(the402.productId, 'the402.productId');
    the402Offers(the402.allowedOffers, address(the402.payTo, 'the402.payTo'));
  }
  if (claw) {
    object(claw, 'claw');
    publicHttpsBaseUrl(claw.baseUrl, 'claw.baseUrl');
    const assetId = identifier(claw.assetId, 'claw.assetId');
    const payTo = address(claw.payTo, 'claw.payTo');
    normalizeClawMerchantSales([], { assetId, payTo, priceUsd: claw.priceUsd });
  }
  if (railway) {
    object(railway, 'railway');
    publicHttpsBaseUrl(railway.baseUrl, 'railway.baseUrl');
    railwayOffers(railway.allowedOffers, address(railway.payTo, 'railway.payTo'));
  }
}

export async function pollSaleSources({
  fetchFn = fetch,
  imageSources = [],
  the402,
  claw,
  railway,
} = {}) {
  if (typeof fetchFn !== 'function') throw new TypeError('fetchFn must be a function');
  validatePollInputs({ imageSources, the402, claw, railway });
  const candidates = [];
  const errors = [];
  const metrics = {
    image: { settled_candidates: 0 },
    railway: { settlement_candidates: 0 },
    the402: {
      jobs: null,
      threads: null,
      settled_usd: null,
      held_usd: null,
      pending_usd: null,
      product_purchases: null,
      settlement_candidates: 0,
    },
    clawmerchants: {
      purchases: null,
      discovery_count: null,
      transaction_candidates: 0,
    },
  };

  for (const source of imageSources) {
    try {
      if (!Array.isArray(source.offers) || source.offers.length === 0) {
        throw new TypeError('image source offers are required');
      }
      for (const offer of source.offers) {
        candidates.push(...normalizeImageSales(source.rows, {
          payTo: source.payTo,
          route: offer.route,
          priceUsd: offer.priceUsd,
        }));
      }
    } catch {
      errors.push({ source: 'x402-image', code: 'source_invalid' });
    }
  }
  metrics.image.settled_candidates = candidates.length;

  if (railway) {
    try {
      const body = await fetchJson(fetchFn, endpoint(railway.baseUrl, 'settlements?limit=100'));
      const railwayCandidates = normalizeRailwaySettlements(rows(body, 'settlements'), {
        payTo: railway.payTo,
        allowedOffers: railway.allowedOffers,
      });
      candidates.push(...railwayCandidates);
      metrics.railway.settlement_candidates = railwayCandidates.length;
    } catch {
      errors.push({ source: 'x402-railway', code: 'poll_failed' });
    }
  }

  if (the402) {
    try {
      const [jobsBody, threadsBody, earningsBody, productBody] = await Promise.all([
        fetchJson(fetchFn, endpoint(the402.baseUrl, 'v1/jobs'), { apiKey: the402.apiKey }),
        fetchJson(fetchFn, endpoint(the402.baseUrl, 'v1/threads'), { apiKey: the402.apiKey }),
        fetchJson(fetchFn, endpoint(the402.baseUrl, 'v1/provider/earnings'), { apiKey: the402.apiKey }),
        fetchJson(fetchFn, endpoint(the402.baseUrl, `v1/products/${the402.productId}`), { apiKey: the402.apiKey }),
      ]);
      const jobs = rows(jobsBody, 'jobs');
      const threads = rows(threadsBody, 'threads');
      const the402Candidates = normalizeThe402Sales(earningsBody, {
        payTo: the402.payTo,
        allowedOffers: the402.allowedOffers,
      });
      candidates.push(...the402Candidates);
      metrics.the402 = {
        jobs: jobs.length,
        threads: threads.length,
        settled_usd: metric(earningsBody?.earnings?.settled_usd),
        held_usd: metric(earningsBody?.earnings?.held_usd),
        pending_usd: metric(earningsBody?.earnings?.pending_usd),
        product_purchases: metric(productBody?.total_purchases ?? productBody?.purchase_count),
        settlement_candidates: the402Candidates.length,
      };
    } catch {
      errors.push({ source: 'the402', code: 'poll_failed' });
    }
  }

  if (claw) {
    try {
      const [assetBody, transactionsBody] = await Promise.all([
        fetchJson(fetchFn, endpoint(claw.baseUrl, `api/v1/assets/${claw.assetId}`)),
        fetchJson(fetchFn, endpoint(claw.baseUrl, 'api/v1/transactions?limit=100')),
      ]);
      const asset = assetBody?.asset ?? assetBody;
      const transactions = rows(transactionsBody, 'transactions');
      const clawCandidates = normalizeClawMerchantSales(transactions, {
        assetId: claw.assetId,
        payTo: claw.payTo,
        priceUsd: claw.priceUsd,
      });
      candidates.push(...clawCandidates);
      metrics.clawmerchants = {
        purchases: metric(asset?.totalPurchases ?? asset?.total_purchases),
        discovery_count: metric(asset?.discoveryCount ?? asset?.discovery_count),
        transaction_candidates: clawCandidates.length,
      };
    } catch {
      errors.push({ source: 'clawmerchants', code: 'poll_failed' });
    }
  }

  return {
    candidates,
    metrics,
    errors,
  };
}

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function configuredThe402(config) {
  if (!config.the402) return undefined;
  let credentials;
  try { credentials = JSON.parse(readFileSync(config.the402.credentialsPath, 'utf8')); } catch {
    throw new TypeError('the402 credentials are unreadable or invalid JSON');
  }
  if (typeof credentials?.api_key !== 'string' || credentials.api_key.length < 16) {
    throw new TypeError('the402 credentials are invalid');
  }
  const { credentialsPath: _credentialsPath, ...publicConfig } = config.the402;
  return { ...publicConfig, apiKey: credentials.api_key };
}

function notifyCandidate() {
  spawnSync('/usr/bin/osascript', ['-e', 'display notification "Sale candidate detected; awaiting finalized Base verification." with title "x402 candidate"'], {
    stdio: 'ignore',
    timeout: 5_000,
  });
}

export async function runSaleObserver({
  env = process.env,
  fetchFn = fetch,
  home = homedir(),
  now = () => new Date().toISOString(),
  notify = notifyCandidate,
} = {}) {
  const config = loadSaleObserverConfig(env);
  const stateRoot = resolveSaleObserverStateRoot(env, home);
  const the402 = configuredThe402(config);
  const imageSources = config.imageSources.map((source) => ({
    payTo: source.payTo,
    offers: source.offers,
    rows: readJsonLines(source.salesPath),
  }));
  const result = await pollSaleSources({
    fetchFn,
    imageSources,
    the402,
    claw: config.claw,
    railway: config.railway,
  });
  const store = join(stateRoot, 'state', 'x402-sale-candidates.jsonl');
  const write = appendUniqueSaleCandidates(store, result.candidates);
  const candidateNotice = write.recorded > 0;
  const summary = {
    observed_at: now(),
    metrics: result.metrics,
    errors: result.errors,
    candidates_seen: result.candidates.length,
    ...write,
    candidate_not_verified_revenue: candidateNotice,
  };
  if (candidateNotice) notify();
  return { summary, store };
}

async function main() {
  const { summary } = await runSaleObserver();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch(() => {
    process.stderr.write('{"ok":false,"error":"observer_failed"}\n');
    process.exitCode = 1;
  });
}

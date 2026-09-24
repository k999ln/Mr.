import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

export const PRODUCT_HUNT_GRAPHQL_ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';
export const PRODUCT_HUNT_SOURCE_ID = 'producthunt';
export const PRODUCT_HUNT_ACCESS_TOKEN_ENV = 'PRODUCT_HUNT_ACCESS_TOKEN';
export const PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV = 'PRODUCT_HUNT_COMMERCIAL_API_APPROVED';
export const PRODUCT_HUNT_CANDIDATE_QUEUE_SCHEMA = 'https://raw.githubusercontent.com/k999ln/Mr./main/integrations/ai-tools/discovery/producthunt-candidate-queue.schema.json';

const SOURCE_SCHEMA = './producthunt-source.schema.json';
const PRODUCT_HUNT_ORIGIN = 'https://www.producthunt.com';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RUN_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const APPROVAL_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9:./_-]{0,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUERY_CONTROL = /[\u0000-\u001f\u007f]/;
const EXACT_SOURCE_KEYS = new Set([
  '$schema',
  'schemaVersion',
  'id',
  'displayName',
  'access',
  'commercialUse',
  'policy',
  'search',
]);

export const PRODUCT_HUNT_TOPICS_QUERY = `
  query RockstarIbotResolveProductHuntTopics($query: String!, $first: Int!) {
    topics(query: $query, first: $first) {
      edges {
        node {
          id
          name
          slug
          url
        }
      }
    }
  }
`;

export const PRODUCT_HUNT_POSTS_QUERY = `
  query RockstarIbotDiscoverProductHuntPosts(
    $topic: String!
    $first: Int!
    $postedAfter: DateTime!
    $postedBefore: DateTime!
  ) {
    posts(
      topic: $topic
      first: $first
      order: NEWEST
      postedAfter: $postedAfter
      postedBefore: $postedBefore
    ) {
      edges {
        node {
          id
          name
          tagline
          description
          slug
          url
          website
          votesCount
          createdAt
          featuredAt
          topics(first: 10) {
            edges {
              node {
                id
                name
                slug
              }
            }
          }
        }
      }
    }
  }
`;

export class ProductHuntDiscoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ProductHuntDiscoveryError';
    this.code = code;
    this.details = details;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, field, errors) {
  if (!isObject(value)) {
    errors.push(`${field} must be an object`);
    return false;
  }
  let valid = true;
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      errors.push(`${field}.${key} is an unknown field`);
      valid = false;
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${field}.${key} is required`);
      valid = false;
    }
  }
  return valid;
}

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function stringInRange(value, minimum, maximum) {
  if (typeof value !== 'string') return false;
  const length = [...value].length;
  return length >= minimum && length <= maximum;
}

function validQuery(value) {
  return stringInRange(value, 2, 80)
    && value === value.trim()
    && !QUERY_CONTROL.test(value);
}

function validRawIdentifier(value) {
  return typeof value === 'string'
    || (Number.isSafeInteger(value) && value >= 0);
}

export function validateProductHuntSource(source) {
  const errors = [];
  if (!exactKeys(source, EXACT_SOURCE_KEYS, 'source', errors)) return { ok: false, errors };

  if (source.$schema !== SOURCE_SCHEMA) errors.push(`source.$schema must equal ${SOURCE_SCHEMA}`);
  if (source.schemaVersion !== 1) errors.push('source.schemaVersion must equal 1');
  if (source.id !== PRODUCT_HUNT_SOURCE_ID) errors.push(`source.id must equal ${PRODUCT_HUNT_SOURCE_ID}`);
  if (source.displayName !== 'Product Hunt') errors.push('source.displayName must equal Product Hunt');

  const accessKeys = new Set(['mode', 'endpoint', 'scope', 'productionCredentialMode', 'credentialEnv', 'commercialApprovalEnv']);
  if (exactKeys(source.access, accessKeys, 'source.access', errors)) {
    if (source.access.mode !== 'official_graphql_api') errors.push('source.access.mode must use the official GraphQL API');
    if (source.access.endpoint !== PRODUCT_HUNT_GRAPHQL_ENDPOINT) errors.push('source.access.endpoint must be the exact official Product Hunt GraphQL endpoint');
    if (source.access.scope !== 'public') errors.push('source.access.scope must be public/read-only');
    if (source.access.productionCredentialMode !== 'client_credentials_via_server_secret_broker') errors.push('source.access.productionCredentialMode must keep Product Hunt credentials on the server');
    if (source.access.credentialEnv !== PRODUCT_HUNT_ACCESS_TOKEN_ENV) errors.push(`source.access.credentialEnv must equal ${PRODUCT_HUNT_ACCESS_TOKEN_ENV}`);
    if (source.access.commercialApprovalEnv !== PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV) errors.push(`source.access.commercialApprovalEnv must equal ${PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV}`);
  }

  const commercialKeys = new Set(['state', 'approvalReference', 'contact', 'apiPolicyUrl', 'legalTermsUrl']);
  if (exactKeys(source.commercialUse, commercialKeys, 'source.commercialUse', errors)) {
    if (!['permission_required', 'approved'].includes(source.commercialUse.state)) errors.push('source.commercialUse.state is unsupported');
    if (source.commercialUse.state === 'approved' && (typeof source.commercialUse.approvalReference !== 'string'
      || !APPROVAL_REFERENCE.test(source.commercialUse.approvalReference))) {
      errors.push('source.commercialUse.approvalReference is required when commercial use is approved');
    }
    if (source.commercialUse.state === 'permission_required' && source.commercialUse.approvalReference !== null) {
      errors.push('source.commercialUse.approvalReference must remain null until permission is approved');
    }
    if (source.commercialUse.contact !== 'hello@producthunt.com') errors.push('source.commercialUse.contact must use Product Hunt API support');
    if (source.commercialUse.apiPolicyUrl !== 'https://api.producthunt.com/v2/docs') errors.push('source.commercialUse.apiPolicyUrl must reference the official API policy');
    if (source.commercialUse.legalTermsUrl !== 'https://www.producthunt.com/legal') errors.push('source.commercialUse.legalTermsUrl must reference the official legal terms');
  }

  const policyKeys = new Set([
    'scrapingAllowed',
    'autoApprovePackages',
    'candidateState',
    'candidateRetentionDays',
    'attributionLabel',
    'attributionUrl',
  ]);
  if (exactKeys(source.policy, policyKeys, 'source.policy', errors)) {
    if (source.policy.scrapingAllowed !== false) errors.push('source.policy.scrapingAllowed must be false');
    if (source.policy.autoApprovePackages !== false) errors.push('source.policy.autoApprovePackages must be false');
    if (source.policy.candidateState !== 'candidate_only') errors.push('source.policy.candidateState must equal candidate_only');
    if (!integerInRange(source.policy.candidateRetentionDays, 1, 30)) errors.push('source.policy.candidateRetentionDays must be from 1 through 30');
    if (source.policy.attributionLabel !== 'Source: Product Hunt') errors.push('source.policy.attributionLabel must preserve Product Hunt attribution');
    if (source.policy.attributionUrl !== PRODUCT_HUNT_ORIGIN) errors.push('source.policy.attributionUrl must link to Product Hunt');
  }

  const searchKeys = new Set(['strategy', 'defaultQueries', 'topicLimit', 'postsPerTopic', 'lookbackDays', 'maxCandidates', 'minimumRemainingBudget']);
  if (exactKeys(source.search, searchKeys, 'source.search', errors)) {
    if (source.search.strategy !== 'topics_then_posts') errors.push('source.search.strategy must use documented topics then posts operations');
    if (!Array.isArray(source.search.defaultQueries) || source.search.defaultQueries.length < 1 || source.search.defaultQueries.length > 8) {
      errors.push('source.search.defaultQueries must contain 1 through 8 queries');
    } else {
      const normalized = new Set();
      for (const query of source.search.defaultQueries) {
        if (!validQuery(query)) errors.push('source.search.defaultQueries contains an invalid query');
        const key = typeof query === 'string' ? query.toLocaleLowerCase('en-US') : '';
        if (normalized.has(key)) errors.push('source.search.defaultQueries contains a duplicate query');
        normalized.add(key);
      }
    }
    if (!integerInRange(source.search.topicLimit, 1, 5)) errors.push('source.search.topicLimit must be from 1 through 5');
    if (!integerInRange(source.search.postsPerTopic, 1, 20)) errors.push('source.search.postsPerTopic must be from 1 through 20');
    if (!integerInRange(source.search.lookbackDays, 1, 365)) errors.push('source.search.lookbackDays must be from 1 through 365');
    if (!integerInRange(source.search.maxCandidates, 1, 100)) errors.push('source.search.maxCandidates must be from 1 through 100');
    if (!integerInRange(source.search.minimumRemainingBudget, 1, 6250)) errors.push('source.search.minimumRemainingBudget must be from 1 through 6250');
  }

  return { ok: errors.length === 0, errors };
}

function requireValidSource(source) {
  const validation = validateProductHuntSource(source);
  if (!validation.ok) {
    throw new ProductHuntDiscoveryError('invalid_source_config', validation.errors.join('; '));
  }
}

function normalizeQueries(values, allowedQueries) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8) {
    throw new ProductHuntDiscoveryError('invalid_queries', 'Product Hunt discovery requires 1 through 8 queries.');
  }
  const allowed = new Map(allowedQueries.map((query) => [query.toLocaleLowerCase('en-US'), query]));
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (!validQuery(value)) {
      throw new ProductHuntDiscoveryError('invalid_queries', 'Each Product Hunt query must contain 2 through 80 characters.');
    }
    const key = value.toLocaleLowerCase('en-US');
    const query = allowed.get(key);
    if (!query) {
      throw new ProductHuntDiscoveryError(
        'query_not_allowlisted',
        'Product Hunt queries must be selected from source.search.defaultQueries; arbitrary external data egress is disabled.',
      );
    }
    if (seen.has(key)) {
      throw new ProductHuntDiscoveryError('invalid_queries', 'Product Hunt queries must be unique.');
    }
    result.push(query);
    seen.add(key);
  }
  return result;
}

function cleanText(value, maximum) {
  if (typeof value !== 'string') return '';
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...normalized].slice(0, maximum).join('');
}

function cleanIdentifier(value) {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : cleanText(value, 128);
  return IDENTIFIER.test(normalized) ? normalized : null;
}

function cleanSlug(value) {
  const normalized = cleanText(value, 160).toLocaleLowerCase('en-US');
  return SLUG.test(normalized) ? normalized : null;
}

function cleanHttpsUrl(value, { productHuntOnly = false, productHuntPathPrefix = null } = {}) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (productHuntOnly && !['producthunt.com', 'www.producthunt.com'].includes(hostname)) return null;
    if (productHuntPathPrefix && !url.pathname.startsWith(productHuntPathPrefix)) return null;
    if (!productHuntOnly && (hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || hostname === 'metadata.google.internal'
      || isIP(hostname.replace(/^\[|\]$/g, '')) !== 0)) return null;
    if (productHuntOnly) url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function cleanDate(value) {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function cleanNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function rateLimitFromHeaders(headers) {
  const integerHeader = (name) => {
    const value = headers?.get?.(name);
    if (value === null || value === undefined || !/^\d+$/.test(value)) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  return {
    limit: integerHeader('x-rate-limit-limit'),
    remaining: integerHeader('x-rate-limit-remaining'),
    reset: integerHeader('x-rate-limit-reset'),
  };
}

function mergeRateLimit(current, next) {
  if (!current) return next;
  const remaining = [current.remaining, next.remaining].filter(Number.isInteger);
  return {
    limit: next.limit ?? current.limit,
    remaining: remaining.length ? Math.min(...remaining) : null,
    reset: next.reset ?? current.reset,
  };
}

function requireRateLimitBudget(rateLimit, minimumRemainingBudget) {
  if (Number.isInteger(rateLimit?.remaining) && rateLimit.remaining <= minimumRemainingBudget) {
    throw new ProductHuntDiscoveryError(
      'rate_limit_budget_low',
      'Product Hunt rate-limit budget is at or below the configured safety reserve; discovery stopped without retry.',
      { rateLimit, minimumRemainingBudget },
    );
  }
}

async function readBoundedJson(response, maximumRunResponseBytes) {
  if (!Number.isInteger(maximumRunResponseBytes) || maximumRunResponseBytes < 1) {
    throw new ProductHuntDiscoveryError(
      'run_response_budget_exceeded',
      'Product Hunt discovery exhausted the cumulative response-byte budget.',
      { maximumBytes: MAX_RUN_RESPONSE_BYTES },
    );
  }
  const maximumResponseBytes = Math.min(MAX_RESPONSE_BYTES, maximumRunResponseBytes);
  const responseTooLarge = () => {
    if (maximumRunResponseBytes < MAX_RESPONSE_BYTES) {
      return new ProductHuntDiscoveryError(
        'run_response_budget_exceeded',
        'Product Hunt discovery exceeded the cumulative response-byte budget.',
        { maximumBytes: MAX_RUN_RESPONSE_BYTES },
      );
    }
    return new ProductHuntDiscoveryError('response_too_large', 'Product Hunt response exceeded the configured size limit.');
  };
  const contentLength = response.headers?.get?.('content-length') ?? '';
  const declaredLength = /^\d+$/.test(contentLength) ? Number.parseInt(contentLength, 10) : null;
  if (Number.isSafeInteger(declaredLength) && declaredLength > maximumResponseBytes) {
    throw responseTooLarge();
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt response did not provide a readable body stream.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!(value instanceof Uint8Array)) {
      await reader.cancel().catch(() => {});
      throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt response body used an unsupported stream chunk.');
    }
    totalBytes += value.byteLength;
    if (totalBytes > maximumResponseBytes) {
      await reader.cancel().catch(() => {});
      throw responseTooLarge();
    }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks, totalBytes).toString('utf8');
  try {
    return { payload: JSON.parse(text), responseBytes: totalBytes };
  } catch {
    throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt returned invalid JSON.');
  }
}

async function productHuntGraphQL({ token, operation, variables, fetchImpl, signal, maximumRunResponseBytes }) {
  let response;
  try {
    response = await fetchImpl(PRODUCT_HUNT_GRAPHQL_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'user-agent': 'RockstarIbot-AIToolDiscovery/1.0',
      },
      body: JSON.stringify({ query: operation, variables }),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ProductHuntDiscoveryError('request_timeout', 'Product Hunt request timed out.');
    }
    throw new ProductHuntDiscoveryError('network_error', 'Product Hunt request failed before a valid response was received.');
  }

  const rateLimit = rateLimitFromHeaders(response.headers);
  if (response.status === 429) {
    throw new ProductHuntDiscoveryError('rate_limited', 'Product Hunt rate limit was reached; this connector does not retry immediately.', { rateLimit });
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProductHuntDiscoveryError('authorization_failed', 'Product Hunt rejected the connector credential or permission.', { status: response.status, rateLimit });
  }
  if (!response.ok) {
    throw new ProductHuntDiscoveryError('http_error', `Product Hunt returned HTTP ${response.status}.`, { status: response.status, rateLimit });
  }
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt response must use application/json.', { rateLimit });
  }

  let payload;
  let responseBytes;
  try {
    ({ payload, responseBytes } = await readBoundedJson(response, maximumRunResponseBytes));
  } catch (error) {
    if (error instanceof ProductHuntDiscoveryError) throw error;
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new ProductHuntDiscoveryError('request_timeout', 'Product Hunt response body timed out.');
    }
    throw new ProductHuntDiscoveryError('network_error', 'Product Hunt response body could not be read.');
  }
  if (!isObject(payload)) {
    throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt response was not a JSON object.', { rateLimit });
  }
  if (Object.hasOwn(payload, 'errors') && !Array.isArray(payload.errors)) {
    throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt GraphQL errors field changed shape.', { rateLimit });
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const messages = payload.errors.slice(0, 5).map((error) => cleanText(error?.message, 240) || 'GraphQL error');
    throw new ProductHuntDiscoveryError('graphql_error', `Product Hunt GraphQL error: ${messages.join('; ')}`, { rateLimit });
  }
  if (!isObject(payload.data)) {
    throw new ProductHuntDiscoveryError('invalid_response', 'Product Hunt response did not include a GraphQL data object.', { rateLimit });
  }
  if (![rateLimit.limit, rateLimit.remaining, rateLimit.reset].every(Number.isInteger)) {
    throw new ProductHuntDiscoveryError('rate_limit_headers_missing', 'Product Hunt response omitted required rate-limit headers.', { rateLimit });
  }
  return { data: payload.data, rateLimit, responseBytes };
}

function addRunResponseBytes(current, increment) {
  const total = current + increment;
  if (!Number.isSafeInteger(total) || total > MAX_RUN_RESPONSE_BYTES) {
    throw new ProductHuntDiscoveryError(
      'run_response_budget_exceeded',
      'Product Hunt discovery exceeded the cumulative response-byte budget.',
      { maximumBytes: MAX_RUN_RESPONSE_BYTES },
    );
  }
  return total;
}

function topicNodes(data, expectedLimit) {
  const edges = data?.topics?.edges;
  if (!Array.isArray(edges)) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt topics response did not match the pinned contract.');
  if (edges.length > expectedLimit) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt topics response exceeded the requested edge limit.');
  const result = [];
  for (const edge of edges) {
    if (!isObject(edge) || !isObject(edge.node)) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt topic edge did not include a node object.');
    }
    const node = edge?.node;
    for (const field of ['id', 'name', 'slug', 'url']) {
      if (!Object.hasOwn(node, field)
        || (field === 'id' ? !validRawIdentifier(node[field]) : typeof node[field] !== 'string')) {
        throw new ProductHuntDiscoveryError('schema_changed', `Product Hunt topic.${field} did not match the pinned contract.`);
      }
    }
    const id = cleanIdentifier(node?.id);
    const slug = cleanSlug(node?.slug);
    const name = cleanText(node?.name, 120);
    const sourceUrl = cleanHttpsUrl(node?.url, { productHuntOnly: true, productHuntPathPrefix: '/topics/' });
    if (!id || !slug || !name || !sourceUrl) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt topic metadata did not match the pinned contract.');
    }
    result.push({
      id,
      slug,
      name,
      sourceUrl,
    });
  }
  return result;
}

function postNodes(data, expectedLimit) {
  const edges = data?.posts?.edges;
  if (!Array.isArray(edges)) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt posts response did not match the pinned contract.');
  if (edges.length > expectedLimit) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt posts response exceeded the requested edge limit.');
  const required = ['id', 'name', 'tagline', 'description', 'slug', 'url', 'website', 'votesCount', 'createdAt', 'featuredAt', 'topics'];
  return edges.map((edge) => {
    if (!isObject(edge) || !isObject(edge.node)) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post edge did not include a node object.');
    }
    const node = edge.node;
    for (const field of required) {
      if (!Object.hasOwn(node, field)) {
        throw new ProductHuntDiscoveryError('schema_changed', `Product Hunt post.${field} was missing from the pinned contract.`);
      }
    }
    if (!validRawIdentifier(node.id)
      || typeof node.name !== 'string'
      || typeof node.tagline !== 'string'
      || ![null, 'string'].includes(node.description === null ? null : typeof node.description)
      || typeof node.slug !== 'string'
      || typeof node.url !== 'string'
      || typeof node.website !== 'string'
      || !Number.isInteger(node.votesCount)
      || node.votesCount < 0
      || typeof node.createdAt !== 'string'
      || ![null, 'string'].includes(node.featuredAt === null ? null : typeof node.featuredAt)
      || !isObject(node.topics)) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post metadata changed type.');
    }
    return node;
  });
}

function topicMetadata(value) {
  const edges = value?.edges;
  if (!Array.isArray(edges)) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post topics did not match the pinned contract.');
  if (edges.length > 10) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post topics exceeded the requested edge limit.');
  const topics = [];
  const seen = new Set();
  for (const edge of edges) {
    if (!isObject(edge) || !isObject(edge.node)) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post topic edge did not include a node object.');
    }
    const node = edge?.node;
    for (const field of ['id', 'name', 'slug']) {
      if (!Object.hasOwn(node, field)
        || (field === 'id' ? !validRawIdentifier(node[field]) : typeof node[field] !== 'string')) {
        throw new ProductHuntDiscoveryError('schema_changed', `Product Hunt post topic.${field} changed type.`);
      }
    }
    const id = cleanIdentifier(node?.id);
    const slug = cleanSlug(node?.slug);
    const name = cleanText(node?.name, 120);
    if (!id || !slug || !name) {
      throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post topic metadata did not match the pinned contract.');
    }
    if (seen.has(slug)) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post topics contained a duplicate slug.');
    seen.add(slug);
    topics.push({ id, slug, name });
  }
  return topics;
}

function words(value) {
  return new Set(cleanText(value, 4000).toLocaleLowerCase('en-US').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 2));
}

function relevanceScore(node, matchedQueries, topics) {
  const corpus = words([
    node?.name,
    node?.tagline,
    node?.description,
    ...topics.flatMap((topic) => [topic.name, topic.slug]),
  ].filter(Boolean).join(' '));
  let score = 0;
  for (const query of matchedQueries) {
    const queryWords = [...words(query)];
    const matched = queryWords.filter((word) => corpus.has(word)).length;
    score += matched;
    if (matched > 0 && matched === queryWords.length) score += 2;
  }
  score += topics.filter((topic) => matchedQueries.some((query) => {
    const queryWords = [...words(query)];
    const topicWords = words(`${topic.name} ${topic.slug}`);
    return queryWords.length > 0 && queryWords.every((word) => topicWords.has(word));
  })).length * 2;
  return score;
}

function candidateFromNode(node, matchedQueries) {
  const sourceProductId = cleanIdentifier(node?.id);
  const slug = cleanSlug(node?.slug);
  const name = cleanText(node?.name, 160);
  const tagline = cleanText(node?.tagline, 240);
  if (!sourceProductId || !slug || !name) {
    throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post identifiers did not match the pinned contract.');
  }
  const topics = topicMetadata(node?.topics);
  const sourceUrl = cleanHttpsUrl(node?.url, { productHuntOnly: true, productHuntPathPrefix: '/posts/' });
  if (!sourceUrl) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post URL did not match the pinned contract.');
  const websiteUrl = cleanHttpsUrl(node?.website);
  const createdAt = cleanDate(node?.createdAt);
  const featuredAt = cleanDate(node?.featuredAt);
  if (!createdAt || (node.featuredAt !== null && !featuredAt)) {
    throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post date did not match the pinned contract.');
  }
  return {
    candidateId: `producthunt:${sourceProductId}`,
    sourceProductId,
    name,
    tagline,
    sourceUrl,
    websiteUrl,
    observedLaunchAt: featuredAt ?? createdAt,
    featuredAt,
    votesCount: cleanNonNegativeInteger(node?.votesCount),
    topics,
    matchedQueries: [...new Set(matchedQueries)].sort((left, right) => left.localeCompare(right, 'en')),
    relevanceScore: relevanceScore(node, matchedQueries, topics),
    state: 'candidate_only',
    contentTrust: 'untrusted_external_metadata',
    nextReview: 'publisher_api_mcp_terms_security',
    websiteVisitAllowed: false,
  };
}

function isoDate(value, field) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ProductHuntDiscoveryError('invalid_time', `${field} must be a valid date.`);
  return date;
}

function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function validateProductHuntCandidateQueue(queue, { source } = {}) {
  const errors = [];
  const sourceValidation = validateProductHuntSource(source);
  if (!sourceValidation.ok) errors.push(...sourceValidation.errors.map((error) => `sourceConfig: ${error}`));
  const configuredQueries = Array.isArray(source?.search?.defaultQueries) ? source.search.defaultQueries : [];
  const queueQueries = Array.isArray(queue?.search?.queries) ? queue.search.queries : [];
  const queueMatchedTopics = Array.isArray(queue?.search?.matchedTopics) ? queue.search.matchedTopics : [];

  const queueKeys = new Set(['$schema', 'schemaVersion', 'source', 'generatedAt', 'expiresAt', 'search', 'intake', 'receipt', 'candidates']);
  if (!exactKeys(queue, queueKeys, 'queue', errors)) return { ok: false, errors };
  if (queue.$schema !== PRODUCT_HUNT_CANDIDATE_QUEUE_SCHEMA) errors.push('queue.$schema is not the pinned candidate queue schema');
  if (queue.schemaVersion !== 1) errors.push('queue.schemaVersion must equal 1');

  const queueSourceKeys = new Set(['id', 'displayName', 'method', 'endpoint', 'attributionLabel', 'attributionUrl']);
  if (exactKeys(queue.source, queueSourceKeys, 'queue.source', errors)) {
    if (queue.source.id !== PRODUCT_HUNT_SOURCE_ID) errors.push('queue.source.id must equal producthunt');
    if (queue.source.displayName !== 'Product Hunt') errors.push('queue.source.displayName must equal Product Hunt');
    if (queue.source.method !== 'official_graphql_api') errors.push('queue.source.method must equal official_graphql_api');
    if (queue.source.endpoint !== PRODUCT_HUNT_GRAPHQL_ENDPOINT) errors.push('queue.source.endpoint is not the official Product Hunt API');
    if (queue.source.attributionLabel !== 'Source: Product Hunt') errors.push('queue.source.attributionLabel is invalid');
    if (queue.source.attributionUrl !== PRODUCT_HUNT_ORIGIN) errors.push('queue.source.attributionUrl is invalid');
  }

  if (!isIsoDate(queue.generatedAt)) errors.push('queue.generatedAt must be a canonical ISO date-time');
  if (!isIsoDate(queue.expiresAt)) errors.push('queue.expiresAt must be a canonical ISO date-time');

  const searchKeys = new Set(['strategy', 'queries', 'matchedTopics', 'postedAfter', 'postedBefore']);
  if (exactKeys(queue.search, searchKeys, 'queue.search', errors)) {
    if (queue.search.strategy !== 'topics_then_posts') errors.push('queue.search.strategy must equal topics_then_posts');
    if (!Array.isArray(queue.search.queries) || queue.search.queries.length < 1 || queue.search.queries.length > 8) {
      errors.push('queue.search.queries must contain 1 through 8 values');
    } else {
      const allowed = new Set(configuredQueries
        .filter((query) => typeof query === 'string')
        .map((query) => query.toLocaleLowerCase('en-US')));
      const seen = new Set();
      for (const query of queue.search.queries) {
        const key = typeof query === 'string' ? query.toLocaleLowerCase('en-US') : '';
        if (!validQuery(query) || !allowed.has(key)) errors.push('queue.search.queries contains a non-allowlisted query');
        if (seen.has(key)) errors.push('queue.search.queries contains a duplicate query');
        seen.add(key);
      }
    }
    if (!Array.isArray(queue.search.matchedTopics)
      || queue.search.matchedTopics.length > (queue.search.queries?.length ?? 0) * (source?.search?.topicLimit ?? 0)) {
      errors.push('queue.search.matchedTopics exceeded the configured bound');
    } else {
      const seenTopicSlugs = new Set();
      for (const [index, topic] of queue.search.matchedTopics.entries()) {
        const prefix = `queue.search.matchedTopics[${index}]`;
        const keys = new Set(['id', 'slug', 'name', 'sourceUrl', 'matchedQueries']);
        if (!exactKeys(topic, keys, prefix, errors)) continue;
        if (!stringInRange(topic.id, 1, 128) || !IDENTIFIER.test(topic.id)) errors.push(`${prefix}.id is invalid`);
        if (!stringInRange(topic.slug, 1, 160) || !SLUG.test(topic.slug)) errors.push(`${prefix}.slug is invalid`);
        if (!stringInRange(topic.name, 1, 120)) errors.push(`${prefix}.name is invalid`);
        const sourceUrl = cleanHttpsUrl(topic.sourceUrl, { productHuntOnly: true, productHuntPathPrefix: '/topics/' });
        if (!sourceUrl || sourceUrl !== topic.sourceUrl) errors.push(`${prefix}.sourceUrl is invalid`);
        if (seenTopicSlugs.has(topic.slug)) errors.push(`${prefix}.slug is duplicated`);
        seenTopicSlugs.add(topic.slug);
        if (!Array.isArray(topic.matchedQueries) || topic.matchedQueries.length < 1 || topic.matchedQueries.length > 8) {
          errors.push(`${prefix}.matchedQueries is invalid`);
        } else {
          if (!topic.matchedQueries.every((query) => queueQueries.includes(query))) {
            errors.push(`${prefix}.matchedQueries must be a subset of queue.search.queries`);
          }
          if (new Set(topic.matchedQueries).size !== topic.matchedQueries.length) {
            errors.push(`${prefix}.matchedQueries must be unique`);
          }
        }
      }
    }
    if (!isIsoDate(queue.search.postedAfter) || !isIsoDate(queue.search.postedBefore)) {
      errors.push('queue.search date bounds must be canonical ISO date-times');
    }
    if (queue.search.postedBefore !== queue.generatedAt) errors.push('queue.search.postedBefore must equal queue.generatedAt');
    if (isIsoDate(queue.search.postedBefore)
      && isIsoDate(queue.search.postedAfter)
      && integerInRange(source?.search?.lookbackDays, 1, 365)) {
      const expectedPostedAfter = new Date(new Date(queue.search.postedBefore).getTime() - source.search.lookbackDays * 86_400_000).toISOString();
      if (queue.search.postedAfter !== expectedPostedAfter) errors.push('queue.search.postedAfter does not match the configured lookback');
    }
  }

  if (isIsoDate(queue.generatedAt)
    && isIsoDate(queue.expiresAt)
    && integerInRange(source?.policy?.candidateRetentionDays, 1, 30)) {
    const expectedExpiry = new Date(new Date(queue.generatedAt).getTime() + source.policy.candidateRetentionDays * 86_400_000).toISOString();
    if (queue.expiresAt !== expectedExpiry) errors.push('queue.expiresAt does not match the configured retention period');
  }

  const intakeKeys = new Set([
    'state',
    'autoApprovePackages',
    'installEnabled',
    'executionEnabled',
    'candidateDataTrusted',
    'websiteVisitEnabled',
    'integrityState',
  ]);
  if (exactKeys(queue.intake, intakeKeys, 'queue.intake', errors)) {
    if (queue.intake.state !== 'candidate_only') errors.push('queue.intake.state must equal candidate_only');
    for (const field of ['autoApprovePackages', 'installEnabled', 'executionEnabled', 'candidateDataTrusted', 'websiteVisitEnabled']) {
      if (queue.intake[field] !== false) errors.push(`queue.intake.${field} must be false`);
    }
    if (queue.intake.integrityState !== 'unsigned_operator_observation') {
      errors.push('queue.intake.integrityState must mark the queue as unsigned');
    }
  }

  const candidateIds = [];
  if (!Array.isArray(queue.candidates) || queue.candidates.length > (source?.search?.maxCandidates ?? 0)) {
    errors.push('queue.candidates exceeded the configured bound');
  } else {
    const seenCandidateIds = new Set();
    for (const [index, candidate] of queue.candidates.entries()) {
      const prefix = `queue.candidates[${index}]`;
      const keys = new Set([
        'candidateId', 'sourceProductId', 'name', 'tagline', 'sourceUrl', 'websiteUrl', 'observedLaunchAt',
        'featuredAt', 'votesCount', 'topics', 'matchedQueries', 'relevanceScore', 'state', 'contentTrust',
        'nextReview', 'websiteVisitAllowed',
      ]);
      if (!exactKeys(candidate, keys, prefix, errors)) continue;
      if (!stringInRange(candidate.sourceProductId, 1, 128) || !IDENTIFIER.test(candidate.sourceProductId)) errors.push(`${prefix}.sourceProductId is invalid`);
      if (candidate.candidateId !== `producthunt:${candidate.sourceProductId}`) errors.push(`${prefix}.candidateId is inconsistent`);
      if (seenCandidateIds.has(candidate.candidateId)) errors.push(`${prefix}.candidateId is duplicated`);
      seenCandidateIds.add(candidate.candidateId);
      candidateIds.push(candidate.candidateId);
      if (!stringInRange(candidate.name, 1, 160)) errors.push(`${prefix}.name is invalid`);
      if (!stringInRange(candidate.tagline, 0, 240)) errors.push(`${prefix}.tagline is invalid`);
      const sourceUrl = cleanHttpsUrl(candidate.sourceUrl, { productHuntOnly: true, productHuntPathPrefix: '/posts/' });
      if (!sourceUrl || sourceUrl !== candidate.sourceUrl) errors.push(`${prefix}.sourceUrl is invalid`);
      if (candidate.websiteUrl !== null && cleanHttpsUrl(candidate.websiteUrl) !== candidate.websiteUrl) errors.push(`${prefix}.websiteUrl is not a safe opaque HTTPS URL`);
      if (!isIsoDate(candidate.observedLaunchAt)) errors.push(`${prefix}.observedLaunchAt is invalid`);
      if (candidate.featuredAt !== null && !isIsoDate(candidate.featuredAt)) errors.push(`${prefix}.featuredAt is invalid`);
      if (!Number.isInteger(candidate.votesCount) || candidate.votesCount < 0) errors.push(`${prefix}.votesCount is invalid`);
      if (!Number.isInteger(candidate.relevanceScore) || candidate.relevanceScore < 0) errors.push(`${prefix}.relevanceScore is invalid`);
      if (!Array.isArray(candidate.matchedQueries)
        || candidate.matchedQueries.length < 1
        || candidate.matchedQueries.length > 8
        || !candidate.matchedQueries.every((query) => queueQueries.includes(query))
        || new Set(candidate.matchedQueries).size !== candidate.matchedQueries.length) {
        errors.push(`${prefix}.matchedQueries must be a non-empty subset of queue.search.queries`);
      }
      if (!Array.isArray(candidate.topics) || candidate.topics.length > 10) {
        errors.push(`${prefix}.topics is invalid`);
      } else {
        const seenSlugs = new Set();
        for (const [topicIndex, topic] of candidate.topics.entries()) {
          const topicPrefix = `${prefix}.topics[${topicIndex}]`;
          if (!exactKeys(topic, new Set(['id', 'slug', 'name']), topicPrefix, errors)) continue;
          if (!stringInRange(topic.id, 1, 128) || !IDENTIFIER.test(topic.id)) errors.push(`${topicPrefix}.id is invalid`);
          if (!stringInRange(topic.slug, 1, 160) || !SLUG.test(topic.slug)) errors.push(`${topicPrefix}.slug is invalid`);
          if (!stringInRange(topic.name, 1, 120)) errors.push(`${topicPrefix}.name is invalid`);
          if (seenSlugs.has(topic.slug)) errors.push(`${topicPrefix}.slug is duplicated`);
          seenSlugs.add(topic.slug);
        }
      }
      if (candidate.state !== 'candidate_only') errors.push(`${prefix}.state must equal candidate_only`);
      if (candidate.contentTrust !== 'untrusted_external_metadata') errors.push(`${prefix}.contentTrust must mark external metadata as untrusted`);
      if (candidate.nextReview !== 'publisher_api_mcp_terms_security') errors.push(`${prefix}.nextReview is invalid`);
      if (candidate.websiteVisitAllowed !== false) errors.push(`${prefix}.websiteVisitAllowed must be false`);
    }
  }

  const receiptKeys = new Set([
    'runId', 'querySha256', 'operationSetSha256', 'candidateSetSha256', 'requestCount', 'responseBytes', 'observedCandidateCount',
    'retainedCandidateIds', 'commercialApprovalReference', 'rateLimit',
  ]);
  if (exactKeys(queue.receipt, receiptKeys, 'queue.receipt', errors)) {
    for (const field of ['querySha256', 'operationSetSha256', 'candidateSetSha256']) {
      if (typeof queue.receipt[field] !== 'string' || !SHA256.test(queue.receipt[field])) errors.push(`queue.receipt.${field} is invalid`);
    }
    if (queue.receipt.runId !== `producthunt:${String(queue.receipt.querySha256).slice(0, 24)}`) errors.push('queue.receipt.runId is inconsistent');
    const expectedOperationHash = sha256Json({
      endpoint: PRODUCT_HUNT_GRAPHQL_ENDPOINT,
      topics: PRODUCT_HUNT_TOPICS_QUERY,
      posts: PRODUCT_HUNT_POSTS_QUERY,
    });
    if (queue.receipt.operationSetSha256 !== expectedOperationHash) errors.push('queue.receipt.operationSetSha256 is inconsistent');
    if (Array.isArray(queue.candidates)
      && queue.receipt.candidateSetSha256 !== sha256Json(queue.candidates)) {
      errors.push('queue.receipt.candidateSetSha256 is inconsistent');
    }
    if (isObject(queue.search) && source?.search) {
      const expectedQueryHash = sha256Json({
        source: PRODUCT_HUNT_SOURCE_ID,
        queries: queue.search.queries,
        postedAfter: queue.search.postedAfter,
        postedBefore: queue.search.postedBefore,
        strategy: source.search.strategy,
        topicLimit: source.search.topicLimit,
        postsPerTopic: source.search.postsPerTopic,
        maxCandidates: source.search.maxCandidates,
        operationSetSha256: expectedOperationHash,
        commercialApprovalReference: source?.commercialUse?.approvalReference,
      });
      if (queue.receipt.querySha256 !== expectedQueryHash) errors.push('queue.receipt.querySha256 is inconsistent');
    }
    const expectedRequestCount = queueQueries.length + queueMatchedTopics.length;
    if (queue.receipt.requestCount !== expectedRequestCount) errors.push('queue.receipt.requestCount is inconsistent');
    if (!Number.isInteger(queue.receipt.responseBytes)
      || queue.receipt.responseBytes < 1
      || queue.receipt.responseBytes > MAX_RUN_RESPONSE_BYTES) {
      errors.push('queue.receipt.responseBytes is invalid');
    }
    if (!Number.isInteger(queue.receipt.observedCandidateCount)
      || queue.receipt.observedCandidateCount < candidateIds.length
      || queue.receipt.observedCandidateCount > queueMatchedTopics.length * (source?.search?.postsPerTopic ?? 0)) {
      errors.push('queue.receipt.observedCandidateCount is inconsistent');
    }
    if (!sameArray(queue.receipt.retainedCandidateIds, candidateIds)) errors.push('queue.receipt.retainedCandidateIds is inconsistent');
    if (queue.receipt.commercialApprovalReference !== source?.commercialUse?.approvalReference
      || !APPROVAL_REFERENCE.test(queue.receipt.commercialApprovalReference ?? '')) {
      errors.push('queue.receipt.commercialApprovalReference is invalid');
    }
    if (exactKeys(queue.receipt.rateLimit, new Set(['limit', 'remaining', 'reset']), 'queue.receipt.rateLimit', errors)) {
      for (const field of ['limit', 'remaining', 'reset']) {
        if (!Number.isInteger(queue.receipt.rateLimit[field]) || queue.receipt.rateLimit[field] < 0) errors.push(`queue.receipt.rateLimit.${field} is invalid`);
      }
      if (Number.isInteger(queue.receipt.rateLimit.remaining)
        && queue.receipt.rateLimit.remaining <= (source?.search?.minimumRemainingBudget ?? 0)) {
        errors.push('queue.receipt.rateLimit.remaining consumed the configured safety reserve');
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function insideRoot(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function preparePrivateProductHuntOutput(target, { forbiddenRoot } = {}) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || QUERY_CONTROL.test(target)) {
    throw new ProductHuntDiscoveryError('invalid_output_path', '--output must be an absolute private path.');
  }
  if (typeof forbiddenRoot !== 'string' || !path.isAbsolute(forbiddenRoot)) {
    throw new ProductHuntDiscoveryError('invalid_output_path', 'A canonical absolute repository root is required.');
  }
  const normalizedTarget = path.normalize(target);
  const filename = path.basename(normalizedTarget);
  if (!filename || filename === '.' || filename === '..') {
    throw new ProductHuntDiscoveryError('invalid_output_path', '--output must name a private JSON file.');
  }
  const parent = path.dirname(normalizedTarget);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const realParent = realpathSync(parent);
  const realForbiddenRoot = realpathSync(forbiddenRoot);
  if (insideRoot(realParent, realForbiddenRoot)) {
    throw new ProductHuntDiscoveryError('output_inside_repository', '--output must resolve outside the repository.');
  }
  const directory = statSync(realParent);
  if (!directory.isDirectory()) throw new ProductHuntDiscoveryError('invalid_output_path', '--output parent must be a directory.');
  if ((directory.mode & 0o077) !== 0 || (directory.mode & 0o700) !== 0o700) {
    throw new ProductHuntDiscoveryError('insecure_output_directory', '--output parent must be owner-only mode 0700.');
  }
  if (typeof process.getuid === 'function' && directory.uid !== process.getuid()) {
    throw new ProductHuntDiscoveryError('insecure_output_directory', '--output parent must be owned by the current user.');
  }
  const resolvedTarget = path.join(realParent, filename);
  if (existsSync(resolvedTarget)) {
    throw new ProductHuntDiscoveryError('output_exists', 'Refusing to overwrite an existing Product Hunt candidate queue.');
  }
  return resolvedTarget;
}

export function writePrivateProductHuntQueue(target, queue, { forbiddenRoot, source } = {}) {
  const validation = validateProductHuntCandidateQueue(queue, { source });
  if (!validation.ok) {
    throw new ProductHuntDiscoveryError('invalid_candidate_queue', validation.errors.join('; '));
  }
  const resolvedTarget = preparePrivateProductHuntOutput(target, { forbiddenRoot });
  const temporary = `${resolvedTarget}.${process.pid}.${randomUUID()}.tmp`;
  let linked = false;
  try {
    writeFileSync(temporary, `${JSON.stringify(queue, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    chmodSync(temporary, 0o600);
    linkSync(temporary, resolvedTarget);
    linked = true;
    unlinkSync(temporary);
    const output = statSync(resolvedTarget);
    if (!output.isFile() || (output.mode & 0o777) !== 0o600) {
      throw new ProductHuntDiscoveryError('insecure_output_file', 'Candidate queue must remain a regular file with mode 0600.');
    }
    if (typeof process.getuid === 'function' && output.uid !== process.getuid()) {
      throw new ProductHuntDiscoveryError('insecure_output_file', 'Candidate queue must be owned by the current user.');
    }
    return resolvedTarget;
  } catch (error) {
    let cleanupFailed = false;
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      cleanupFailed = true;
    }
    try {
      if (linked && existsSync(resolvedTarget)) unlinkSync(resolvedTarget);
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed) {
      throw new ProductHuntDiscoveryError(
        'output_cleanup_failed',
        'Private candidate queue cleanup failed; isolate the output directory and remove the partial file before retrying.',
      );
    }
    throw error;
  }
}

export async function discoverProductHunt({
  source,
  token,
  commercialApproval,
  queries,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  requireValidSource(source);
  if (source.commercialUse.state !== 'approved' || !APPROVAL_REFERENCE.test(source.commercialUse.approvalReference ?? '')) {
    throw new ProductHuntDiscoveryError('commercial_permission_required', 'Product Hunt commercial API permission must be approved and referenced before discovery can run.');
  }
  if (commercialApproval !== true) {
    throw new ProductHuntDiscoveryError('commercial_permission_required', `Runtime confirmation ${PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV}=true is required.`);
  }
  if (!stringInRange(token, 16, 4096) || /\s/.test(token)) {
    throw new ProductHuntDiscoveryError('credential_required', `A Product Hunt access token must be supplied through ${PRODUCT_HUNT_ACCESS_TOKEN_ENV}.`);
  }
  if (typeof fetchImpl !== 'function') throw new ProductHuntDiscoveryError('fetch_unavailable', 'A server-side fetch implementation is required.');
  if (!integerInRange(timeoutMs, 1000, 60_000)) throw new ProductHuntDiscoveryError('invalid_timeout', 'timeoutMs must be from 1000 through 60000.');

  const selectedQueries = normalizeQueries(queries?.length ? queries : source.search.defaultQueries, source.search.defaultQueries);
  const postedBeforeDate = isoDate(now, 'now');
  const postedAfterDate = new Date(postedBeforeDate.getTime() - source.search.lookbackDays * 86_400_000);
  const postedBefore = postedBeforeDate.toISOString();
  const postedAfter = postedAfterDate.toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const topicBySlug = new Map();
  let rateLimit = null;
  let requestCount = 0;
  let responseBytes = 0;

  try {
    for (const query of selectedQueries) {
      if (requestCount > 0) requireRateLimitBudget(rateLimit, source.search.minimumRemainingBudget);
      const result = await productHuntGraphQL({
        token,
        operation: PRODUCT_HUNT_TOPICS_QUERY,
        variables: { query, first: source.search.topicLimit },
        fetchImpl,
        signal: controller.signal,
        maximumRunResponseBytes: MAX_RUN_RESPONSE_BYTES - responseBytes,
      });
      requestCount += 1;
      responseBytes = addRunResponseBytes(responseBytes, result.responseBytes);
      rateLimit = mergeRateLimit(rateLimit, result.rateLimit);
      requireRateLimitBudget(rateLimit, source.search.minimumRemainingBudget);
      for (const topic of topicNodes(result.data, source.search.topicLimit)) {
        const current = topicBySlug.get(topic.slug) ?? { ...topic, matchedQueries: new Set() };
        current.matchedQueries.add(query);
        topicBySlug.set(topic.slug, current);
      }
    }

    const candidates = new Map();
    for (const topic of [...topicBySlug.values()].sort((left, right) => left.slug.localeCompare(right.slug, 'en'))) {
      requireRateLimitBudget(rateLimit, source.search.minimumRemainingBudget);
      const result = await productHuntGraphQL({
        token,
        operation: PRODUCT_HUNT_POSTS_QUERY,
        variables: {
          topic: topic.slug,
          first: source.search.postsPerTopic,
          postedAfter,
          postedBefore,
        },
        fetchImpl,
        signal: controller.signal,
        maximumRunResponseBytes: MAX_RUN_RESPONSE_BYTES - responseBytes,
      });
      requestCount += 1;
      responseBytes = addRunResponseBytes(responseBytes, result.responseBytes);
      rateLimit = mergeRateLimit(rateLimit, result.rateLimit);
      requireRateLimitBudget(rateLimit, source.search.minimumRemainingBudget);
      for (const node of postNodes(result.data, source.search.postsPerTopic)) {
        const sourceProductId = cleanIdentifier(node?.id);
        if (!sourceProductId) throw new ProductHuntDiscoveryError('schema_changed', 'Product Hunt post ID did not match the pinned contract.');
        const current = candidates.get(sourceProductId) ?? { node, matchedQueries: new Set() };
        for (const query of topic.matchedQueries) current.matchedQueries.add(query);
        candidates.set(sourceProductId, current);
      }
    }

    const projected = [...candidates.values()]
      .map(({ node, matchedQueries }) => candidateFromNode(node, [...matchedQueries]))
      .sort((left, right) => right.relevanceScore - left.relevanceScore
        || right.votesCount - left.votesCount
        || left.candidateId.localeCompare(right.candidateId, 'en'))
      .slice(0, source.search.maxCandidates);
    const operationSetSha256 = createHash('sha256').update(JSON.stringify({
      endpoint: PRODUCT_HUNT_GRAPHQL_ENDPOINT,
      topics: PRODUCT_HUNT_TOPICS_QUERY,
      posts: PRODUCT_HUNT_POSTS_QUERY,
    })).digest('hex');
    const queryHash = createHash('sha256').update(JSON.stringify({
      source: PRODUCT_HUNT_SOURCE_ID,
      queries: selectedQueries,
      postedAfter,
      postedBefore,
      strategy: source.search.strategy,
      topicLimit: source.search.topicLimit,
      postsPerTopic: source.search.postsPerTopic,
      maxCandidates: source.search.maxCandidates,
      operationSetSha256,
      commercialApprovalReference: source.commercialUse.approvalReference,
    })).digest('hex');
    const candidateSetSha256 = createHash('sha256').update(JSON.stringify(projected)).digest('hex');

    const queue = {
      $schema: PRODUCT_HUNT_CANDIDATE_QUEUE_SCHEMA,
      schemaVersion: 1,
      source: {
        id: PRODUCT_HUNT_SOURCE_ID,
        displayName: source.displayName,
        method: 'official_graphql_api',
        endpoint: PRODUCT_HUNT_GRAPHQL_ENDPOINT,
        attributionLabel: source.policy.attributionLabel,
        attributionUrl: source.policy.attributionUrl,
      },
      generatedAt: postedBefore,
      expiresAt: new Date(postedBeforeDate.getTime() + source.policy.candidateRetentionDays * 86_400_000).toISOString(),
      search: {
        strategy: source.search.strategy,
        queries: selectedQueries,
        matchedTopics: [...topicBySlug.values()]
          .sort((left, right) => left.slug.localeCompare(right.slug, 'en'))
          .map((topic) => ({
          id: topic.id,
          slug: topic.slug,
          name: topic.name,
          sourceUrl: topic.sourceUrl,
          matchedQueries: [...topic.matchedQueries].sort((left, right) => left.localeCompare(right, 'en')),
          })),
        postedAfter,
        postedBefore,
      },
      intake: {
        state: 'candidate_only',
        autoApprovePackages: false,
        installEnabled: false,
        executionEnabled: false,
        candidateDataTrusted: false,
        websiteVisitEnabled: false,
        integrityState: 'unsigned_operator_observation',
      },
      receipt: {
        runId: `producthunt:${queryHash.slice(0, 24)}`,
        querySha256: queryHash,
        operationSetSha256,
        candidateSetSha256,
        requestCount,
        responseBytes,
        observedCandidateCount: candidates.size,
        retainedCandidateIds: projected.map((candidate) => candidate.candidateId),
        commercialApprovalReference: source.commercialUse.approvalReference,
        rateLimit,
      },
      candidates: projected,
    };
    const validation = validateProductHuntCandidateQueue(queue, { source });
    if (!validation.ok) {
      throw new ProductHuntDiscoveryError('internal_projection_invalid', validation.errors.join('; '));
    }
    return queue;
  } finally {
    clearTimeout(timeout);
  }
}

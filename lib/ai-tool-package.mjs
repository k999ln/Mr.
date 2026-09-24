import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';

const EXACT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SERVER_NAME = /^[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+$/;
const SAFE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PACKAGE_TYPES = new Set(['npm', 'pypi', 'cargo', 'oci', 'nuget', 'mcpb']);
const TRANSPORT_TYPES = new Set(['stdio', 'streamable-http', 'sse']);
const KINDS = new Set(['model_provider', 'remote_tool', 'service_cell']);
const SURFACES = new Set(['web', 'ios', 'core', 'local_bridge']);
const DATA_CLASSES = new Set([
  'public_text',
  'generated_content',
  'owner_profile',
  'customer_content',
  'attachments',
  'calendar',
  'email',
  'finance',
  'location',
  'wellbeing',
]);
const EFFECTS = new Set(['read', 'external_write', 'message', 'publish', 'money']);
const EXTERNAL_EFFECTS = new Set(['external_write', 'message', 'publish', 'money']);
const APPROVALS = new Set(['install', 'per_invocation']);
const COMMERCIAL_MODES = new Set(['free', 'fixed', 'metered', 'subscription', 'quote']);
const REQUIRED_RECEIPT_FIELDS = [
  'receipt_id',
  'run_id',
  'server_name',
  'version',
  'package_digest',
  'capability_id',
  'grant_id',
  'input_sha256',
  'output_sha256',
  'status',
  'started_at',
  'finished_at',
];
const SERVER_KEYS = new Set([
  '$schema',
  '_meta',
  'description',
  'icons',
  'name',
  'packages',
  'remotes',
  'repository',
  'title',
  'version',
  'websiteUrl',
]);
const PACKAGE_KEYS = new Set([
  'environmentVariables',
  'fileSha256',
  'identifier',
  'packageArguments',
  'registryBaseUrl',
  'registryType',
  'runtimeArguments',
  'runtimeHint',
  'transport',
  'version',
]);
const INPUT_KEYS = new Set([
  'choices',
  'default',
  'description',
  'format',
  'isRequired',
  'isRepeated',
  'isSecret',
  'name',
  'placeholder',
  'type',
  'value',
  'valueHint',
  'variables',
]);
const POLICY_KEYS = new Set([
  '$schema',
  'schemaVersion',
  'serverName',
  'kind',
  'compatibility',
  'capabilities',
  'requestedPermissions',
  'runtime',
  'commercial',
  'receipts',
]);
const POLICY_SCHEMA_URL = 'https://raw.githubusercontent.com/k999ln/Mr./main/integrations/ai-tools/rockstar_ibot-tool.schema.json';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function add(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function requireObject(value, field, errors) {
  if (!isObject(value)) {
    add(errors, field, 'must be an object');
    return false;
  }
  return true;
}

function exactKeys(value, allowed, required, field, errors) {
  if (!requireObject(value, field, errors)) return false;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) add(errors, `${field}.${key}`, 'unknown field');
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) add(errors, `${field}.${key}`, 'required field is missing');
  }
  return true;
}

function requireString(value, field, errors, options = {}) {
  if (typeof value !== 'string' || value.length < (options.min ?? 1) || value.length > (options.max ?? Infinity)) {
    add(errors, field, 'must be a non-empty string within the allowed length');
    return false;
  }
  if (options.pattern && !options.pattern.test(value)) {
    add(errors, field, 'has an invalid format');
    return false;
  }
  return true;
}

function requireInteger(value, field, errors, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    add(errors, field, `must be an integer from ${min} through ${max}`);
    return false;
  }
  return true;
}

function requireEnum(value, allowed, field, errors) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    add(errors, field, `must be one of: ${[...allowed].join(', ')}`);
    return false;
  }
  return true;
}

function requireUniqueStrings(value, allowed, field, errors, { min = 0, pattern } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    add(errors, field, `must be an array with at least ${min} item(s)`);
    return [];
  }
  const result = [];
  const seen = new Set();
  value.forEach((item, index) => {
    const itemField = `${field}[${index}]`;
    if (typeof item !== 'string' || !item) {
      add(errors, itemField, 'must be a non-empty string');
      return;
    }
    if (allowed && !allowed.has(item)) add(errors, itemField, `unsupported value: ${item}`);
    if (pattern && !pattern.test(item)) add(errors, itemField, 'has an invalid format');
    if (seen.has(item)) add(errors, itemField, 'duplicate value');
    seen.add(item);
    result.push(item);
  });
  return result;
}

function validateExactVersion(value, field, errors) {
  if (!requireString(value, field, errors, { max: 255 })) return;
  if (!EXACT_SEMVER.test(value)) add(errors, field, 'must be one pinned semantic version; ranges and latest are forbidden');
}

function safeRemoteUrl(value, field, errors, { allowReservedInvalid = false } = {}) {
  if (!requireString(value, field, errors, { max: 2048 })) return null;
  if (value.includes('{') || value.includes('}')) {
    add(errors, field, 'URL templates are not allowed for remote endpoints; declare one exact destination');
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    add(errors, field, 'must be a valid URL');
    return null;
  }
  if (parsed.protocol !== 'https:') add(errors, field, 'must use HTTPS');
  if (parsed.username || parsed.password) add(errors, field, 'embedded credentials are forbidden');
  if (parsed.port && parsed.port !== '443') add(errors, field, 'only HTTPS port 443 is supported in the first release');
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const forbiddenHost = host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host === 'metadata.google.internal'
    || isIP(host) !== 0;
  if (forbiddenHost) add(errors, field, 'localhost, IP literals, private/link-local targets, and metadata hosts are forbidden');
  if (!allowReservedInvalid && (host === 'invalid' || host.endsWith('.invalid'))) {
    add(errors, field, '.invalid destinations are reserved for templates and cannot be registered as runnable packages');
  }
  return parsed;
}

function validateInput(input, field, errors) {
  if (!exactKeys(input, INPUT_KEYS, [], field, errors)) return;
  if (Object.hasOwn(input, 'name')) requireString(input.name, `${field}.name`, errors, { max: 120 });
  if (input.isSecret === true && (Object.hasOwn(input, 'value') || Object.hasOwn(input, 'default'))) {
    add(errors, field, 'secret values and secret defaults must never be stored in a manifest');
  }
  if (typeof input.name === 'string' && /authorization|api.?key|token|secret|password|cookie|private.?key/i.test(input.name) && (Object.hasOwn(input, 'value') || Object.hasOwn(input, 'default'))) {
    add(errors, field, 'credential-shaped inputs may declare a slot, never a value or default');
  }
  if (Object.hasOwn(input, 'variables')) {
    if (!requireObject(input.variables, `${field}.variables`, errors)) return;
    for (const [key, nested] of Object.entries(input.variables)) validateInput(nested, `${field}.variables.${key}`, errors);
  }
}

function scanSecretValues(value, field, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretValues(item, `${field}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  if (value.isSecret === true && (Object.hasOwn(value, 'value') || Object.hasOwn(value, 'default'))) {
    add(errors, field, 'secret-bearing input contains a value or default');
  }
  const secretKeys = new Set(['apikey', 'accesstoken', 'refreshtoken', 'clientsecret', 'password', 'privatekey', 'authorization', 'cookie', 'secretvalue']);
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, '');
    if (secretKeys.has(normalized) && (typeof nested === 'string' || typeof nested === 'number')) {
      add(errors, `${field}.${key}`, 'secret-like values are forbidden in manifests');
    }
    scanSecretValues(nested, `${field}.${key}`, errors);
  }
}

function validateTransport(transport, field, errors, options) {
  if (!requireObject(transport, field, errors)) return null;
  const allowed = new Set(['type', 'url', 'headers', 'variables']);
  exactKeys(transport, allowed, ['type'], field, errors);
  requireEnum(transport.type, TRANSPORT_TYPES, `${field}.type`, errors);
  if (transport.type !== 'stdio') {
    const parsed = safeRemoteUrl(transport.url, `${field}.url`, errors, options);
    if (Array.isArray(transport.headers)) {
      transport.headers.forEach((input, index) => validateInput(input, `${field}.headers[${index}]`, errors));
    } else if (Object.hasOwn(transport, 'headers')) {
      add(errors, `${field}.headers`, 'must be an array');
    }
    if (Object.hasOwn(transport, 'variables')) {
      if (requireObject(transport.variables, `${field}.variables`, errors)) {
        for (const [key, input] of Object.entries(transport.variables)) validateInput(input, `${field}.variables.${key}`, errors);
      }
    }
    return parsed;
  }
  if (Object.hasOwn(transport, 'url') || Object.hasOwn(transport, 'headers') || Object.hasOwn(transport, 'variables')) {
    add(errors, field, 'stdio transport cannot contain URL, headers, or variables');
  }
  return null;
}

function validateServer(server, errors, options) {
  if (!exactKeys(server, SERVER_KEYS, ['$schema', 'name', 'description', 'version'], 'server.json', errors)) return [];
  if (requireString(server.$schema, 'server.json.$schema', errors, { max: 300 })) {
    try {
      const schemaURL = new URL(server.$schema);
      if (schemaURL.protocol !== 'https:' || schemaURL.hostname !== 'static.modelcontextprotocol.io' || !schemaURL.pathname.endsWith('/server.schema.json')) {
        add(errors, 'server.json.$schema', 'must reference an official static.modelcontextprotocol.io server schema');
      }
    } catch {
      add(errors, 'server.json.$schema', 'must be a valid official schema URL');
    }
  }
  requireString(server.name, 'server.json.name', errors, { max: 200, pattern: SERVER_NAME });
  requireString(server.description, 'server.json.description', errors, { max: 100 });
  validateExactVersion(server.version, 'server.json.version', errors);
  if (Object.hasOwn(server, 'title')) requireString(server.title, 'server.json.title', errors, { max: 100 });

  const hasPackages = Array.isArray(server.packages) && server.packages.length > 0;
  const hasRemotes = Array.isArray(server.remotes) && server.remotes.length > 0;
  if (hasPackages === hasRemotes) add(errors, 'server.json', 'declare exactly one distribution mode: packages or remotes');
  if (Object.hasOwn(server, 'packages') && !Array.isArray(server.packages)) add(errors, 'server.json.packages', 'must be an array');
  if (Object.hasOwn(server, 'remotes') && !Array.isArray(server.remotes)) add(errors, 'server.json.remotes', 'must be an array');

  const remoteHosts = [];
  if (hasRemotes) {
    server.remotes.forEach((remote, index) => {
      const parsed = validateTransport(remote, `server.json.remotes[${index}]`, errors, options);
      if (parsed) remoteHosts.push(parsed.hostname.toLowerCase());
      if (remote?.type === 'stdio') add(errors, `server.json.remotes[${index}].type`, 'remote entries cannot use stdio');
    });
  }

  if (hasPackages) {
    server.packages.forEach((pkg, index) => {
      const field = `server.json.packages[${index}]`;
      if (!exactKeys(pkg, PACKAGE_KEYS, ['registryType', 'identifier', 'version', 'transport'], field, errors)) return;
      requireEnum(pkg.registryType, PACKAGE_TYPES, `${field}.registryType`, errors);
      requireString(pkg.identifier, `${field}.identifier`, errors, { max: 500 });
      validateExactVersion(pkg.version, `${field}.version`, errors);
      validateTransport(pkg.transport, `${field}.transport`, errors, options);
      if (pkg.registryType === 'mcpb' && !SHA256.test(pkg.fileSha256 ?? '')) {
        add(errors, `${field}.fileSha256`, 'MCPB packages require a lowercase SHA-256 digest');
      } else if (Object.hasOwn(pkg, 'fileSha256') && !SHA256.test(pkg.fileSha256)) {
        add(errors, `${field}.fileSha256`, 'must be a lowercase SHA-256 digest');
      }
      for (const key of ['environmentVariables', 'packageArguments', 'runtimeArguments']) {
        if (!Object.hasOwn(pkg, key)) continue;
        if (!Array.isArray(pkg[key])) {
          add(errors, `${field}.${key}`, 'must be an array');
          continue;
        }
        pkg[key].forEach((input, inputIndex) => validateInput(input, `${field}.${key}[${inputIndex}]`, errors));
      }
    });
  }
  return remoteHosts;
}

function validatePolicy(policy, server, remoteHosts, errors) {
  if (!exactKeys(policy, POLICY_KEYS, [...POLICY_KEYS], 'rockstar_ibot-tool.json', errors)) return;
  if (policy.$schema !== POLICY_SCHEMA_URL) add(errors, 'rockstar_ibot-tool.json.$schema', 'must reference the versioned Rockstar_ibot policy schema');
  if (policy.schemaVersion !== 1) add(errors, 'rockstar_ibot-tool.json.schemaVersion', 'only schemaVersion 1 is supported');
  requireString(policy.serverName, 'rockstar_ibot-tool.json.serverName', errors, { max: 200, pattern: SERVER_NAME });
  if (policy.serverName !== server?.name) add(errors, 'rockstar_ibot-tool.json.serverName', 'must exactly match server.json.name');
  requireEnum(policy.kind, KINDS, 'rockstar_ibot-tool.json.kind', errors);

  const compatibilityKeys = new Set(['minimumCoreVersion', 'surfaces']);
  if (exactKeys(policy.compatibility, compatibilityKeys, [...compatibilityKeys], 'rockstar_ibot-tool.json.compatibility', errors)) {
    validateExactVersion(policy.compatibility.minimumCoreVersion, 'rockstar_ibot-tool.json.compatibility.minimumCoreVersion', errors);
    requireUniqueStrings(policy.compatibility.surfaces, SURFACES, 'rockstar_ibot-tool.json.compatibility.surfaces', errors, { min: 1 });
  }

  const permissionKeys = new Set(['dataRead', 'dataWrite', 'credentialSlots', 'network', 'storage']);
  let dataRead = [];
  let dataWrite = [];
  const declaredHosts = [];
  if (exactKeys(policy.requestedPermissions, permissionKeys, [...permissionKeys], 'rockstar_ibot-tool.json.requestedPermissions', errors)) {
    dataRead = requireUniqueStrings(policy.requestedPermissions.dataRead, DATA_CLASSES, 'rockstar_ibot-tool.json.requestedPermissions.dataRead', errors);
    dataWrite = requireUniqueStrings(policy.requestedPermissions.dataWrite, DATA_CLASSES, 'rockstar_ibot-tool.json.requestedPermissions.dataWrite', errors);
    if (!Array.isArray(policy.requestedPermissions.credentialSlots)) {
      add(errors, 'rockstar_ibot-tool.json.requestedPermissions.credentialSlots', 'must be an array');
    } else {
      const seen = new Set();
      policy.requestedPermissions.credentialSlots.forEach((slot, index) => {
        const field = `rockstar_ibot-tool.json.requestedPermissions.credentialSlots[${index}]`;
        const keys = new Set(['id', 'purpose', 'required']);
        if (!exactKeys(slot, keys, [...keys], field, errors)) return;
        requireString(slot.id, `${field}.id`, errors, { max: 80, pattern: SAFE_ID });
        requireString(slot.purpose, `${field}.purpose`, errors, { max: 200 });
        if (typeof slot.required !== 'boolean') add(errors, `${field}.required`, 'must be boolean');
        if (seen.has(slot.id)) add(errors, `${field}.id`, 'duplicate credential slot');
        seen.add(slot.id);
      });
    }
    if (!Array.isArray(policy.requestedPermissions.network)) {
      add(errors, 'rockstar_ibot-tool.json.requestedPermissions.network', 'must be an array');
    } else {
      const seen = new Set();
      policy.requestedPermissions.network.forEach((rule, index) => {
        const field = `rockstar_ibot-tool.json.requestedPermissions.network[${index}]`;
        const keys = new Set(['scheme', 'host', 'port', 'methods']);
        if (!exactKeys(rule, keys, [...keys], field, errors)) return;
        if (rule.scheme !== 'https') add(errors, `${field}.scheme`, 'must be https');
        if (rule.port !== 443) add(errors, `${field}.port`, 'must be 443');
        if (!requireString(rule.host, `${field}.host`, errors, { max: 253 })) return;
        const host = rule.host.toLowerCase();
        if (host.includes('*') || host.startsWith('.') || !host.includes('.') || isIP(host) !== 0 || host === 'localhost') {
          add(errors, `${field}.host`, 'must be one exact public DNS hostname; wildcards, suffix rules, localhost, and IP literals are forbidden');
        }
        requireUniqueStrings(rule.methods, new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), `${field}.methods`, errors, { min: 1 });
        if (seen.has(host)) add(errors, `${field}.host`, 'duplicate network destination');
        seen.add(host);
        declaredHosts.push(host);
      });
    }
    const storageKeys = new Set(['retentionDays', 'containsPersonalData']);
    if (exactKeys(policy.requestedPermissions.storage, storageKeys, [...storageKeys], 'rockstar_ibot-tool.json.requestedPermissions.storage', errors)) {
      requireInteger(policy.requestedPermissions.storage.retentionDays, 'rockstar_ibot-tool.json.requestedPermissions.storage.retentionDays', errors, 0, 365);
      if (typeof policy.requestedPermissions.storage.containsPersonalData !== 'boolean') {
        add(errors, 'rockstar_ibot-tool.json.requestedPermissions.storage.containsPersonalData', 'must be boolean');
      }
    }
  }
  for (const host of remoteHosts) {
    if (!declaredHosts.includes(host)) add(errors, 'rockstar_ibot-tool.json.requestedPermissions.network', `remote host ${host} is not declared exactly`);
  }

  let hasExternalEffect = false;
  const capabilityIDs = new Set();
  if (!Array.isArray(policy.capabilities) || policy.capabilities.length === 0) {
    add(errors, 'rockstar_ibot-tool.json.capabilities', 'must contain at least one capability');
  } else {
    policy.capabilities.forEach((capability, index) => {
      const field = `rockstar_ibot-tool.json.capabilities[${index}]`;
      const keys = new Set(['id', 'title', 'description', 'inputDataClasses', 'outputDataClasses', 'effect', 'ownerApproval', 'idempotencyRequired', 'receiptRequired']);
      if (!exactKeys(capability, keys, [...keys], field, errors)) return;
      requireString(capability.id, `${field}.id`, errors, { max: 100, pattern: SAFE_ID });
      requireString(capability.title, `${field}.title`, errors, { max: 100 });
      requireString(capability.description, `${field}.description`, errors, { max: 240 });
      const inputs = requireUniqueStrings(capability.inputDataClasses, DATA_CLASSES, `${field}.inputDataClasses`, errors);
      const outputs = requireUniqueStrings(capability.outputDataClasses, DATA_CLASSES, `${field}.outputDataClasses`, errors);
      requireEnum(capability.effect, EFFECTS, `${field}.effect`, errors);
      requireEnum(capability.ownerApproval, APPROVALS, `${field}.ownerApproval`, errors);
      if (capability.idempotencyRequired !== true) add(errors, `${field}.idempotencyRequired`, 'must be true');
      if (capability.receiptRequired !== true) add(errors, `${field}.receiptRequired`, 'must be true');
      if (capabilityIDs.has(capability.id)) add(errors, `${field}.id`, 'duplicate capability ID');
      capabilityIDs.add(capability.id);
      inputs.forEach((dataClass) => {
        if (!dataRead.includes(dataClass)) add(errors, `${field}.inputDataClasses`, `${dataClass} is not requested in dataRead`);
      });
      outputs.forEach((dataClass) => {
        if (!dataWrite.includes(dataClass)) add(errors, `${field}.outputDataClasses`, `${dataClass} is not requested in dataWrite`);
      });
      if (EXTERNAL_EFFECTS.has(capability.effect)) {
        hasExternalEffect = true;
        if (capability.ownerApproval !== 'per_invocation') add(errors, `${field}.ownerApproval`, 'external effects require current approval for every invocation');
      }
    });
  }

  const runtimeKeys = new Set(['mode', 'timeoutMs', 'maxOutputBytes', 'maxConcurrency']);
  if (exactKeys(policy.runtime, runtimeKeys, [...runtimeKeys], 'rockstar_ibot-tool.json.runtime', errors)) {
    requireEnum(policy.runtime.mode, new Set(['isolated_remote', 'sandboxed_package']), 'rockstar_ibot-tool.json.runtime.mode', errors);
    requireInteger(policy.runtime.timeoutMs, 'rockstar_ibot-tool.json.runtime.timeoutMs', errors, 1000, 300000);
    requireInteger(policy.runtime.maxOutputBytes, 'rockstar_ibot-tool.json.runtime.maxOutputBytes', errors, 1024, 10485760);
    requireInteger(policy.runtime.maxConcurrency, 'rockstar_ibot-tool.json.runtime.maxConcurrency', errors, 1, 32);
    const hasRemote = remoteHosts.length > 0;
    if (hasRemote && policy.runtime.mode !== 'isolated_remote') add(errors, 'rockstar_ibot-tool.json.runtime.mode', 'remote MCP requires isolated_remote');
    if (!hasRemote && policy.runtime.mode !== 'sandboxed_package') add(errors, 'rockstar_ibot-tool.json.runtime.mode', 'registry packages require sandboxed_package');
  }

  const commercialKeys = new Set(['mode', 'requiresQuote', 'currency']);
  if (exactKeys(policy.commercial, commercialKeys, ['mode', 'requiresQuote'], 'rockstar_ibot-tool.json.commercial', errors)) {
    requireEnum(policy.commercial.mode, COMMERCIAL_MODES, 'rockstar_ibot-tool.json.commercial.mode', errors);
    if (typeof policy.commercial.requiresQuote !== 'boolean') add(errors, 'rockstar_ibot-tool.json.commercial.requiresQuote', 'must be boolean');
    if (policy.commercial.mode !== 'free' && policy.commercial.requiresQuote !== true) {
      add(errors, 'rockstar_ibot-tool.json.commercial.requiresQuote', 'paid tools require an operator-owned quote before every charge boundary');
    }
    if (policy.commercial.mode === 'free' && policy.commercial.requiresQuote !== false) {
      add(errors, 'rockstar_ibot-tool.json.commercial.requiresQuote', 'free tools must not request a billing quote');
    }
    if (Object.hasOwn(policy.commercial, 'currency') && !/^[A-Z]{3}$/.test(policy.commercial.currency)) {
      add(errors, 'rockstar_ibot-tool.json.commercial.currency', 'must be a three-letter ISO-style currency code');
    }
  }

  const receiptKeys = new Set(['schemaVersion', 'readback', 'requiredFields']);
  if (exactKeys(policy.receipts, receiptKeys, [...receiptKeys], 'rockstar_ibot-tool.json.receipts', errors)) {
    if (policy.receipts.schemaVersion !== 1) add(errors, 'rockstar_ibot-tool.json.receipts.schemaVersion', 'only receipt schemaVersion 1 is supported');
    requireEnum(policy.receipts.readback, new Set(['none', 'provider_required']), 'rockstar_ibot-tool.json.receipts.readback', errors);
    const fields = requireUniqueStrings(policy.receipts.requiredFields, null, 'rockstar_ibot-tool.json.receipts.requiredFields', errors, { min: REQUIRED_RECEIPT_FIELDS.length, pattern: /^[a-z][a-z0-9_]*$/ });
    REQUIRED_RECEIPT_FIELDS.forEach((required) => {
      if (!fields.includes(required)) add(errors, 'rockstar_ibot-tool.json.receipts.requiredFields', `missing required field ${required}`);
    });
    if (hasExternalEffect) {
      if (policy.receipts.readback !== 'provider_required') add(errors, 'rockstar_ibot-tool.json.receipts.readback', 'external effects require independent provider readback');
      if (!fields.includes('provider_readback_sha256')) add(errors, 'rockstar_ibot-tool.json.receipts.requiredFields', 'external effects require provider_readback_sha256');
    }
  }
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestSha256(server, policy) {
  return createHash('sha256')
    .update(canonicalJson(server))
    .update('\n')
    .update(canonicalJson(policy))
    .digest('hex');
}

export function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validatePackageDirectory(directory, options = {}) {
  const errors = [];
  let server;
  let policy;
  try {
    server = readJson(path.join(directory, 'server.json'));
  } catch (error) {
    add(errors, 'server.json', error.message);
  }
  try {
    policy = readJson(path.join(directory, 'rockstar_ibot-tool.json'));
  } catch (error) {
    add(errors, 'rockstar_ibot-tool.json', error.message);
  }
  if (!server || !policy) return { ok: false, errors, directory };
  scanSecretValues(server, 'server.json', errors);
  scanSecretValues(policy, 'rockstar_ibot-tool.json', errors);
  const remoteHosts = validateServer(server, errors, options);
  validatePolicy(policy, server, remoteHosts, errors);
  const digest = manifestSha256(server, policy);
  if (options.expectedDigest && digest !== options.expectedDigest) {
    add(errors, 'registry.manifestSha256', `digest mismatch; expected ${options.expectedDigest}, got ${digest}`);
  }
  return { ok: errors.length === 0, errors, directory, server, policy, digest };
}

function validateRegistryEntryShape(entry, index, errors) {
  const field = `registry.entries[${index}]`;
  const keys = new Set(['serverName', 'directory', 'entryKind', 'state', 'manifestSha256', 'artifactSha256', 'publisher', 'review', 'enabledCapabilities']);
  const required = ['serverName', 'directory', 'entryKind', 'state', 'manifestSha256', 'publisher', 'review', 'enabledCapabilities'];
  if (!exactKeys(entry, keys, required, field, errors)) return;
  requireString(entry.serverName, `${field}.serverName`, errors, { max: 200, pattern: SERVER_NAME });
  requireString(entry.directory, `${field}.directory`, errors, { max: 300 });
  if (path.isAbsolute(entry.directory) || entry.directory.split('/').includes('..')) add(errors, `${field}.directory`, 'must be a clean path relative to integrations/ai-tools');
  requireEnum(entry.entryKind, new Set(['template', 'package']), `${field}.entryKind`, errors);
  requireEnum(entry.state, new Set(['catalog_only', 'approved', 'disabled', 'revoked']), `${field}.state`, errors);
  if (!SHA256.test(entry.manifestSha256 ?? '')) add(errors, `${field}.manifestSha256`, 'must be a lowercase SHA-256 digest');
  if (Object.hasOwn(entry, 'artifactSha256') && !SHA256.test(entry.artifactSha256)) add(errors, `${field}.artifactSha256`, 'must be a lowercase SHA-256 digest');

  const publisherKeys = new Set(['id', 'displayName', 'status']);
  if (exactKeys(entry.publisher, publisherKeys, [...publisherKeys], `${field}.publisher`, errors)) {
    requireString(entry.publisher.id, `${field}.publisher.id`, errors, { max: 100, pattern: SAFE_ID });
    requireString(entry.publisher.displayName, `${field}.publisher.displayName`, errors, { max: 100 });
    requireEnum(entry.publisher.status, new Set(['unverified', 'verified', 'rejected']), `${field}.publisher.status`, errors);
  }
  const reviewKeys = new Set(['security', 'signature', 'reviewedAt']);
  if (exactKeys(entry.review, reviewKeys, ['security', 'signature'], `${field}.review`, errors)) {
    requireEnum(entry.review.security, new Set(['unreviewed', 'reviewed', 'rejected']), `${field}.review.security`, errors);
    requireEnum(entry.review.signature, new Set(['not_required_template', 'unverified', 'verified', 'invalid']), `${field}.review.signature`, errors);
    if (Object.hasOwn(entry.review, 'reviewedAt') && Number.isNaN(Date.parse(entry.review.reviewedAt))) add(errors, `${field}.review.reviewedAt`, 'must be an ISO date-time');
  }
  requireUniqueStrings(entry.enabledCapabilities, null, `${field}.enabledCapabilities`, errors, { pattern: SAFE_ID });
  if (entry.entryKind === 'template' && entry.state !== 'catalog_only') add(errors, `${field}.state`, 'templates are always catalog_only');
  if (entry.state === 'catalog_only' && entry.enabledCapabilities?.length) add(errors, `${field}.enabledCapabilities`, 'catalog_only entries cannot enable capabilities');
  const rejectedReview = entry.publisher?.status === 'rejected' || entry.review?.security === 'rejected' || entry.review?.signature === 'invalid';
  if (rejectedReview && !['disabled', 'revoked'].includes(entry.state)) add(errors, `${field}.state`, 'rejected or invalid reviews must be disabled or revoked');
  if (entry.state === 'approved') {
    if (entry.publisher?.status !== 'verified') add(errors, `${field}.publisher.status`, 'approved entries require a verified publisher');
    if (entry.review?.security !== 'reviewed') add(errors, `${field}.review.security`, 'approved entries require security review');
    if (entry.review?.signature !== 'verified') add(errors, `${field}.review.signature`, 'approved entries require verified signatures');
    if (!entry.review?.reviewedAt) add(errors, `${field}.review.reviewedAt`, 'approved entries require a review timestamp');
    if (!entry.enabledCapabilities?.length) add(errors, `${field}.enabledCapabilities`, 'approved entries require at least one explicitly enabled capability');
  }
}

export function validateRegistry(aiToolsRoot) {
  const errors = [];
  let registry;
  try {
    registry = readJson(path.join(aiToolsRoot, 'registry.json'));
  } catch (error) {
    return { ok: false, errors: [`registry.json: ${error.message}`], packages: [] };
  }
  const registryKeys = new Set(['$schema', 'schemaVersion', 'entries']);
  if (!exactKeys(registry, registryKeys, [...registryKeys], 'registry', errors)) return { ok: false, errors, packages: [] };
  if (registry.$schema !== './registry.schema.json') add(errors, 'registry.$schema', 'must reference ./registry.schema.json');
  if (registry.schemaVersion !== 1) add(errors, 'registry.schemaVersion', 'only schemaVersion 1 is supported');
  if (!Array.isArray(registry.entries)) {
    add(errors, 'registry.entries', 'must be an array');
    return { ok: false, errors, packages: [] };
  }

  const seenNames = new Set();
  const packages = [];
  registry.entries.forEach((entry, index) => {
    validateRegistryEntryShape(entry, index, errors);
    if (seenNames.has(entry.serverName)) add(errors, `registry.entries[${index}].serverName`, 'duplicate server name');
    seenNames.add(entry.serverName);
    const resolved = path.resolve(aiToolsRoot, entry.directory ?? '');
    const relative = path.relative(aiToolsRoot, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      add(errors, `registry.entries[${index}].directory`, 'must resolve to a child package directory');
      return;
    }
    const validation = validatePackageDirectory(resolved, {
      expectedDigest: entry.manifestSha256,
      allowReservedInvalid: entry.entryKind === 'template',
    });
    validation.errors.forEach((message) => add(errors, `registry.entries[${index}]`, message));
    if (validation.server?.name !== entry.serverName) add(errors, `registry.entries[${index}].serverName`, 'must match the package server name');
    const declaredIDs = new Set(validation.policy?.capabilities?.map((capability) => capability.id) ?? []);
    for (const capabilityID of entry.enabledCapabilities ?? []) {
      if (!declaredIDs.has(capabilityID)) add(errors, `registry.entries[${index}].enabledCapabilities`, `unknown capability ${capabilityID}`);
    }
    packages.push({ entry, ...validation });
  });
  return { ok: errors.length === 0, errors, registry, packages };
}

function packageFormat(server) {
  if (server.remotes?.length) return 'remote-mcp';
  return [...new Set((server.packages ?? []).map((pkg) => pkg.registryType))].sort().join('+');
}

export function buildPublicCatalog(aiToolsRoot) {
  const validation = validateRegistry(aiToolsRoot);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  const packages = validation.packages
    .filter(({ entry }) => !['disabled', 'revoked'].includes(entry.state))
    .map(({ entry, server, policy, digest }) => ({
      id: `${server.name}@${server.version}`,
      serverName: server.name,
      title: server.title ?? server.name.split('/')[1],
      description: server.description,
      version: server.version,
      kind: policy.kind,
      entryKind: entry.entryKind,
      validationState: 'schema_valid',
      publisherTrust: entry.publisher.status === 'verified' ? 'metadata_reviewed' : 'publisher_unverified',
      runtimeState: 'catalog_only',
      registryState: entry.state,
      signatureState: entry.review.signature,
      publisherName: entry.publisher.displayName,
      packageFormat: packageFormat(server),
      manifestSha256: digest,
      capabilities: policy.capabilities.map((capability) => ({
        id: capability.id,
        title: capability.title,
        description: capability.description,
        effect: capability.effect,
        ownerApproval: capability.ownerApproval,
      })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    source: 'integrations/ai-tools/registry.json',
    executionEnabled: false,
    supportedPackageTypes: ['remote-mcp', 'npm', 'pypi', 'cargo', 'oci', 'nuget', 'mcpb'],
    packages,
  };
}

export function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const aiToolPackageConstants = Object.freeze({
  requiredReceiptFields: [...REQUIRED_RECEIPT_FIELDS],
  supportedPackageTypes: ['remote-mcp', ...PACKAGE_TYPES],
});

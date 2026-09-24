#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPublicCatalog,
  prettyJson,
  validatePackageDirectory,
  validateRegistry,
} from '../lib/ai-tool-package.mjs';
import {
  discoverProductHunt,
  preparePrivateProductHuntOutput,
  PRODUCT_HUNT_ACCESS_TOKEN_ENV,
  PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV,
  validateProductHuntSource,
  writePrivateProductHuntQueue,
} from '../lib/producthunt-discovery.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aiToolsRoot = path.join(repoRoot, 'integrations', 'ai-tools');
const webCatalogPath = path.join(repoRoot, 'apps', 'rockstar_ibot-hub', 'app', 'generated', 'ai-tool-catalog.json');
const iosCatalogPath = path.join(repoRoot, 'apps', 'rockstar_ibot-ios', 'RockstarIbot', 'Resources', 'AIToolCatalog.json');
const productHuntSourcePath = path.join(aiToolsRoot, 'discovery', 'producthunt-source.json');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? null;
}

function scaffold(args) {
  const target = args[0];
  const name = option(args, '--name');
  const title = option(args, '--title');
  const remote = option(args, '--remote');
  if (!target || !name || !title || !remote) {
    return fail('Usage: ai-tool-package scaffold <directory> --name <reverse-dns/server> --title <title> --remote <https-url>');
  }
  const directory = path.resolve(process.cwd(), target);
  if (existsSync(directory) && readdirSync(directory).length > 0) return fail(`Refusing to overwrite non-empty directory: ${directory}`);
  let parsed;
  try {
    parsed = new URL(remote);
  } catch {
    return fail('--remote must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    return fail('--remote must be an exact HTTPS URL on port 443 without embedded credentials');
  }
  if (!/^[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+$/.test(name)) return fail('--name must use reverse-DNS/server form');
  mkdirSync(directory, { recursive: true });
  const server = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name,
    description: `Remote MCP tool package for ${title}`.slice(0, 100),
    version: '0.1.0',
    title,
    remotes: [{ type: 'streamable-http', url: remote }],
    _meta: { 'io.rockstar-ibot/package': { policy: './rockstar_ibot-tool.json' } },
  };
  const policy = {
    $schema: 'https://raw.githubusercontent.com/k999ln/Mr./main/integrations/ai-tools/rockstar_ibot-tool.schema.json',
    schemaVersion: 1,
    serverName: name,
    kind: 'remote_tool',
    compatibility: { minimumCoreVersion: '1.0.0', surfaces: ['web', 'ios', 'core'] },
    capabilities: [{
      id: 'replace-me',
      title: 'Replace me',
      description: 'Describe one bounded capability before submitting this package.',
      inputDataClasses: ['public_text'],
      outputDataClasses: ['generated_content'],
      effect: 'read',
      ownerApproval: 'install',
      idempotencyRequired: true,
      receiptRequired: true,
    }],
    requestedPermissions: {
      dataRead: ['public_text'],
      dataWrite: ['generated_content'],
      credentialSlots: [],
      network: [{ scheme: 'https', host: parsed.hostname.toLowerCase(), port: 443, methods: ['POST'] }],
      storage: { retentionDays: 0, containsPersonalData: false },
    },
    runtime: { mode: 'isolated_remote', timeoutMs: 30000, maxOutputBytes: 1048576, maxConcurrency: 1 },
    commercial: { mode: 'free', requiresQuote: false },
    receipts: {
      schemaVersion: 1,
      readback: 'none',
      requiredFields: ['receipt_id', 'run_id', 'server_name', 'version', 'package_digest', 'capability_id', 'grant_id', 'input_sha256', 'output_sha256', 'status', 'started_at', 'finished_at'],
    },
  };
  writeFileSync(path.join(directory, 'server.json'), prettyJson(server), { flag: 'wx' });
  writeFileSync(path.join(directory, 'rockstar_ibot-tool.json'), prettyJson(policy), { flag: 'wx' });
  process.stdout.write(`Created ${directory}\nRun: npm run ai-tools:validate -- ${JSON.stringify(directory)}\n`);
}

function validate(args) {
  const target = args[0];
  const validation = target
    ? validatePackageDirectory(path.resolve(process.cwd(), target), { allowReservedInvalid: target.includes('templates') })
    : validateRegistry(aiToolsRoot);
  if (!validation.ok) return fail(validation.errors.map((error) => `ERROR ${error}`).join('\n'));
  if (target) process.stdout.write(`VALID ${target} ${(validation.digest ?? '').slice(0, 12)}\n`);
  else process.stdout.write(`VALID registry ${validation.packages.length} package(s)\n`);
}

function catalog(args) {
  const check = args.includes('--check');
  const output = prettyJson(buildPublicCatalog(aiToolsRoot));
  const targets = [webCatalogPath, iosCatalogPath];
  if (check) {
    const mismatches = targets.filter((target) => !existsSync(target) || readFileSync(target, 'utf8') !== output);
    if (mismatches.length) return fail(`Generated AI tool catalog is stale:\n${mismatches.join('\n')}`);
    process.stdout.write(`CURRENT ${targets.length} generated catalog projection(s)\n`);
    return;
  }
  for (const target of targets) {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, output);
    process.stdout.write(`WROTE ${path.relative(repoRoot, target)}\n`);
  }
}

function readProductHuntSource(sourcePath) {
  let source;
  try {
    source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read Product Hunt source config: ${error.message}`);
  }
  const validation = validateProductHuntSource(source);
  if (!validation.ok) throw new Error(`Invalid Product Hunt source config:\n${validation.errors.join('\n')}`);
  return source;
}

function parseProductHuntArgs(args) {
  const queries = [];
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!['--query', '--output'].includes(flag)) {
      throw new Error(`Unknown Product Hunt discovery argument: ${flag}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    index += 1;
    if (flag === '--query') queries.push(value);
    else {
      if (output !== null) throw new Error('--output may be specified only once.');
      output = value;
    }
  }
  if (output === null) throw new Error('--output is required; candidate metadata is never written to stdout.');
  if (!path.isAbsolute(output)) throw new Error('--output must be an absolute private path outside the repository.');
  return { output: path.normalize(output), queries };
}

async function discoverProductHuntCommand(args) {
  const { output, queries } = parseProductHuntArgs(args);
  const target = preparePrivateProductHuntOutput(output, { forbiddenRoot: repoRoot });
  const source = readProductHuntSource(productHuntSourcePath);
  const result = await discoverProductHunt({
    source,
    token: process.env[PRODUCT_HUNT_ACCESS_TOKEN_ENV],
    commercialApproval: process.env[PRODUCT_HUNT_COMMERCIAL_APPROVAL_ENV] === 'true',
    queries,
  });
  const written = writePrivateProductHuntQueue(target, result, { forbiddenRoot: repoRoot, source });
  if (!written) throw new Error('Private Product Hunt candidate queue was not written.');
  process.stdout.write(`WROTE private Product Hunt candidate queue (${result.candidates.length} candidate(s))\n`);
}

const [command = 'validate', ...args] = process.argv.slice(2);
if (command === 'validate') validate(args);
else if (command === 'scaffold') scaffold(args);
else if (command === 'catalog') catalog(args);
else if (command === 'discover-producthunt') {
  try {
    await discoverProductHuntCommand(args);
  } catch (error) {
    fail(`ERROR ${error.code ? `${error.code}: ` : ''}${error.message}`);
  }
} else fail('Commands: validate [directory] | scaffold <directory> ... | catalog [--check] | discover-producthunt [--query <allowlisted-text>] --output <absolute-private-path>');

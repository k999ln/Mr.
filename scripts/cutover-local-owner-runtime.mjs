#!/usr/bin/env node

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CANONICAL_REPOSITORY = 'https://github.com/k999ln/Mr.';

function normalizedRemote(value) {
  return String(value || '').trim().replace(/\.git$/, '');
}

function replaceEnvValue(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\n?$/, '\n')}${line}\n`;
}

function writePrivateAtomic(target, value) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, value, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function legacyLabels(launchAgentsDir) {
  if (!existsSync(launchAgentsDir)) return [];
  const labels = readdirSync(launchAgentsDir)
    .filter((name) => /^(?:ai|com)\.anicca\..+\.plist$/.test(name))
    .map((name) => name.replace(/\.plist$/, ''));
  labels.push('com.anicca.daemon');
  return [...new Set(labels)].sort();
}

function main() {
  const applyEnvironment = process.argv.includes('--apply-env') || process.argv.includes('--apply');
  const disableLegacyJobs = process.argv.includes('--disable-legacy-jobs') || process.argv.includes('--apply');
  if (!applyEnvironment && !disableLegacyJobs) {
    throw new Error('dry run only; pass --apply-env and/or --disable-legacy-jobs');
  }
  const remote = execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (normalizedRemote(remote) !== CANONICAL_REPOSITORY) {
    throw new Error('origin is not the Kai-owned canonical repository');
  }

  const envIndex = process.argv.indexOf('--env-file');
  const envFile = envIndex >= 0
    ? path.resolve(process.argv[envIndex + 1] || '')
    : path.join(homedir(), '.local', 'state', 'mr-bot', '.env');
  const updatedEnvironmentKeys = [];
  if (applyEnvironment) {
    if (!existsSync(envFile)) throw new Error(`runtime env file not found: ${envFile}`);
    const updated = replaceEnvValue(readFileSync(envFile, 'utf8'), 'MR_BOT_SOURCE_REPO', ROOT);
    writePrivateAtomic(envFile, updated);
    updatedEnvironmentKeys.push('MR_BOT_SOURCE_REPO');
  }

  const safeLaunchctl = path.join(ROOT, 'bin', 'launchctl-safe');
  const domain = `gui/${process.getuid()}`;
  const labels = disableLegacyJobs
    ? legacyLabels(path.join(homedir(), 'Library', 'LaunchAgents'))
    : [];
  const listed = spawnSync(safeLaunchctl, ['list'], { encoding: 'utf8' });
  if (listed.status !== 0) throw new Error('could not inspect loaded launchd jobs');
  const loadedLabels = new Set(String(listed.stdout || '').split('\n')
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter((label) => /^(?:ai|com)\.anicca\./.test(label || '')));
  const failures = [];
  const stoppedLabels = [];
  for (const label of labels) {
    const service = `${domain}/${label}`;
    const disabled = spawnSync(safeLaunchctl, ['disable', service], { encoding: 'utf8' });
    if (disabled.status !== 0) failures.push(`${label}:disable`);
    if (loadedLabels.has(label)) {
      const stopped = spawnSync(safeLaunchctl, ['bootout', service], { encoding: 'utf8' });
      if (stopped.status !== 0) failures.push(`${label}:bootout`);
      else stoppedLabels.push(label);
    }
  }
  if (failures.length) throw new Error(`launchd cutover incomplete: ${failures.join(', ')}`);

  const receipt = {
    schemaVersion: 1,
    changedAt: new Date().toISOString(),
    owner: 'Kai / k999ln',
    canonicalRepository: CANONICAL_REPOSITORY,
    sourceRepositoryPath: ROOT,
    updatedEnvironmentKeys,
    legacyLaunchdLabelsDisabled: labels,
    legacyLaunchdLabelsStopped: stoppedLabels,
    historicalFilesDeleted: false,
    secretValuesRecorded: false,
  };
  const receiptPath = path.join(homedir(), '.local', 'state', 'rockstar_ibot', 'owner-cutover-receipt.json');
  writePrivateAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, envFile, receiptPath, disabledCount: labels.length })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[owner-cutover] ${error.message}\n`);
    process.exitCode = 1;
  }
}

export { legacyLabels, normalizedRemote, replaceEnvValue };

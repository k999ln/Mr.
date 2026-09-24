#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

function readJson(root, relativePath) {
  const absolute = path.join(root, relativePath);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`${relativePath} is missing or invalid: ${error.message}`);
  }
}

export function auditOwnerRuntimeBoundary(root = DEFAULT_ROOT) {
  const resolvedRoot = path.resolve(root);
  const policy = readJson(resolvedRoot, 'config/owner-runtime-policy.json');
  const owner = readJson(resolvedRoot, 'config/owner-public.json');
  const quarantine = readJson(resolvedRoot, 'config/legacy-owner-quarantine.json');
  const registry = readJson(resolvedRoot, 'skills/registry.json');
  const errors = [];

  const canonicalRepository = 'https://github.com/k999ln/Mr.';
  if (policy.owner?.displayName !== 'Kai' || policy.owner?.githubLogin !== 'k999ln') {
    errors.push('runtime owner must be Kai / k999ln');
  }
  if (policy.canonicalRepository !== canonicalRepository) {
    errors.push('runtime policy canonical repository mismatch');
  }
  if (owner.owner?.displayName !== 'Kai' || owner.owner?.githubLogin !== 'k999ln') {
    errors.push('owner-public identity mismatch');
  }
  if (owner.links?.repository !== canonicalRepository) {
    errors.push('owner-public repository mismatch');
  }
  if (policy.mode !== 'core_only') {
    errors.push('runtime mode must remain core_only during owner cutover');
  }
  if (policy.autonomousRuntimeActivation !== false) {
    errors.push('autonomous runtime must remain disabled during owner cutover');
  }
  if (quarantine.status !== 'quarantined' || quarantine.defaultActivation !== false) {
    errors.push('legacy owner quarantine must remain fail-closed');
  }

  const allowedLiveSlots = [...(policy.allowedLiveSlots || [])].sort();
  const liveSlots = Object.entries(registry.slots || {})
    .filter(([, value]) => value && value.status === 'live')
    .map(([name]) => name)
    .sort();
  if (JSON.stringify(liveSlots) !== JSON.stringify(allowedLiveSlots)) {
    errors.push(`live slots must exactly match owner policy (${allowedLiveSlots.join(', ') || 'none'})`);
  }
  if (registry.runtime_root !== policy.runtimeStateRoot) {
    errors.push('skill registry runtime root mismatch');
  }
  if (policy.activeServices?.core !== owner.links?.core) {
    errors.push('active Core endpoint mismatch');
  }
  if (policy.activeServices?.telegramBotUsername !== owner.telegram?.botUsername) {
    errors.push('active Telegram bot mismatch');
  }

  return {
    ok: errors.length === 0,
    mode: policy.mode,
    owner: `${policy.owner?.displayName || ''} / ${policy.owner?.githubLogin || ''}`,
    canonicalRepository: policy.canonicalRepository,
    autonomousRuntimeActivation: policy.autonomousRuntimeActivation,
    liveSlots,
    errors,
  };
}

export function assertAutonomousRuntimeActivationAllowed(root = DEFAULT_ROOT, options = {}) {
  const report = auditOwnerRuntimeBoundary(root);
  if (!report.ok) throw new Error(`owner runtime boundary failed: ${report.errors.join('; ')}`);
  if (options.testOnlyBypass === true) return report;
  throw new Error('legacy autonomous runtime is disabled; use Kai-owned avocadomini Core');
}

function runCli() {
  const command = process.argv[2] || '--audit';
  try {
    if (command === '--audit') {
      const report = auditOwnerRuntimeBoundary(DEFAULT_ROOT);
      process.stdout.write(`${JSON.stringify(report)}\n`);
      if (!report.ok) process.exitCode = 1;
      return;
    }
    if (command === '--require-activation') {
      assertAutonomousRuntimeActivationAllowed(DEFAULT_ROOT);
      return;
    }
    throw new Error('usage: owner-boundary.mjs [--audit|--require-activation]');
  } catch (error) {
    process.stderr.write(`[owner-boundary] ${error.message}\n`);
    process.exitCode = 78;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();

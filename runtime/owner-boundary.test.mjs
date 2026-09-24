import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAutonomousRuntimeActivationAllowed,
  auditOwnerRuntimeBoundary,
} from './owner-boundary.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Kai owner boundary is internally consistent and exposes only approved live slots', () => {
  const report = auditOwnerRuntimeBoundary(ROOT);
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.equal(report.mode, 'core_only');
  assert.equal(report.canonicalRepository, 'https://github.com/k999ln/Mr.');
  assert.deepEqual(report.liveSlots, ['resource-resolver']);
});

test('historical autonomous runtime activation remains fail-closed', () => {
  assert.throws(
    () => assertAutonomousRuntimeActivationAllowed(ROOT),
    /disabled.*Kai-owned avocadomini Core/i,
  );
});

test('Core production image excludes old Instagram and autonomous payout dependencies', () => {
  const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const dockerignore = readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
  assert.doesNotMatch(dockerfile, /instagrapi|marketing-engine|COPY skills\/video/);
  for (const required of [
    'apps/rockstar_ibot/lib/marketing-*',
    'apps/rockstar_ibot/scripts/*instagram*',
    'apps/rockstar_ibot/scripts/run-agent-payout.js',
  ]) {
    assert.match(dockerignore, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

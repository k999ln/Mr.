import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizedRemote, replaceEnvValue } from './cutover-local-owner-runtime.mjs';

test('canonical remote comparison accepts only an optional git suffix', () => {
  assert.equal(normalizedRemote('https://github.com/k999ln/Mr..git\n'), 'https://github.com/k999ln/Mr.');
  assert.notEqual(normalizedRemote('https://github.com/k999ln/vvvv.git'), 'https://github.com/k999ln/Mr.');
});

test('source repo migration changes only the selected env key', () => {
  const before = 'TOKEN=secret\nMR_BOT_SOURCE_REPO=/old/path\nOTHER=value\n';
  const after = replaceEnvValue(before, 'MR_BOT_SOURCE_REPO', '/Users/kaiya/Desktop/akume/Mr.');
  assert.equal(after, 'TOKEN=secret\nMR_BOT_SOURCE_REPO=/Users/kaiya/Desktop/akume/Mr.\nOTHER=value\n');
});

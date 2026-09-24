import assert from 'node:assert/strict';
import test from 'node:test';
import { readStorageHealth } from './storage-health.ts';

const fixedNow = () => new Date('2026-08-31T18:30:00.000Z');

test('R2 health probe proves the binding with a read-only head request', async () => {
  const requestedKeys = [];
  const result = await readStorageHealth(
    {
      async head(key) {
        requestedKeys.push(key);
        return null;
      },
    },
    fixedNow,
  );

  assert.deepEqual(result, {
    status: 'ready',
    checkedAt: '2026-08-31T18:30:00.000Z',
  });
  assert.deepEqual(requestedKeys, ['__mrbot_health__/binding-probe']);
});

test('R2 health probe fails closed when the binding is absent', async () => {
  assert.deepEqual(await readStorageHealth(undefined, fixedNow), {
    status: 'unavailable',
    checkedAt: '2026-08-31T18:30:00.000Z',
  });
});

test('R2 health probe returns unavailable without exposing provider errors', async () => {
  const result = await readStorageHealth(
    {
      async head() {
        throw new Error('sensitive provider detail');
      },
    },
    fixedNow,
  );

  assert.deepEqual(result, {
    status: 'unavailable',
    checkedAt: '2026-08-31T18:30:00.000Z',
  });
});

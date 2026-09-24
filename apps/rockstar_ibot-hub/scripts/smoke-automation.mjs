import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Synthetic local data only; never run this against a hosted Site.
const base = 'http://localhost:3000';
const name = `Mr smoke ${randomUUID()}`;
const marker = `[ツール導入確認・自社開発] ${name}`;
const key = randomUUID();
// The installed Sites dev plugin owns the local fixture identity and strips
// forged identity headers. Use its actual sign-in flow rather than bypass it.
const signIn = await fetch(`${base}/signin-with-chatgpt?return_to=/`, { redirect: 'manual' });
assert.equal(signIn.status, 302);
const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const identity = { Cookie: cookie };
const headers = { ...identity, 'Content-Type': 'application/json', Origin: base, 'Sec-Fetch-Site': 'same-origin', 'Idempotency-Key': key };
const getRequests = async () => {
  const response = await fetch(`${base}/api/automation/requests`, { headers: identity });
  assert.equal(response.status, 200);
  return (await response.json()).requests;
};
try {
  const catalogResponse = await fetch(`${base}/api/automation/catalog`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.tools.length, 15);
  assert.equal(catalog.servicePlan.amountMinor, 888);
  assert.equal(catalog.servicePlan.billingLive, false);
  assert.equal((await fetch(`${base}/api/automation/requests`)).status, 401);
  const cross = await fetch(`${base}/api/automation/requests`, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: JSON.stringify({ name, origin: 'builtin' }) });
  assert.equal(cross.status, 403);
  const invalid = await fetch(`${base}/api/automation/requests`, { method: 'POST', headers, body: JSON.stringify({ name, origin: 'builtin', url: 'https://example.com/?token=not-a-real-token' }) });
  assert.equal(invalid.status, 400);
  for (let repeat = 0; repeat < 2; repeat++) {
    const saved = await fetch(`${base}/api/automation/requests`, { method: 'POST', headers, body: JSON.stringify({ name, origin: 'builtin' }) });
    assert.equal(saved.status, 201, await saved.text());
  }
  const items = await getRequests();
  assert.equal(items.filter(item => item.title === marker).length, 1);
  const spoofed = await fetch(`${base}/api/automation/requests`, { headers: { 'oai-authenticated-user-id': `mr-other-${key}`, 'oai-authenticated-user-email': 'other@sites.test' } });
  assert.equal(spoofed.status, 401);
  const workspace = await fetch(`${base}/life`, { headers: identity });
  assert.equal(workspace.status, 200);
  console.log('PASS: catalog, price, sign-in, forged-header rejection, cross-origin rejection, validation, save/reload, idempotency, preserved workspace.');
} finally {
  const items = await getRequests();
  for (const item of items.filter(item => item.title === marker)) {
    const removed = await fetch(`${base}/api/operating/tasks`, { method: 'DELETE', headers, body: JSON.stringify({ taskId: item.id }) });
    assert.equal(removed.status, 200);
  }
  assert.equal((await getRequests()).filter(item => item.title === marker).length, 0);
  console.log('PASS: synthetic work item removed.');
}

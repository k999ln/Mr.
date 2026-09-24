import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOUNDATION_POLICY,
  foundationCategoriesForKind,
  validateFoundationRequest,
} from './foundation-policy.ts';

test('service allocation accepts a bounded non-cash unit request', () => {
  const result = validateFoundationRequest({
    kind: 'service_access',
    category: 'seo',
    requestedUnits: 3,
    purposeSummary: '公開済みページの検索導線を改善するために利用します。',
    attested: true,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.requestedUnits, 3);
});

test('essentials support cannot be converted into allocation units', () => {
  const result = validateFoundationRequest({
    kind: 'essentials_support',
    category: 'food',
    requestedUnits: 1,
    purposeSummary: '今週必要になる保存可能な食料品の支援を申請します。',
    attested: true,
  });
  assert.equal(result.ok, false);
});

test('direct identifiers are rejected from the review summary', () => {
  const result = validateFoundationRequest({
    kind: 'ai_capacity',
    category: 'research',
    requestedUnits: 2,
    purposeSummary: '連絡先は person@example.com です。調査に使います。',
    attested: true,
  });
  assert.deepEqual(result, {
    ok: false,
    error: 'この欄には住所、電話、メール、口座などの個人情報を入力しないでください。',
  });
});

test('unit, category, and attestation boundaries fail closed', () => {
  assert.equal(validateFoundationRequest({
    kind: 'service_access',
    category: 'food',
    requestedUnits: 2,
    purposeSummary: 'サービス提供に必要な利用枠を申請するための用途説明です。',
    attested: true,
  }).ok, false);
  assert.equal(validateFoundationRequest({
    kind: 'ai_capacity',
    category: 'research',
    requestedUnits: FOUNDATION_POLICY.maxRequestedUnits + 1,
    purposeSummary: '公開情報だけを使う調査処理の利用枠を申請します。',
    attested: true,
  }).ok, false);
  assert.equal(validateFoundationRequest({
    kind: 'ai_capacity',
    category: 'research',
    requestedUnits: 1,
    purposeSummary: '公開情報だけを使う調査処理の利用枠を申請します。',
    attested: false,
  }).ok, false);
});

test('policy and category boundaries remain explicit', () => {
  assert.equal(FOUNDATION_POLICY.transferable, false);
  assert.equal(FOUNDATION_POLICY.redeemable, false);
  assert.equal(FOUNDATION_POLICY.automatedApproval, false);
  assert.ok(foundationCategoriesForKind('service_access').some(([value]) => value === 'youtube_script'));
});

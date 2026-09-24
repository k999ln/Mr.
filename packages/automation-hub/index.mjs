import catalog from './catalog.json' with { type: 'json' };

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const servicePlan = Object.freeze({
  id: 'mr-electricity-monthly-v1',
  amountMinor: 888,
  currency: 'USD',
  interval: 'month',
  revenueShareBps: 0,
  billingLive: false,
});

// Inventory is data, never an executable plugin registry.
export const tools = deepFreeze(catalog.tools);

const DRAFT_FIELDS = new Set(['title', 'requirements', 'deliverables', 'deadline', 'price']);
const DAY_MS = 86_400_000;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function textField(value, label, maximum) {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  if (value.length > maximum) throw new TypeError(`${label} exceeds ${maximum} characters`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} contains unsupported control characters`);
  }
  return value.replace(/\r\n?/g, '\n').trim();
}

function listField(value, label) {
  if (value === undefined) return [];
  let content = value;
  if (Array.isArray(value)) {
    if (value.length > 40) throw new TypeError(`${label} exceeds 40 items`);
    content = Array.from(value, (item) => {
      if (typeof item !== 'string') throw new TypeError(`${label} items must be strings`);
      return textField(item, label, 8000);
    }).join('\n');
  }
  const lines = textField(content, label, 8000).split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 40) throw new TypeError(`${label} exceeds 40 items`);
  return lines;
}

/** Offline template builder. Inputs remain plain text and are never interpreted as commands. */
export function buildCoconalaDraft(input = {}) {
  if (!plainObject(input)) throw new TypeError('input must be a plain object');
  if (Object.keys(input).some((key) => !DRAFT_FIELDS.has(key))) {
    throw new TypeError('input contains an unknown field');
  }
  const title = textField(input.title, 'title', 160);
  const requirements = listField(input.requirements, 'requirements');
  const deliverables = listField(input.deliverables, 'deliverables');
  const deadline = textField(input.deadline, 'deadline', 200);
  let priceValue = input.price;
  if (typeof priceValue === 'number') {
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      throw new TypeError('price must be a finite non-negative number');
    }
    priceValue = String(priceValue);
  }
  const price = textField(priceValue, 'price', 100);
  const warnings = [];
  for (const [present, label] of [
    [title, '案件名'], [requirements.length, '依頼内容'], [deliverables.length, '成果物'],
    [deadline, '希望納期'], [price, '希望見積り'],
  ]) {
    if (!present) warnings.push(`${label}が未入力です。送信前に確認してください。`);
  }
  if (price && !/(?:円|JPY|USD|EUR|GBP|¥|￥|\$|€|£)/iu.test(price)) {
    warnings.push('見積りの通貨が明確ではありません。通貨と税込・税別を確認してください。');
  }
  warnings.push('入力された条件だけを整理した下書きです。対応可否・実績・納期・金額の確認が必要です。');
  warnings.push('応募・メッセージ送信・納品・決済は行いません。受注や利益を保証するものではありません。');

  const bullets = (values, fallback) => (values.length ? values.map((value) => `・${value}`).join('\n') : `・${fallback}`);
  const proposal = [
    `件名：${title || '[要確認：案件名]'}`,
    '',
    'はじめまして。ご依頼内容について、以下の対応案をご提案します。',
    '',
    '【ご依頼内容の確認】',
    bullets(requirements, '[要確認：依頼内容・対象範囲]'),
    '',
    '【成果物の案】',
    bullets(deliverables, '[要確認：納品物・形式・数量]'),
    '',
    `【希望納期】${deadline || '[要確認：納期・作業開始日]'}`,
    `【希望見積り】${price || '[要確認：金額・通貨・税の扱い]'}`,
    '',
    '【着手前に確認したいこと】',
    '・対象範囲と、今回の作業に含めない内容',
    '・ご提供いただく資料、利用権限、素材の権利',
    '・納品形式、検収条件、修正回数と追加作業の扱い',
    '・上記の納期と金額で対応できるか、詳細確認後に確定すること',
    '',
    '条件を確認し、双方で合意した内容に沿って進められればと思います。よろしくお願いいたします。',
  ].join('\n');

  return {
    proposal,
    checklist: [
      '案件の募集内容と、この提案の対象範囲が一致している',
      ...requirements.map((item) => `対応方法と実現可否を確認する：${item}`),
      ...deliverables.map((item) => `納品形式・数量・検収方法を確認する：${item}`),
      '希望納期、作業開始条件、必要な資料を確認する',
      '金額・通貨・税・サービス手数料・外部ツール原価を確認する',
      '修正回数と追加作業の見積り条件を確認する',
      '実績や資格など、確認できない自己紹介を追加していない',
      'ココナラの利用条件と、扱う資料の利用権限を確認する',
      '内容を本人が確認し、必要な送信操作を行う',
    ],
    warnings,
  };
}

function timestamp(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime()) ? value : NaN;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const result = Date.parse(value);
  // Reject rollover dates such as February 30 even when Date.parse normalizes them.
  return Number.isFinite(result) && new Date(result).toISOString().slice(0, 19) === value.slice(0, 19)
    ? result : NaN;
}

/**
 * A pure policy, not a payment verifier. Only a future authenticated backend may
 * provide state verified against its billing provider; browser storage is not authority.
 * This function does not enable billing or gate the free offline draft tool.
 */
export function subscriptionAccess(state, now = Date.now()) {
  const deny = (reason) => ({ allowed: false, reason });
  const current = now instanceof Date ? timestamp(now.getTime()) : timestamp(now);
  if (!Number.isFinite(current)) return deny('invalid_time');
  if (!plainObject(state)) return deny('unknown');
  if (state.revoked === true || (state.revokedAt !== undefined && state.revokedAt !== null)) return deny('revoked');
  if (state.planId !== servicePlan.id) return deny('wrong_plan');
  if (state.status !== 'active') return deny('inactive');
  if (state.revoked !== undefined && state.revoked !== false) return deny('unknown');
  const verified = timestamp(state.verifiedAt);
  const periodEnd = timestamp(state.currentPeriodEnd);
  if (!Number.isFinite(verified) || verified > current || !Number.isFinite(periodEnd)) return deny('unverified');
  if (current - verified >= DAY_MS) return deny('stale');
  if (periodEnd <= current) return deny('expired');
  return { allowed: true, reason: 'active' };
}

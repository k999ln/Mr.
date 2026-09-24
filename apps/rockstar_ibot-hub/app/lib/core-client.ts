import { env } from 'cloudflare:workers';

export type CorePreferences = {
  notificationsEnabled: boolean;
  dailyAutomationEnabled: boolean;
  callEnabled: boolean;
  delegationEnabled: boolean;
  timeZone: string;
  botProfileId: string;
  updatedAt?: string;
};

export type CoreConnectionSnapshot = {
  status: 'unavailable' | 'unlinked' | 'pending' | 'linked';
  botUsername: string;
  launchUrl?: string;
  expiresAt?: string;
  linkedAt?: string;
  accountRef?: string;
  preferences?: CorePreferences;
};

export type CoreTimingSnapshot = {
  status: 'unavailable' | 'unlinked' | 'ready';
  calendar: {
    provider: 'none' | 'composio';
    configured: boolean;
    status: 'unconfigured' | 'pending' | 'connected' | 'revoked' | 'error';
    busyIntervalCount: number;
    nextBusyStart?: string;
    lastSyncedAt?: string;
    issue?: string;
  };
  notifications: {
    ready: boolean;
    notificationsEnabled: boolean;
    dailyAutomationEnabled: boolean;
    pendingCount: number;
    deliveredCount: number;
  };
  commandLedger: { ready: boolean };
};

export type CoreMailConnectionSnapshot = {
  status: 'ready' | 'pending' | 'connected';
  redirectUrl?: string;
  expiresAt?: string;
  verifiedAt?: string;
};

export type CoreMailSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'ready' | 'connected';
  configured: boolean;
  verifiedAt?: string;
};

export type CoreMailRailSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  inboundReady: boolean;
  sendingDomain?: string;
  replyDomain?: string;
  lastSentAt?: string | null;
};

export type CoreMailSendRequest = {
  to: string;
  emailSubject: string;
  text: string;
};

export type CoreMailSendSnapshot = {
  status: 'sent';
  cached: boolean;
};

export type CoreBillingSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'ready' | 'active' | 'inactive';
  configured: boolean;
  paid: boolean;
  planStatus?: string | null;
  currentPeriodEnd?: string | null;
  updatedAt?: string;
};

export type CoreBillingCheckoutSnapshot = {
  status: 'ready' | 'active' | 'used';
  paid: boolean;
  checkoutUrl?: string;
  expiresAt?: string;
  planStatus?: string;
};

export type CoreVoiceSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'mismatch' | 'verified';
  configured: boolean;
  inboundVerified: boolean;
  outboundEnabled: false;
  runtimeMode?: 'verify_only';
  checks?: {
    application: boolean;
    applicationActive: boolean;
    webhook: boolean;
    webhookVersion: boolean;
    phone: boolean;
    phoneActive: boolean;
    phoneConnection: boolean;
  };
};

export type CoreAiSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  generationEnabled: false;
  model?: string;
  generateContentReady?: boolean;
};

export type CoreMapsSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'configured' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  lastVerifiedAt?: string;
};

export type CoreSocialSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'mismatch' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  integrationsVerified: boolean;
  publishingEnabled: false;
  integrations: Array<{
    identifier: string;
    profile: string;
    verified: boolean;
  }>;
};

export type CoreVendorBankSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'mismatch' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  accountVerified: boolean;
  transferEnabled: false;
  runtimeMode?: 'verify_only';
  environment?: 'staging' | 'production';
  checks?: {
    account: boolean;
    ordinaryDeposit: boolean;
    jpy: boolean;
  };
  allowedPurposes: Array<'verified_vendor_procurement' | 'business_expense' | 'customer_refund'>;
};

export type CoreBrowserSnapshot = {
  status: 'unavailable' | 'unlinked' | 'unconfigured' | 'verified';
  configured: boolean;
  credentialVerified: boolean;
  accountVerified: boolean;
  activeSessionPresent: boolean;
  sessionExecutionEnabled: false;
  runtimeMode?: 'verify_only';
};

export type CoreRouteRequest = {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode: 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT';
  departureTime?: string;
};

export type CoreRouteSnapshot = {
  status: 'computed';
  cached: boolean;
  durationSeconds: number;
  distanceMeters: number;
};

export class CoreConnectionError extends Error {
  constructor(public readonly code: string, public readonly httpStatus = 502) {
    super(code);
  }
}

function coreConfiguration(): { origin: string; secret: string } {
  const originValue = String(env.LM_CLOUDFLARE_CORE_URL || '').trim();
  const secret = String(env.LM_HUB_LINK_SECRET || '');
  let url: URL;
  try {
    url = new URL(originValue);
  } catch {
    throw new CoreConnectionError('core_not_configured', 503);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new CoreConnectionError('core_not_configured', 503);
  }
  if (secret.length < 32) throw new CoreConnectionError('core_not_configured', 503);
  return { origin: url.origin, secret };
}

async function coreRequest(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const configuration = coreConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  let raw: string;
  try {
    response = await fetch(`${configuration.origin}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        authorization: `Bearer ${configuration.secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorDetail = (error instanceof Error ? error.message : 'unknown')
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
      .slice(0, 160);
    console.error(JSON.stringify({ event: 'core_request_failed', errorName, errorDetail }));
    throw new CoreConnectionError('core_unavailable', 503);
  } finally {
    clearTimeout(timeout);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new CoreConnectionError('core_redirect_rejected', 502);
  }
  if (raw.length > 65_536) throw new CoreConnectionError('core_response_too_large');
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (!response.ok || result.ok !== true) {
    const code = typeof result.error === 'string' ? result.error : 'core_request_failed';
    throw new CoreConnectionError(code, response.status || 502);
  }
  return result;
}

function snapshot(result: Record<string, unknown>): CoreConnectionSnapshot {
  const status = result.status;
  if (!['unlinked', 'pending', 'linked'].includes(String(status))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  const botUsername = String(result.botUsername || '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername) || !/bot$/i.test(botUsername)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  let launchUrl: string | undefined;
  if (typeof result.launchUrl === 'string') {
    try {
      const url = new URL(result.launchUrl);
      const start = url.searchParams.get('start') || '';
      if (
        url.protocol !== 'https:' || url.hostname !== 't.me' || url.pathname !== `/${botUsername}`
        || !/^link_[A-Za-z0-9_-]{16,64}$/.test(start)
      ) throw new Error('invalid');
      launchUrl = url.toString();
    } catch {
      throw new CoreConnectionError('core_invalid_response');
    }
  }
  return {
    status: status as CoreConnectionSnapshot['status'],
    botUsername,
    ...(launchUrl ? { launchUrl } : {}),
    ...(typeof result.expiresAt === 'string' ? { expiresAt: result.expiresAt } : {}),
    ...(typeof result.linkedAt === 'string' ? { linkedAt: result.linkedAt } : {}),
    ...(typeof result.accountRef === 'string' ? { accountRef: result.accountRef } : {}),
    ...(result.preferences && typeof result.preferences === 'object'
      ? { preferences: result.preferences as CorePreferences }
      : {}),
  };
}

function timingSnapshot(result: Record<string, unknown>): CoreTimingSnapshot {
  if (result.status !== 'ready') throw new CoreConnectionError('core_invalid_response');
  const calendar = result.calendar;
  const notifications = result.notifications;
  const commandLedger = result.commandLedger;
  if (!calendar || typeof calendar !== 'object' || Array.isArray(calendar)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (!notifications || typeof notifications !== 'object' || Array.isArray(notifications)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (!commandLedger || typeof commandLedger !== 'object' || Array.isArray(commandLedger)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  const calendarValue = calendar as Record<string, unknown>;
  const notificationValue = notifications as Record<string, unknown>;
  if (!['none', 'composio'].includes(String(calendarValue.provider))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (!['unconfigured', 'pending', 'connected', 'revoked', 'error'].includes(String(calendarValue.status))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  for (const field of ['busyIntervalCount', 'pendingCount', 'deliveredCount']) {
    const value = field === 'busyIntervalCount' ? calendarValue[field] : notificationValue[field];
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new CoreConnectionError('core_invalid_response');
    }
  }
  for (const field of ['configured']) {
    if (typeof calendarValue[field] !== 'boolean') throw new CoreConnectionError('core_invalid_response');
  }
  for (const field of ['ready', 'notificationsEnabled', 'dailyAutomationEnabled']) {
    if (typeof notificationValue[field] !== 'boolean') throw new CoreConnectionError('core_invalid_response');
  }
  if ((commandLedger as Record<string, unknown>).ready !== true) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: 'ready',
    calendar: calendarValue as CoreTimingSnapshot['calendar'],
    notifications: notificationValue as CoreTimingSnapshot['notifications'],
    commandLedger: { ready: true },
  };
}

function mailSnapshot(result: Record<string, unknown>): CoreMailConnectionSnapshot {
  const status = String(result.status || '');
  if (!['ready', 'pending', 'connected'].includes(status)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  let redirectUrl: string | undefined;
  if (status === 'ready') {
    if (typeof result.redirectUrl !== 'string') throw new CoreConnectionError('core_invalid_response');
    try {
      const url = new URL(result.redirectUrl);
      if (
        url.protocol !== 'https:' || url.username || url.password
        || (url.hostname !== 'unipile.com' && !url.hostname.endsWith('.unipile.com'))
      ) throw new Error('invalid');
      redirectUrl = url.toString();
    } catch {
      throw new CoreConnectionError('core_invalid_response');
    }
  }
  return {
    status: status as CoreMailConnectionSnapshot['status'],
    ...(redirectUrl ? { redirectUrl } : {}),
    ...(typeof result.expiresAt === 'string' ? { expiresAt: result.expiresAt } : {}),
    ...(typeof result.verifiedAt === 'string' ? { verifiedAt: result.verifiedAt } : {}),
  };
}

function mailStatusSnapshot(result: Record<string, unknown>): CoreMailSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'ready', 'connected'].includes(status)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (typeof result.configured !== 'boolean') throw new CoreConnectionError('core_invalid_response');
  return {
    status: status as CoreMailSnapshot['status'],
    configured: result.configured,
    ...(typeof result.verifiedAt === 'string' ? { verifiedAt: result.verifiedAt } : {}),
  };
}

function mailRailSnapshot(result: Record<string, unknown>): CoreMailRailSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (status === 'verified' && (result.inboundReady !== true
    || typeof result.sendingDomain !== 'string'
    || typeof result.replyDomain !== 'string')) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreMailRailSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    inboundReady: result.inboundReady === true,
    ...(typeof result.sendingDomain === 'string' ? { sendingDomain: result.sendingDomain } : {}),
    ...(typeof result.replyDomain === 'string' ? { replyDomain: result.replyDomain } : {}),
    ...(typeof result.lastSentAt === 'string' || result.lastSentAt === null
      ? { lastSentAt: result.lastSentAt } : {}),
  };
}

function mailSendSnapshot(result: Record<string, unknown>): CoreMailSendSnapshot {
  if (result.status !== 'sent' || typeof result.cached !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  return { status: 'sent', cached: result.cached };
}

function billingSnapshot(result: Record<string, unknown>): CoreBillingSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'ready', 'active', 'inactive'].includes(status)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (typeof result.configured !== 'boolean' || typeof result.paid !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreBillingSnapshot['status'],
    configured: result.configured,
    paid: result.paid,
    ...(typeof result.planStatus === 'string' || result.planStatus === null ? { planStatus: result.planStatus } : {}),
    ...(typeof result.currentPeriodEnd === 'string' || result.currentPeriodEnd === null
      ? { currentPeriodEnd: result.currentPeriodEnd } : {}),
    ...(typeof result.updatedAt === 'string' ? { updatedAt: result.updatedAt } : {}),
  };
}

function billingCheckoutSnapshot(result: Record<string, unknown>): CoreBillingCheckoutSnapshot {
  const status = String(result.status || '');
  if (!['ready', 'active', 'used'].includes(status) || typeof result.paid !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  let checkoutUrl: string | undefined;
  if (status === 'ready') {
    if (typeof result.checkoutUrl !== 'string') throw new CoreConnectionError('core_invalid_response');
    try {
      const url = new URL(result.checkoutUrl);
      const reference = url.searchParams.get('client_reference_id') || '';
      if (
        url.protocol !== 'https:' || url.hostname !== 'buy.stripe.com' || url.username || url.password || url.hash
        || !/^lmref_[a-f0-9]{32}$/.test(reference)
      ) throw new Error('invalid');
      checkoutUrl = url.toString();
    } catch {
      throw new CoreConnectionError('core_invalid_response');
    }
  }
  return {
    status: status as CoreBillingCheckoutSnapshot['status'],
    paid: result.paid,
    ...(checkoutUrl ? { checkoutUrl } : {}),
    ...(typeof result.expiresAt === 'string' ? { expiresAt: result.expiresAt } : {}),
    ...(typeof result.planStatus === 'string' ? { planStatus: result.planStatus } : {}),
  };
}

function voiceSnapshot(result: Record<string, unknown>): CoreVoiceSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'mismatch', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.inboundVerified !== 'boolean'
    || result.outboundEnabled !== false) {
    throw new CoreConnectionError('core_invalid_response');
  }
  let checks: CoreVoiceSnapshot['checks'];
  if (result.checks !== undefined) {
    if (!result.checks || typeof result.checks !== 'object' || Array.isArray(result.checks)) {
      throw new CoreConnectionError('core_invalid_response');
    }
    const value = result.checks as Record<string, unknown>;
    const fields = [
      'application', 'applicationActive', 'webhook', 'webhookVersion',
      'phone', 'phoneActive', 'phoneConnection',
    ] as const;
    if (fields.some((field) => typeof value[field] !== 'boolean')) {
      throw new CoreConnectionError('core_invalid_response');
    }
    checks = value as CoreVoiceSnapshot['checks'];
  }
  if (result.runtimeMode !== undefined && result.runtimeMode !== 'verify_only') {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreVoiceSnapshot['status'],
    configured: result.configured,
    inboundVerified: result.inboundVerified,
    outboundEnabled: false,
    ...(result.runtimeMode === 'verify_only' ? { runtimeMode: 'verify_only' as const } : {}),
    ...(checks ? { checks } : {}),
  };
}

function aiSnapshot(result: Record<string, unknown>): CoreAiSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean'
    || result.generationEnabled !== false) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (result.model !== undefined && !/^gemini-\d+\.\d+-(?:flash|flash-lite|pro)$/.test(String(result.model))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (result.generateContentReady !== undefined && typeof result.generateContentReady !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreAiSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    generationEnabled: false,
    ...(typeof result.model === 'string' ? { model: result.model } : {}),
    ...(typeof result.generateContentReady === 'boolean'
      ? { generateContentReady: result.generateContentReady } : {}),
  };
}

function mapsSnapshot(result: Record<string, unknown>): CoreMapsSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'configured', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean') {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreMapsSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    ...(typeof result.lastVerifiedAt === 'string' ? { lastVerifiedAt: result.lastVerifiedAt } : {}),
  };
}

function socialSnapshot(result: Record<string, unknown>): CoreSocialSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'mismatch', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean'
    || typeof result.integrationsVerified !== 'boolean'
    || result.publishingEnabled !== false
    || !Array.isArray(result.integrations)
    || result.integrations.length > 20) {
    throw new CoreConnectionError('core_invalid_response');
  }
  const integrations = result.integrations.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CoreConnectionError('core_invalid_response');
    }
    const value = entry as Record<string, unknown>;
    const identifier = String(value.identifier || '');
    const profile = String(value.profile || '');
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(identifier)
      || !profile || profile.length > 128 || /[\u0000-\u001f\u007f]/.test(profile)
      || typeof value.verified !== 'boolean') {
      throw new CoreConnectionError('core_invalid_response');
    }
    return { identifier, profile, verified: value.verified };
  });
  if (status === 'verified' && (!integrations.length || !integrations.every((entry) => entry.verified))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreSocialSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    integrationsVerified: result.integrationsVerified,
    publishingEnabled: false,
    integrations,
  };
}

function vendorBankSnapshot(result: Record<string, unknown>): CoreVendorBankSnapshot {
  const status = String(result.status || '');
  const allowedPurposes = result.allowedPurposes;
  const expectedPurposes = ['verified_vendor_procurement', 'business_expense', 'customer_refund'] as const;
  if (!['unlinked', 'unconfigured', 'mismatch', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean'
    || typeof result.accountVerified !== 'boolean'
    || result.transferEnabled !== false
    || !Array.isArray(allowedPurposes)
    || allowedPurposes.length !== expectedPurposes.length
    || expectedPurposes.some((purpose, index) => allowedPurposes[index] !== purpose)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (result.runtimeMode !== undefined && result.runtimeMode !== 'verify_only') {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (result.environment !== undefined && !['staging', 'production'].includes(String(result.environment))) {
    throw new CoreConnectionError('core_invalid_response');
  }
  let checks: CoreVendorBankSnapshot['checks'];
  if (result.checks !== undefined) {
    if (!result.checks || typeof result.checks !== 'object' || Array.isArray(result.checks)) {
      throw new CoreConnectionError('core_invalid_response');
    }
    const value = result.checks as Record<string, unknown>;
    if (['account', 'ordinaryDeposit', 'jpy'].some((field) => typeof value[field] !== 'boolean')) {
      throw new CoreConnectionError('core_invalid_response');
    }
    checks = value as CoreVendorBankSnapshot['checks'];
  }
  if (status === 'verified' && (!result.credentialVerified || !result.accountVerified)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreVendorBankSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    accountVerified: result.accountVerified,
    transferEnabled: false,
    ...(result.runtimeMode === 'verify_only' ? { runtimeMode: 'verify_only' as const } : {}),
    ...(['staging', 'production'].includes(String(result.environment))
      ? { environment: result.environment as 'staging' | 'production' } : {}),
    ...(checks ? { checks } : {}),
    allowedPurposes: [...expectedPurposes],
  };
}

function browserSnapshot(result: Record<string, unknown>): CoreBrowserSnapshot {
  const status = String(result.status || '');
  if (!['unlinked', 'unconfigured', 'verified'].includes(status)
    || typeof result.configured !== 'boolean'
    || typeof result.credentialVerified !== 'boolean'
    || typeof result.accountVerified !== 'boolean'
    || typeof result.activeSessionPresent !== 'boolean'
    || result.sessionExecutionEnabled !== false) {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (result.runtimeMode !== undefined && result.runtimeMode !== 'verify_only') {
    throw new CoreConnectionError('core_invalid_response');
  }
  if (status === 'verified' && (!result.credentialVerified || !result.accountVerified)) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: status as CoreBrowserSnapshot['status'],
    configured: result.configured,
    credentialVerified: result.credentialVerified,
    accountVerified: result.accountVerified,
    activeSessionPresent: result.activeSessionPresent,
    sessionExecutionEnabled: false,
    ...(result.runtimeMode === 'verify_only' ? { runtimeMode: 'verify_only' as const } : {}),
  };
}

function routeSnapshot(result: Record<string, unknown>): CoreRouteSnapshot {
  if (result.status !== 'computed' || typeof result.cached !== 'boolean'
    || !Number.isSafeInteger(result.durationSeconds) || Number(result.durationSeconds) < 0
    || !Number.isSafeInteger(result.distanceMeters) || Number(result.distanceMeters) < 0) {
    throw new CoreConnectionError('core_invalid_response');
  }
  return {
    status: 'computed',
    cached: result.cached,
    durationSeconds: Number(result.durationSeconds),
    distanceMeters: Number(result.distanceMeters),
  };
}

export function publicCoreConnection(
  value: CoreConnectionSnapshot,
): Omit<CoreConnectionSnapshot, 'accountRef'> {
  const publicValue = { ...value };
  delete publicValue.accountRef;
  return publicValue;
}

export async function readCoreConnection(subject: string): Promise<CoreConnectionSnapshot> {
  return snapshot(await coreRequest('/api/v1/hub/link-status', 'POST', { subject }));
}

export async function safeReadCoreConnection(subject: string): Promise<CoreConnectionSnapshot> {
  try {
    return publicCoreConnection(await readCoreConnection(subject));
  } catch {
    return { status: 'unavailable', botUsername: 'Rockstar_ibot' };
  }
}

export async function readCoreTiming(subject: string): Promise<CoreTimingSnapshot> {
  return timingSnapshot(await coreRequest('/api/v1/hub/timing-status', 'POST', { subject }));
}

export async function syncCoreCalendar(subject: string): Promise<CoreTimingSnapshot> {
  return timingSnapshot(await coreRequest('/api/v1/hub/calendar/sync', 'POST', { subject }));
}

export async function createCoreMailConnection(
  subject: string,
  requestId: string,
): Promise<CoreMailConnectionSnapshot> {
  return mailSnapshot(await coreRequest('/api/v1/hub/mail/connect', 'POST', { subject, requestId }));
}

export async function readCoreMail(subject: string): Promise<CoreMailSnapshot> {
  return mailStatusSnapshot(await coreRequest('/api/v1/hub/mail/status', 'POST', { subject }));
}

export async function safeReadCoreMail(subject: string): Promise<CoreMailSnapshot> {
  try {
    return await readCoreMail(subject);
  } catch {
    return { status: 'unavailable', configured: false };
  }
}

export async function readCoreMailRail(subject: string): Promise<CoreMailRailSnapshot> {
  return mailRailSnapshot(await coreRequest('/api/v1/hub/mail-delivery/status', 'POST', { subject }));
}

export async function safeReadCoreMailRail(subject: string): Promise<CoreMailRailSnapshot> {
  try {
    return await readCoreMailRail(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      credentialVerified: false,
      inboundReady: false,
    };
  }
}

export async function sendCoreMail(
  subject: string,
  requestId: string,
  message: CoreMailSendRequest,
): Promise<CoreMailSendSnapshot> {
  return mailSendSnapshot(await coreRequest('/api/v1/hub/mail-delivery/send', 'POST', {
    subject,
    requestId,
    confirmedExternalSend: true,
    ...message,
  }));
}

export async function readCoreBilling(subject: string): Promise<CoreBillingSnapshot> {
  return billingSnapshot(await coreRequest('/api/v1/hub/billing/status', 'POST', { subject }));
}

export async function safeReadCoreBilling(subject: string): Promise<CoreBillingSnapshot> {
  try {
    return await readCoreBilling(subject);
  } catch {
    return { status: 'unavailable', configured: false, paid: false };
  }
}

export async function createCoreBillingCheckout(
  subject: string,
  requestId: string,
): Promise<CoreBillingCheckoutSnapshot> {
  return billingCheckoutSnapshot(await coreRequest('/api/v1/hub/billing/checkout', 'POST', { subject, requestId }));
}

export async function readCoreVoice(subject: string): Promise<CoreVoiceSnapshot> {
  return voiceSnapshot(await coreRequest('/api/v1/hub/voice/status', 'POST', { subject }));
}

export async function safeReadCoreVoice(subject: string): Promise<CoreVoiceSnapshot> {
  try {
    return await readCoreVoice(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      inboundVerified: false,
      outboundEnabled: false,
    };
  }
}

export async function readCoreAi(subject: string): Promise<CoreAiSnapshot> {
  return aiSnapshot(await coreRequest('/api/v1/hub/ai/status', 'POST', { subject }));
}

export async function safeReadCoreAi(subject: string): Promise<CoreAiSnapshot> {
  try {
    return await readCoreAi(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      credentialVerified: false,
      generationEnabled: false,
    };
  }
}

export async function readCoreMaps(subject: string): Promise<CoreMapsSnapshot> {
  return mapsSnapshot(await coreRequest('/api/v1/hub/maps/status', 'POST', { subject }));
}

export async function safeReadCoreMaps(subject: string): Promise<CoreMapsSnapshot> {
  try {
    return await readCoreMaps(subject);
  } catch {
    return { status: 'unavailable', configured: false, credentialVerified: false };
  }
}

export async function readCoreSocial(subject: string): Promise<CoreSocialSnapshot> {
  return socialSnapshot(await coreRequest('/api/v1/hub/social/status', 'POST', { subject }));
}

export async function safeReadCoreSocial(subject: string): Promise<CoreSocialSnapshot> {
  try {
    return await readCoreSocial(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      credentialVerified: false,
      integrationsVerified: false,
      publishingEnabled: false,
      integrations: [],
    };
  }
}

export async function readCoreVendorBank(subject: string): Promise<CoreVendorBankSnapshot> {
  return vendorBankSnapshot(await coreRequest('/api/v1/hub/vendor-bank/status', 'POST', { subject }));
}

export async function safeReadCoreVendorBank(subject: string): Promise<CoreVendorBankSnapshot> {
  try {
    return await readCoreVendorBank(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      credentialVerified: false,
      accountVerified: false,
      transferEnabled: false,
      allowedPurposes: ['verified_vendor_procurement', 'business_expense', 'customer_refund'],
    };
  }
}

export async function readCoreBrowser(subject: string): Promise<CoreBrowserSnapshot> {
  return browserSnapshot(await coreRequest('/api/v1/hub/browser/status', 'POST', { subject }));
}

export async function safeReadCoreBrowser(subject: string): Promise<CoreBrowserSnapshot> {
  try {
    return await readCoreBrowser(subject);
  } catch {
    return {
      status: 'unavailable',
      configured: false,
      credentialVerified: false,
      accountVerified: false,
      activeSessionPresent: false,
      sessionExecutionEnabled: false,
    };
  }
}

export async function computeCoreRoute(
  subject: string,
  requestId: string,
  route: CoreRouteRequest,
): Promise<CoreRouteSnapshot> {
  return routeSnapshot(await coreRequest('/api/v1/hub/maps/route', 'POST', { subject, requestId, ...route }));
}

export async function safeReadCoreTiming(subject: string): Promise<CoreTimingSnapshot> {
  try {
    return await readCoreTiming(subject);
  } catch (error) {
    return {
      status: error instanceof CoreConnectionError && error.code === 'identity_not_linked'
        ? 'unlinked'
        : 'unavailable',
      calendar: {
        provider: 'none',
        configured: false,
        status: 'unconfigured',
        busyIntervalCount: 0,
      },
      notifications: {
        ready: false,
        notificationsEnabled: false,
        dailyAutomationEnabled: false,
        pendingCount: 0,
        deliveredCount: 0,
      },
      commandLedger: { ready: false },
    };
  }
}

export async function createCoreLinkChallenge(
  subject: string,
  requestId: string,
): Promise<CoreConnectionSnapshot> {
  return snapshot(await coreRequest('/api/v1/hub/link-challenges', 'POST', { subject, requestId }));
}

export async function patchCorePreferences(
  subject: string,
  preferences: Record<string, unknown>,
): Promise<CoreConnectionSnapshot> {
  return snapshot(await coreRequest('/api/v1/hub/preferences', 'PATCH', { subject, preferences }));
}

export type ToolStatus = 'runnable_local' | 'sign_in_required' | 'connection_required' | 'catalog_only';
export type ToolSurface = 'web' | 'desktop' | 'os' | 'telegram';
export interface ToolManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly origin: 'builtin' | 'external';
  /** Version of this inventory contract, not an upstream provider version. */
  readonly version: string;
  readonly status: ToolStatus;
  readonly sourcePaths: readonly string[];
  readonly permissions: readonly string[];
  readonly costModel: {
    readonly mode: 'included_local' | 'provider_usage' | 'not_connected';
    readonly description: string;
  };
  /** Target entry surfaces; availability is determined separately by status. */
  readonly surfaces: readonly ToolSurface[];
  readonly requirements: readonly string[];
  readonly nextAction: string;
}
export interface CoconalaDraftInput {
  title?: string;
  requirements?: string | string[];
  deliverables?: string | string[];
  deadline?: string;
  /** Plain user-provided quote; numeric prices do not imply a currency. */
  price?: string | number;
}
export interface CoconalaDraft {
  proposal: string;
  checklist: string[];
  warnings: string[];
}
export type Timestamp = string | number;
export interface SubscriptionState {
  planId?: string;
  status?: string;
  verifiedAt?: Timestamp;
  currentPeriodEnd?: Timestamp;
  revoked?: boolean;
  revokedAt?: Timestamp | null;
  cancelAtPeriodEnd?: boolean;
}
export type SubscriptionAccessReason =
  | 'active'
  | 'unknown'
  | 'invalid_time'
  | 'wrong_plan'
  | 'revoked'
  | 'inactive'
  | 'unverified'
  | 'stale'
  | 'expired';
export const servicePlan: Readonly<{
  id: 'mr-electricity-monthly-v1';
  amountMinor: 888;
  currency: 'USD';
  interval: 'month';
  revenueShareBps: 0;
  billingLive: false;
}>;
export const tools: readonly ToolManifest[];
/** Throws TypeError for unknown fields, invalid field types or excessive input. */
export function buildCoconalaDraft(input?: CoconalaDraftInput): CoconalaDraft;
/** Pure policy over trusted server state; does not authenticate state or collect payment. */
export function subscriptionAccess(
  state: SubscriptionState | null | undefined,
  now?: Timestamp | Date,
): { allowed: boolean; reason: SubscriptionAccessReason };

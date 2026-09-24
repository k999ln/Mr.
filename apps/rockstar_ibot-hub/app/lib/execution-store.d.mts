import type { ExecutionDeviceState, ExecutionJob, ExecutionResult } from './execution-contract.mjs';
export class ExecutionError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export type WorkerActor = { owner: string; generation: number; hash: string };
export function tokenHash(token: string): Promise<string>;
export function createExecutionStore(db: D1Database, now?: () => number): {
 device(owner: string): Promise<ExecutionDeviceState>;
 pair(owner: string,generation: number): Promise<{token: string;protocol: string}>;
 revoke(owner: string,generation: number): Promise<void>;
 authenticate(token: string): Promise<WorkerActor>;
 heartbeat(actor: WorkerActor,verified: boolean,protocol: string): Promise<{ok: boolean}>;
 enqueue(owner: string,generation: number,runId: string,attachment?: string|null): Promise<void>;
 claim(actor: WorkerActor): Promise<ExecutionJob|null>;
 complete(actor: WorkerActor,input: unknown): Promise<{ok:boolean}>;
 list(owner: string): Promise<{id: string;result: ExecutionResult|null;errorCode: string|null;finishedAt: string|null}[]>;
 cancel(owner: string,generation: number,id: string): Promise<void>;
 assertFence(owner: string,generation: number): Promise<void>;
};

import { EXECUTION_PROTOCOL, LEASE_MS, deviceReady, validateExecutionResult } from './execution-contract.mjs';

export class ExecutionError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
const encoder = new TextEncoder();
export async function tokenHash(token) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const newToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const fenced = 'NOT EXISTS (SELECT 1 FROM owner_data_locks WHERE owner_id = ?) AND EXISTS (SELECT 1 FROM owner_write_fences WHERE owner_id = ? AND generation = ?)';

export function createExecutionStore(db, now = Date.now) {
  const stamp = () => new Date(now()).toISOString();
  const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
  async function assertFence(owner, generation) {
    const row = await stmt(`SELECT 1 AS ok WHERE ${fenced}`, owner, owner, generation).first();
    if (!row) throw new ExecutionError('data_locked', 423);
  }
  async function device(owner) {
    const row = await stmt(`SELECT protocol, verified, heartbeat_at FROM execution_devices d WHERE owner_id = ? AND ${fenced} AND d.write_generation = (SELECT generation FROM owner_write_fences WHERE owner_id = ?)`, owner, owner, owner, await generationFor(owner), owner).first();
    return { paired: Boolean(row), ready: deviceReady(row ? { protocol: row.protocol, verified: row.verified === 1, heartbeatAt: row.heartbeat_at } : null, now()), lastSeenAt: row?.heartbeat_at ? new Date(row.heartbeat_at).toISOString() : null };
  }
  async function generationFor(owner) { return (await stmt('SELECT generation FROM owner_write_fences WHERE owner_id = ?', owner).first())?.generation ?? -1; }
  async function stopRuns(owner, generation, code) {
    await db.batch([
      stmt(`UPDATE service_runs SET status = 'failed', updated_at = ? WHERE owner_id = ? AND status IN ('queued','running') AND id IN (SELECT run_id FROM service_executions WHERE owner_id = ?) AND ${fenced}`, stamp(), owner, owner, owner, owner, generation),
      stmt(`UPDATE service_executions SET error_code = ?, finished_at = ?, claim_token = NULL WHERE owner_id = ? AND result_json IS NULL AND ${fenced}`, code, stamp(), owner, owner, owner, generation),
    ]);
  }
  async function pair(owner, generation) {
    await assertFence(owner, generation);
    const token = newToken(); const hash = await tokenHash(token);
    // Rotate first. Old workers cannot commit even if they finish during cancellation.
    await stmt(`INSERT INTO execution_devices (owner_id,token_hash,write_generation,protocol,verified,heartbeat_at,created_at) SELECT ?,?,?,?,0,0,? WHERE ${fenced}
      ON CONFLICT(owner_id) DO UPDATE SET token_hash=excluded.token_hash,write_generation=excluded.write_generation,protocol=excluded.protocol,verified=0,heartbeat_at=0,created_at=excluded.created_at`, owner,hash,generation,EXECUTION_PROTOCOL,stamp(),owner,owner,generation).run();
    await assertFence(owner, generation);
    await stopRuns(owner, generation, 'device_replaced');
    return { token, protocol: EXECUTION_PROTOCOL };
  }
  async function revoke(owner, generation) {
    await stmt(`DELETE FROM execution_devices WHERE owner_id = ? AND ${fenced}`, owner, owner, owner, generation).run();
    await assertFence(owner, generation);
    await stopRuns(owner, generation, 'device_disconnected');
  }
  async function authenticate(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ExecutionError('unauthorized', 401);
    const hash = await tokenHash(token);
    const row = await stmt(`SELECT owner_id,write_generation,token_hash FROM execution_devices WHERE token_hash = ?`, hash).first();
    if (!row) throw new ExecutionError('unauthorized', 401);
    await assertFence(row.owner_id, row.write_generation);
    return { owner: row.owner_id, generation: row.write_generation, hash };
  }
  const activeDevice = 'EXISTS (SELECT 1 FROM execution_devices WHERE owner_id = ? AND token_hash = ? AND write_generation = ?)';
  async function heartbeat(actor, verified, protocol) {
    if (typeof verified !== 'boolean' || protocol !== EXECUTION_PROTOCOL) throw new ExecutionError('protocol_mismatch', 400);
    await stmt(`UPDATE execution_devices SET heartbeat_at = ?,verified = ?,protocol = ? WHERE owner_id = ? AND token_hash = ? AND ${fenced}`, now(),verified?1:0,protocol,actor.owner,actor.hash,actor.owner,actor.owner,actor.generation).run();
    return { ok: true };
  }
  async function expire(owner) {
    const expired = `SELECT e.run_id FROM service_executions e JOIN service_runs r ON r.id=e.run_id WHERE e.owner_id = ? AND e.finished_at IS NULL AND (r.status='running' AND e.lease_until < ? OR r.status='queued' AND r.created_at < ?)`;
    const before = new Date(now()-15*60_000).toISOString();
    await db.batch([
      stmt(`UPDATE service_executions SET error_code='execution_timeout',finished_at=? WHERE run_id IN (${expired})`,stamp(),owner,now(),before),
      stmt(`UPDATE service_runs SET status='failed',updated_at=? WHERE owner_id=? AND status IN ('queued','running') AND id IN (SELECT run_id FROM service_executions WHERE owner_id=? AND error_code='execution_timeout')`,stamp(),owner,owner),
    ]);
  }
  async function enqueue(owner, generation, runId, attachment = null) {
    await assertFence(owner,generation);
    const prior = await stmt('SELECT run_id FROM service_executions WHERE run_id=? AND owner_id=?',runId,owner).first();
    if (prior) return;
    if (!(await device(owner)).ready) throw new ExecutionError('executor_offline',503);
    const hour = new Date(now()-3_600_000).toISOString();
    const inserted = await stmt(`INSERT OR IGNORE INTO service_executions (run_id,owner_id,write_generation,attachment_text,lease_until)
      SELECT r.id,r.owner_id,?,?,0 FROM service_runs r WHERE r.id=? AND r.owner_id=? AND r.status='queued' AND ${fenced}
      AND (SELECT COUNT(*) FROM service_executions e JOIN service_runs sr ON sr.id=e.run_id WHERE e.owner_id=? AND sr.created_at>=?) < 10
      AND (SELECT COUNT(*) FROM service_executions e JOIN service_runs sr ON sr.id=e.run_id WHERE e.owner_id=? AND sr.status IN ('queued','running')) < 3
      RETURNING run_id`,generation,attachment,runId,owner,owner,owner,generation,owner,hour,owner).first();
    if (!inserted) {
      if (await stmt('SELECT run_id FROM service_executions WHERE run_id=? AND owner_id=?',runId,owner).first()) return;
      throw new ExecutionError('execution_limit',429);
    }
  }
  async function claim(actor) {
    await expire(actor.owner);
    if (!(await device(actor.owner)).ready) throw new ExecutionError('executor_offline',503);
    const token = newToken();
    const row = await stmt(`UPDATE service_executions SET claim_token=?,lease_until=? WHERE run_id=(
      SELECT e.run_id FROM service_executions e JOIN service_runs r ON r.id=e.run_id WHERE e.owner_id=? AND e.write_generation=? AND r.status='queued' AND e.claim_token IS NULL AND e.error_code IS NULL ORDER BY r.created_at LIMIT 1
      ) AND claim_token IS NULL AND ${fenced} AND ${activeDevice} RETURNING run_id,attachment_text`,token,now()+LEASE_MS,actor.owner,actor.generation,actor.owner,actor.owner,actor.generation,actor.owner,actor.hash,actor.generation).first();
    if (!row) return null;
    const run = await stmt(`UPDATE service_runs SET status='running',updated_at=? WHERE id=? AND owner_id=? AND status='queued' AND ${fenced} AND ${activeDevice} RETURNING id,slot_id,cell_id,input_summary`,stamp(),row.run_id,actor.owner,actor.owner,actor.owner,actor.generation,actor.owner,actor.hash,actor.generation).first();
    if (!run) return null;
    return { id:run.id,claimToken:token,slotId:run.slot_id,cellId:run.cell_id,summary:run.input_summary,attachment:row.attachment_text };
  }
  async function complete(actor, input) {
    if (!/^[a-f0-9]{64}$/.test(input?.id||'') || !/^[a-f0-9]{64}$/.test(input?.claimToken||'') || !['completed','failed'].includes(input?.status)) throw new ExecutionError('invalid_result',400);
    let result = null;
    if (input.status==='completed') {
      try { result=JSON.stringify(validateExecutionResult(input.result)); } catch { throw new ExecutionError('invalid_result',400); }
    }
    const safeErrors = ['model_unavailable','model_timeout','invalid_result','execution_failed'];
    const error = input.status==='failed' ? (safeErrors.includes(input.errorCode)?input.errorCode:'execution_failed') : null;
    const prior = await stmt('SELECT result_json,error_code,finished_at,claim_token FROM service_executions WHERE run_id=? AND owner_id=?',input.id,actor.owner).first();
    if (prior?.finished_at && prior.claim_token === input.claimToken && prior.result_json === result && prior.error_code === error) return {ok:true};
    const row = await stmt(`UPDATE service_executions SET result_json=?,error_code=?,finished_at=? WHERE run_id=? AND owner_id=? AND claim_token=? AND lease_until>=? AND finished_at IS NULL AND ${fenced} AND ${activeDevice}
      AND EXISTS(SELECT 1 FROM service_runs WHERE id=? AND owner_id=? AND status='running') RETURNING run_id`,result,error,stamp(),input.id,actor.owner,input.claimToken,now(),actor.owner,actor.owner,actor.generation,actor.owner,actor.hash,actor.generation,input.id,actor.owner).first();
    if (!row) throw new ExecutionError('claim_lost',409);
    await settle(actor.owner);
    return {ok:true};
  }
  async function settle(owner) {
    // Retry-safe read repair: a crash after storing the result cannot lose it.
    await db.batch([
      stmt(`UPDATE service_runs SET status=CASE WHEN (SELECT result_json FROM service_executions WHERE run_id=service_runs.id) IS NOT NULL THEN 'completed' ELSE 'failed' END,updated_at=(SELECT finished_at FROM service_executions WHERE run_id=service_runs.id)
        WHERE owner_id=? AND status='running' AND id IN(SELECT run_id FROM service_executions WHERE owner_id=? AND finished_at IS NOT NULL)`,owner,owner),
      stmt(`UPDATE integration_outbox SET status='processed',updated_at=? WHERE owner_id=? AND topic='service.run_requested' AND status='pending' AND json_extract(payload,'$.runId') IN(SELECT run_id FROM service_executions WHERE owner_id=? AND finished_at IS NOT NULL)`,stamp(),owner,owner),
    ]);
  }
  async function list(owner) {
    await settle(owner); await expire(owner);
    const rows = await stmt(`SELECT e.run_id,e.result_json,e.error_code,e.finished_at FROM service_executions e JOIN service_runs r ON r.id=e.run_id WHERE e.owner_id=? ORDER BY r.created_at DESC LIMIT 12`,owner).all();
    return rows.results.map(row=>({id:row.run_id,result:row.result_json?validateExecutionResult(JSON.parse(row.result_json)):null,errorCode:row.error_code,finishedAt:row.finished_at}));
  }
  async function cancel(owner,generation,id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new ExecutionError('invalid_request',400);
    await db.batch([
      stmt(`UPDATE service_runs SET status='cancelled',updated_at=? WHERE id=? AND owner_id=? AND status IN('queued','running') AND ${fenced}`,stamp(),id,owner,owner,owner,generation),
      stmt(`UPDATE service_executions SET claim_token=NULL,error_code='cancelled',finished_at=? WHERE run_id=? AND owner_id=? AND ${fenced} AND EXISTS(SELECT 1 FROM service_runs WHERE id=? AND owner_id=? AND status='cancelled')`,stamp(),id,owner,owner,owner,generation,id,owner),
    ]);
    await assertFence(owner,generation); await settle(owner);
  }
  return {device,pair,revoke,authenticate,heartbeat,enqueue,claim,complete,list,cancel,assertFence};
}

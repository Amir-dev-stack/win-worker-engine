import { CONTINUOUS_LEARNING_JOB_DEFINITIONS } from "./win-continuous-learning-supervisor.mjs";

// Draft adapter. Driver MUST provide truly atomic CAS:
// read(key) => null | {value,version}; create(key,value) => boolean;
// replace(key,version,value) => boolean. No provider is wired or called here.
const known = new Set(CONTINUOUS_LEARNING_JOB_DEFINITIONS.map(j => j.id));
const prefix = "win/continuous-learning/v1/checkpoints/";
const time = ms => new Date(ms).toISOString();
function keyFor(id) {
  if (!known.has(id)) throw new Error("unknown_job");
  return prefix + id;
}
function validate(s, id) {
  if (!s || s.schema !== "win-cl-checkpoint-v1" || s.jobId !== id ||
      !Number.isSafeInteger(s.attempts) || s.attempts < 0 ||
      !Number.isSafeInteger(s.generation) || s.generation < 0 ||
      (s.lastCompletedAt !== null && !Number.isFinite(Date.parse(s.lastCompletedAt))) ||
      (s.leaseExpiresAt !== null && !Number.isFinite(Date.parse(s.leaseExpiresAt))) ||
      (s.leaseId === null) !== (s.leaseExpiresAt === null)) throw new Error("corrupt_checkpoint");
  return s;
}
export function createContinuousCheckpointAdapter(driver, {maxRetries=5}={}) {
  if (!driver || !["read","create","replace"].every(k => typeof driver[k] === "function"))
    throw new Error("atomic_driver_required");
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 20)
    throw new Error("invalid_retry_limit");
  async function load(id) {
    const record = await driver.read(keyFor(id));
    if (!record) return null;
    if (!record.version) throw new Error("invalid_driver_record");
    return {checkpoint: validate(record.value,id), version:record.version};
  }
  async function initialize(id) {
    keyFor(id);
    const existing = await load(id);
    if (existing) return {created:false,checkpoint:existing.checkpoint};
    const fresh = {schema:"win-cl-checkpoint-v1",jobId:id,lastCompletedAt:null,
      leaseId:null,leaseExpiresAt:null,attempts:0,generation:0};
    const created = await driver.create(keyFor(id),fresh);
    if (typeof created !== "boolean") throw new Error("non_atomic_create_result");
    if (created) return {created:true,checkpoint:fresh};
    const raced = await load(id);
    if (!raced) throw new Error("create_race_unresolved");
    return {created:false,checkpoint:raced.checkpoint};
  }
  async function claim(id,leaseId,nowMs,ttlMs,minSpacingMs) {
    keyFor(id);
    if (typeof leaseId !== "string" || !/^[a-zA-Z0-9_-]{12,120}$/.test(leaseId))
      throw new Error("invalid_lease_id");
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
        !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000 ||
        !Number.isSafeInteger(minSpacingMs) || minSpacingMs < 0)
      throw new Error("invalid_claim_clock");
    for (let i=0;i<maxRetries;i++) {
      const r = await load(id);
      if (!r) return {status:"not_initialized"};
      const s = r.checkpoint;
      if (s.attempts >= 3) return {status:"blocked_retry_limit"};
      if (s.leaseExpiresAt !== null && Date.parse(s.leaseExpiresAt) > nowMs)
        return {status:"leased"};
      if (s.lastCompletedAt !== null && Date.parse(s.lastCompletedAt)+minSpacingMs > nowMs)
        return {status:"not_due"};
      const next = {...s,leaseId,leaseExpiresAt:time(nowMs+ttlMs),
        attempts:s.attempts+1,generation:s.generation+1};
      const wrote = await driver.replace(keyFor(id),r.version,next);
      if (typeof wrote !== "boolean") throw new Error("non_atomic_replace_result");
      if (wrote) return {status:"claimed",checkpoint:next};
    }
    return {status:"contention"};
  }
  async function complete(id,leaseId,generation,nowMs) {
    keyFor(id);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
        typeof leaseId !== "string" || !Number.isSafeInteger(generation))
      throw new Error("invalid_completion");
    for (let i=0;i<maxRetries;i++) {
      const r = await load(id);
      if (!r) return {status:"not_initialized"};
      const s = r.checkpoint;
      if (s.leaseId !== leaseId || s.generation !== generation ||
          s.leaseExpiresAt === null || Date.parse(s.leaseExpiresAt) <= nowMs)
        return {status:"stale_or_expired_lease"};
      if (s.lastCompletedAt !== null && Date.parse(s.lastCompletedAt) > nowMs)
        return {status:"clock_regression"};
      const next = {...s,leaseId:null,leaseExpiresAt:null,lastCompletedAt:time(nowMs),attempts:0};
      const wrote = await driver.replace(keyFor(id),r.version,next);
      if (typeof wrote !== "boolean") throw new Error("non_atomic_replace_result");
      if (wrote) return {status:"completed",checkpoint:next};
    }
    return {status:"contention"};
  }
  return {load,initialize,claim,complete};
}

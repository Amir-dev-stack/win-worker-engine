/**
 * WIN continuous-learning supervisor V1.
 * Pure schedule planner: NO execution, DB writes, model invocation or network.
 * External trusted executor MUST reserve an atomic lease and authorize the job.
 *
 * Repeated invocations are expected: cloud cron wakes frequently; persisted
 * completedAt/leaseExpiresAt are the authoritative state. Never treat GitHub
 * issue comments as heartbeats or an execution lock.
 */
const JOBS = Object.freeze([
  { id: "odds-ingestion", intervalMinutes: 5, kind: "collect", paidCallsAllowed: false },
  { id: "results-reconciliation", intervalMinutes: 15, kind: "validate", paidCallsAllowed: false },
  { id: "walk-forward-evaluation", intervalMinutes: 60, kind: "evaluate", paidCallsAllowed: false },
  { id: "research-memory-integrity", intervalMinutes: 60, kind: "memory_check", paidCallsAllowed: false },
  { id: "recovery-checkpoint", intervalMinutes: 15, kind: "checkpoint", paidCallsAllowed: false }
]);
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_WORK_ITEMS = 5;

function parseIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() ===
    (value.includes(".") ? new Date(time).toISOString() : value.replace("Z", ".000Z"))
    ? time : null;
}
function hold(reason, extra = {}) {
  return { schema: "WIN_CONTINUOUS_SUPERVISOR_V1", status: "hold", reason,
    jobs: [], productionWrites: false, paidCalls: false, ...extra };
}
export function planContinuousLearningTick(input, nowMs = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !Number.isSafeInteger(nowMs) || nowMs < 0)
    return hold("invalid_input");
  if (input.enabled !== true || input.ownerApproved !== true ||
      input.allowPaidCalls !== false || input.allowProductionWrites !== false)
    return hold("explicit_safe_activation_required");
  if (input.leaseBackendReady !== true || input.memoryBackendReady !== true ||
      input.authenticatedSupervisor !== true || input.freeQuotaVerified !== true ||
      input.atomicLeaseGuaranteed !== true || input.backupCheckpointReady !== true)
    return hold("trusted_cloud_prerequisites_missing");
  const rows = input.state;
  if (!rows || typeof rows !== "object" || Array.isArray(rows) ||
      Object.keys(rows).some(k => !JOBS.some(j => j.id === k))) return hold("invalid_job_state");
  const selected = [];
  for (const job of JOBS) {
    const state = rows[job.id];
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        !Number.isSafeInteger(state.attempts) || state.attempts < 0) {
      return hold("missing_or_invalid_job_checkpoint");
    }
    const last = state.lastCompletedAt === null ? null : parseIso(state.lastCompletedAt);
    if (state.lastCompletedAt !== null && last === null) return hold("invalid_job_checkpoint");
    const lease = state.leaseExpiresAt === null ? null : parseIso(state.leaseExpiresAt);
    if (state.leaseExpiresAt !== null && lease === null) return hold("invalid_lease");
    if (last !== null && last > nowMs + MAX_CLOCK_SKEW_MS) return hold("checkpoint_in_future");
    if (lease !== null && lease > nowMs) continue; // never overlap an existing lease
    const due = last === null || nowMs - last >= job.intervalMinutes * 60 * 1000;
    if (!due) continue;
    if (state.attempts >= 3) continue; // dead-letter for owner-visible review, no infinite retry
    selected.push({
      id: job.id, kind: job.kind, dueAt: last === null
        ? "uninitialized" : new Date(last + job.intervalMinutes * 60 * 1000).toISOString(),
      requiresAtomicLease: true,
      requiresApprovedSource: true,
      paidCallsAllowed: false,
      productionWriteAllowed: false,
      memoryDisposition: "append_only_validated",
      autoPromoteModel: false
    });
  }
  return {
    schema: "WIN_CONTINUOUS_SUPERVISOR_V1",
    status: "plan_only",
    jobs: selected.slice(0, MAX_WORK_ITEMS),
    maxJobCount: MAX_WORK_ITEMS,
    productionWrites: false,
    paidCalls: false,
    alert: selected.length === 0 ? "No eligible jobs or retries blocked; inspect backlog/attempt counters" : null,
    note: "A trusted executor must atomically claim each job, enforce quotas and verify the source before work starts."
  };
}
export const CONTINUOUS_LEARNING_JOB_DEFINITIONS = JOBS;

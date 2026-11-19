/**
 * WIN durable development lease SQL (draft, no DB connection or side effects).
 * Database-enforced compare-and-swap (CAS) statements. External trusted
 * coordinator MUST authenticate actor identity, verify the source GitHub SHA,
 * and ensure the database role cannot mutate arbitrary rows.
 *
 * Never infer successful external GitHub writes merely from holding a DB lease:
 * a GitHub branch update also needs an exact expected-head compare-and-swap.
 * On expired/uncertain work, quarantine rather than automatically replay.
 */
const ACTOR = /^[A-Za-z0-9._:-]{1,120}$/;
const TASK = /^[A-Za-z0-9._-]{1,120}$/;
const SHA = /^[0-9a-f]{40}$/;
function assertId(value, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) throw Error("INVALID_LEASE_PARAMETER");
  return value;
}
function leaseClaimArgs(taskId, actorId, ttlSeconds) {
  assertId(taskId, TASK); assertId(actorId, ACTOR);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 900)
    throw Error("INVALID_LEASE_PARAMETER");
  return [taskId, actorId, ttlSeconds];
}
function guardArgs(taskId, actorId, fence) {
  assertId(taskId, TASK); assertId(actorId, ACTOR);
  if (!Number.isSafeInteger(fence) || fence < 1) throw Error("INVALID_LEASE_PARAMETER");
  return [taskId, actorId, fence];
}

export const LEASE_SQL = Object.freeze({
  // One database UPDATE atomically claims a QUEUED, preapproved task.
  // Never automatically reclaim an expired RUNNING task: external work might
  // have completed after the last checkpoint.
  claim: `
UPDATE win_dev_lease_tasks
SET status = 'running', owner_id = $2, fence = fence + 1,
    expires_at = clock_timestamp() + ($3::integer * interval '1 second'),
    revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND approved = true
  AND status = 'queued' AND owner_id IS NULL
  AND fence < 9007199254740991
  AND $3::integer BETWEEN 5 AND 900
RETURNING task_id, source_commit_sha, task_type, fence, expires_at, checkpoint_commit_sha
`.trim(),
  renew: `
UPDATE win_dev_lease_tasks
SET expires_at = clock_timestamp() + ($4::integer * interval '1 second'),
    revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
  AND approved = true
  AND status = 'running' AND expires_at > clock_timestamp()
  AND $4::integer BETWEEN 5 AND 900
RETURNING task_id, fence, expires_at
`.trim(),
  checkpoint: `
UPDATE win_dev_lease_tasks
SET checkpoint_commit_sha = $4, revision = revision + 1,
    updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
  AND approved = true
  AND status = 'running' AND expires_at > clock_timestamp()
  AND $4 ~ '^[0-9a-f]{40}$'
RETURNING task_id, fence, checkpoint_commit_sha
`.trim(),
  complete: `
UPDATE win_dev_lease_tasks
SET status = 'completed', owner_id = NULL, expires_at = NULL,
    revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
  AND approved = true
  AND status = 'running' AND expires_at > clock_timestamp()
RETURNING task_id, fence, status
`.trim(),
  // Expiration is NOT permission to replay a coding task or dispatch a paid
  // request. Quarantine and fence out stale actors until trusted reconciliation.
  quarantineExpired: `
UPDATE win_dev_lease_tasks
SET status = 'blocked_uncertain', owner_id = NULL, expires_at = NULL,
    fence = fence + 1, revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND status = 'running'
  AND fence < 9007199254740991
  AND expires_at <= clock_timestamp()
RETURNING task_id, fence, status
`.trim()
});

function singleRow(result) {
  if (!result || !Array.isArray(result.rows) || !Number.isInteger(result.rowCount)
    || result.rowCount !== result.rows.length || result.rowCount > 1)
    throw Error("INVALID_DATABASE_RESULT");
  return result.rowCount === 1 ? result.rows[0] : null;
}

// Database clients commonly return BIGINT as decimal strings. Reject unsafe
// precision and malformed fields rather than claiming a lease from any 1-row
// response. The trusted host must still bind authenticated actor identity.
function validFence(value) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const text = String(value);
  if (!/^[1-9][0-9]*$/.test(text)) return false;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0;
}
function validExpiry(value) {
  const time = value instanceof Date ? value.getTime() :
    typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0;
}
function checkResult(operation, row, expected) {
  if (row === null) return null; // Zero affected rows: no lease or lost CAS.
  const isObject = row && typeof row === "object" && !Array.isArray(row);
  const sameTask = isObject && row.task_id === expected.taskId;
  const fenceOk = sameTask && validFence(row.fence) &&
    (operation === "claim" || operation === "quarantineExpired" ||
       Number(row.fence) === expected.fence);
  const shapeOk = operation === "claim"
    ? SHA.test(row?.source_commit_sha) &&
      ["read_only_review", "draft_only_development"].includes(row?.task_type) &&
      validExpiry(row?.expires_at) &&
      (row?.checkpoint_commit_sha == null || SHA.test(row.checkpoint_commit_sha))
    : operation === "renew"
      ? validExpiry(row?.expires_at)
      : operation === "checkpoint"
        ? row?.checkpoint_commit_sha === expected.commitSha
        : row?.status === (operation === "complete" ? "completed" : "blocked_uncertain");
  if (!sameTask || !fenceOk || !shapeOk) throw Error("INVALID_DATABASE_RESULT");
  return row;
}

export function createFencedLeaseStore(db) {
  if (!db || typeof db.query !== "function") throw Error("TRUSTED_DB_REQUIRED");
  return Object.freeze({
    async claim(taskId, actorId, ttlSeconds) {
      return checkResult("claim", singleRow(await db.query(LEASE_SQL.claim,
        leaseClaimArgs(taskId, actorId, ttlSeconds))), {taskId});
    },
    async renew(taskId, actorId, fence, ttlSeconds) {
      const args = guardArgs(taskId, actorId, fence);
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 900)
        throw Error("INVALID_LEASE_PARAMETER");
      return checkResult("renew", singleRow(await db.query(LEASE_SQL.renew,
        [...args, ttlSeconds])), {taskId, fence});
    },
    async checkpoint(taskId, actorId, fence, commitSha) {
      const args = guardArgs(taskId, actorId, fence);
      assertId(commitSha, SHA);
      return checkResult("checkpoint", singleRow(await db.query(LEASE_SQL.checkpoint,
        [...args, commitSha])), {taskId, fence, commitSha});
    },
    async complete(taskId, actorId, fence) {
      return checkResult("complete", singleRow(await db.query(LEASE_SQL.complete,
        guardArgs(taskId, actorId, fence))), {taskId, fence});
    },
    async quarantineExpired(taskId) {
      assertId(taskId, TASK);
      return checkResult("quarantineExpired", singleRow(await db.query(
        LEASE_SQL.quarantineExpired, [taskId])), {taskId});
    }
  });
}

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
  AND $3::integer BETWEEN 5 AND 900
RETURNING task_id, source_commit_sha, task_type, fence, expires_at, checkpoint_commit_sha
`.trim(),
  renew: `
UPDATE win_dev_lease_tasks
SET expires_at = clock_timestamp() + ($4::integer * interval '1 second'),
    revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
  AND status = 'running' AND expires_at > clock_timestamp()
  AND $4::integer BETWEEN 5 AND 900
RETURNING task_id, fence, expires_at
`.trim(),
  checkpoint: `
UPDATE win_dev_lease_tasks
SET checkpoint_commit_sha = $4, revision = revision + 1,
    updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
  AND status = 'running' AND expires_at > clock_timestamp()
  AND $4 ~ '^[0-9a-f]{40}$'
RETURNING task_id, fence, checkpoint_commit_sha
`.trim(),
  complete: `
UPDATE win_dev_lease_tasks
SET status = 'completed', owner_id = NULL, expires_at = NULL,
    revision = revision + 1, updated_at = clock_timestamp()
WHERE task_id = $1 AND owner_id = $2 AND fence = $3
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

export function createFencedLeaseStore(db) {
  if (!db || typeof db.query !== "function") throw Error("TRUSTED_DB_REQUIRED");
  return Object.freeze({
    async claim(taskId, actorId, ttlSeconds) {
      return singleRow(await db.query(LEASE_SQL.claim, leaseClaimArgs(taskId, actorId, ttlSeconds)));
    },
    async renew(taskId, actorId, fence, ttlSeconds) {
      const args = guardArgs(taskId, actorId, fence);
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 900)
        throw Error("INVALID_LEASE_PARAMETER");
      return singleRow(await db.query(LEASE_SQL.renew, [...args, ttlSeconds]));
    },
    async checkpoint(taskId, actorId, fence, commitSha) {
      const args = guardArgs(taskId, actorId, fence);
      assertId(commitSha, SHA);
      return singleRow(await db.query(LEASE_SQL.checkpoint, [...args, commitSha]));
    },
    async complete(taskId, actorId, fence) {
      return singleRow(await db.query(LEASE_SQL.complete, guardArgs(taskId, actorId, fence)));
    },
    async quarantineExpired(taskId) {
      assertId(taskId, TASK);
      return singleRow(await db.query(LEASE_SQL.quarantineExpired, [taskId]));
    }
  });
}

const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const SHA = /^[0-9a-f]{40}$/u;

function validId(value) { return typeof value === "string" && ID.test(value); }
function validSha(value) { return typeof value === "string" && SHA.test(value); }
function requireQuery(db) {
  if (!db || typeof db.query !== "function") throw Error("DURABLE_DB_REQUIRED");
}
function one(result) {
  if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1) {
    throw Error("INVALID_DURABLE_DB_RESULT");
  }
  return result.rows[0] || null;
}

export const QUEUE_SQL = Object.freeze({
  claim: `UPDATE win_dev_task_queue
    SET status='running', owner_id=$2, fence=fence+1,
        lease_expires_at=clock_timestamp()+($3::integer * interval '1 second'),
        attempt_count=attempt_count+1, updated_at=clock_timestamp()
    WHERE task_id=$1 AND approved=true AND status='queued' AND owner_id IS NULL
      AND fence < 9007199254740991 AND $3::integer BETWEEN 5 AND 900
    RETURNING task_id, source_commit_sha, task_type, fence, lease_expires_at, checkpoint_commit_sha`,
  renew: `UPDATE win_dev_task_queue
    SET lease_expires_at=clock_timestamp()+($4::integer * interval '1 second'), updated_at=clock_timestamp()
    WHERE task_id=$1 AND owner_id=$2 AND fence=$3 AND approved=true AND status='running'
      AND lease_expires_at > clock_timestamp() AND $4::integer BETWEEN 5 AND 900
    RETURNING task_id, fence, lease_expires_at`,
  checkpoint: `UPDATE win_dev_task_queue
    SET checkpoint_commit_sha=$4, updated_at=clock_timestamp()
    WHERE task_id=$1 AND owner_id=$2 AND fence=$3 AND approved=true AND status='running'
      AND lease_expires_at > clock_timestamp() AND $4 ~ '^[0-9a-f]{40}$'
    RETURNING task_id, fence, checkpoint_commit_sha`,
  quarantine: `UPDATE win_dev_task_queue
    SET status='blocked_uncertain', owner_id=NULL, lease_expires_at=NULL, fence=fence+1,
        last_error_code=$2, updated_at=clock_timestamp()
    WHERE task_id=$1 AND status='running' AND lease_expires_at <= clock_timestamp()
    RETURNING task_id, fence, status`
});

export function createDurableQueueAdapter(db) {
  requireQuery(db);
  return Object.freeze({
    async claim(taskId, ownerId, ttlSeconds) {
      if (!validId(taskId) || !validId(ownerId) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 900) throw Error("INVALID_CLAIM");
      return one(await db.query(QUEUE_SQL.claim, [taskId, ownerId, ttlSeconds]));
    },
    async renew(taskId, ownerId, fence, ttlSeconds) {
      if (!validId(taskId) || !validId(ownerId) || !Number.isSafeInteger(fence) || fence < 1 || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 5 || ttlSeconds > 900) throw Error("INVALID_RENEWAL");
      return one(await db.query(QUEUE_SQL.renew, [taskId, ownerId, fence, ttlSeconds]));
    },
    async checkpoint(taskId, ownerId, fence, checkpointSha) {
      if (!validId(taskId) || !validId(ownerId) || !Number.isSafeInteger(fence) || fence < 1 || !validSha(checkpointSha)) throw Error("INVALID_CHECKPOINT");
      return one(await db.query(QUEUE_SQL.checkpoint, [taskId, ownerId, fence, checkpointSha]));
    },
    async quarantine(taskId, errorCode) {
      if (!validId(taskId) || !validId(errorCode)) throw Error("INVALID_QUARANTINE");
      return one(await db.query(QUEUE_SQL.quarantine, [taskId, errorCode]));
    }
  });
}

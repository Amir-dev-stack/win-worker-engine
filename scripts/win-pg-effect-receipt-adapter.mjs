const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const HASH = /^[0-9a-f]{64}$/u;

function validId(value) { return typeof value === "string" && ID.test(value); }
function validHash(value) { return typeof value === "string" && HASH.test(value); }
function validFence(value) { return Number.isSafeInteger(value) && value >= 1; }
function requireTransaction(db) {
  if (!db || typeof db.transaction !== "function") throw Error("RECEIPT_TRANSACTION_REQUIRED");
}
function requireAttempt(input) {
  if (!input || !validId(input.operationId) || !validId(input.taskId) || !validHash(input.payloadHash)
    || !validId(input.ownerId) || !validFence(input.fence)) throw Error("INVALID_RECEIPT_ATTEMPT");
}
function parseReceipt(row) {
  if (!row || typeof row !== "object" || !validId(row.operation_id) || !validId(row.task_id)
    || !validHash(row.payload_hash) || !validId(row.owner_id) || !validFence(Number(row.fence))
    || !["pending", "applied"].includes(row.status)
    || (row.status === "applied" && (typeof row.result !== "string" || row.result.length < 1))) {
    throw Error("INVALID_RECEIPT_RESULT");
  }
  return {
    operationId: row.operation_id,
    taskId: row.task_id,
    payloadHash: row.payload_hash,
    ownerId: row.owner_id,
    fence: Number(row.fence),
    status: row.status,
    ...(row.status === "applied" ? { result: row.result } : {})
  };
}

export const RECEIPT_SQL = Object.freeze({
  claim: `INSERT INTO win_pr115_effect_receipts(operation_id,task_id,payload_hash,owner_id,fence,status)
    VALUES ($1,$2,$3,$4,$5,'pending')
    ON CONFLICT (operation_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,fence=EXCLUDED.fence,updated_at=clock_timestamp()
    WHERE win_pr115_effect_receipts.status='pending'
      AND win_pr115_effect_receipts.task_id=EXCLUDED.task_id
      AND win_pr115_effect_receipts.payload_hash=EXCLUDED.payload_hash
      AND EXCLUDED.fence > win_pr115_effect_receipts.fence
    RETURNING operation_id,task_id,payload_hash,owner_id,fence,status,result`,
  read: "SELECT operation_id,task_id,payload_hash,owner_id,fence,status,result FROM win_pr115_effect_receipts WHERE operation_id=$1 FOR UPDATE",
  complete: `UPDATE win_pr115_effect_receipts SET status='applied',result=$4,updated_at=clock_timestamp()
    WHERE operation_id=$1 AND task_id=$2 AND owner_id=$3 AND fence=$5 AND status='pending'
    RETURNING operation_id,task_id,payload_hash,owner_id,fence,status,result`
});

export function createPostgresEffectReceiptAdapter(db) {
  requireTransaction(db);
  return Object.freeze({
    async begin(input) {
      requireAttempt(input);
      return db.transaction(async tx => {
        const claimed = await tx.query(RECEIPT_SQL.claim, [input.operationId, input.taskId, input.payloadHash, input.ownerId, input.fence]);
        if (!claimed || !Array.isArray(claimed.rows) || claimed.rowCount !== claimed.rows.length || claimed.rowCount > 1) throw Error("INVALID_RECEIPT_RESULT");
        if (claimed.rowCount === 1) return { status: "claimed", receipt: parseReceipt(claimed.rows[0]) };
        const current = await tx.query(RECEIPT_SQL.read, [input.operationId]);
        if (!current || !Array.isArray(current.rows) || current.rowCount !== current.rows.length || current.rowCount !== 1) throw Error("INVALID_RECEIPT_RESULT");
        const receipt = parseReceipt(current.rows[0]);
        if (receipt.taskId !== input.taskId || receipt.payloadHash !== input.payloadHash
          || (receipt.status === "applied" && receipt.ownerId !== input.ownerId)) return { status: "binding_mismatch", receipt };
        if (receipt.status === "applied") return { status: "already_applied", receipt };
        return { status: "stale_fence", receipt };
      });
    },
    async complete(input) {
      requireAttempt(input);
      if (typeof input.result !== "string" || input.result.length < 1 || input.result.length > 4096) throw Error("INVALID_RECEIPT_COMPLETION");
      return db.transaction(async tx => {
        const result = await tx.query(RECEIPT_SQL.complete, [input.operationId, input.taskId, input.ownerId, input.result, input.fence]);
        if (!result || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount !== 1) throw Error("STALE_RECEIPT_FENCE");
        return parseReceipt(result.rows[0]);
      });
    }
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresEffectReceiptAdapter, RECEIPT_SQL } from "./win-pg-effect-receipt-adapter.mjs";

const hash = "a".repeat(64);
function fakeDb(responses) {
  const calls = [];
  return { calls, async transaction(run) { return run({ async query(sql, params) { calls.push({ sql, params }); return responses.shift(); } }); } };
}
const row = { operation_id: "op-1", task_id: "task-1", payload_hash: hash, owner_id: "worker-a", fence: "2", status: "pending", result: null };

test("claims and completes through one transaction boundary", async () => {
  const db = fakeDb([{ rows: [row], rowCount: 1 }, { rows: [{ ...row, status: "applied", result: "result-1" }], rowCount: 1 }]);
  const adapter = createPostgresEffectReceiptAdapter(db);
  const claim = await adapter.begin({ operationId: "op-1", taskId: "task-1", payloadHash: hash, ownerId: "worker-a", fence: 2 });
  assert.equal(claim.status, "claimed");
  const done = await adapter.complete({ operationId: "op-1", taskId: "task-1", payloadHash: hash, ownerId: "worker-a", fence: 2, result: "result-1" });
  assert.equal(done.status, "applied");
  assert.deepEqual(db.calls.map(call => call.sql), [RECEIPT_SQL.claim, RECEIPT_SQL.complete]);
});

test("stale and rebound receipts are returned as safe non-claims", async () => {
  const current = { ...row, owner_id: "worker-b", fence: "3" };
  const db = fakeDb([{ rows: [], rowCount: 0 }, { rows: [current], rowCount: 1 }]);
  const result = await createPostgresEffectReceiptAdapter(db).begin({ operationId: "op-1", taskId: "task-1", payloadHash: hash, ownerId: "worker-a", fence: 2 });
  assert.equal(result.status, "stale_fence");
  assert.equal(result.receipt.fence, 3);
});

test("malformed database rows fail closed before an effect can run", async () => {
  const db = fakeDb([{ rows: [{ ...row, payload_hash: "bad" }], rowCount: 1 }]);
  await assert.rejects(() => createPostgresEffectReceiptAdapter(db).begin({ operationId: "op-1", taskId: "task-1", payloadHash: hash, ownerId: "worker-a", fence: 2 }), /INVALID_RECEIPT_RESULT/);
});

test("invalid inputs never open a transaction", async () => {
  let called = false;
  const adapter = createPostgresEffectReceiptAdapter({ async transaction() { called = true; } });
  await assert.rejects(() => adapter.begin({ operationId: "op-1", taskId: "task-1", payloadHash: "bad", ownerId: "worker-a", fence: 1 }), /INVALID_RECEIPT_ATTEMPT/);
  assert.equal(called, false);
});

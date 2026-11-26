import test from "node:test";
import assert from "node:assert/strict";
import { createDurableQueueAdapter, QUEUE_SQL } from "./win-durable-queue-adapter.mjs";

const sha = "a".repeat(40);
function fakeDb() {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
}

test("claims, renews, checkpoints and quarantines with parameterized CAS statements", async () => {
  const db = fakeDb(), adapter = createDurableQueueAdapter(db);
  assert.equal(await adapter.claim("task-1", "worker-a", 60), null);
  assert.equal(await adapter.renew("task-1", "worker-a", 1, 60), null);
  assert.equal(await adapter.checkpoint("task-1", "worker-a", 1, sha), null);
  assert.equal(await adapter.quarantine("task-1", "LIMIT_REACHED"), null);
  assert.deepEqual(db.calls.map(call => call.sql), [QUEUE_SQL.claim, QUEUE_SQL.renew, QUEUE_SQL.checkpoint, QUEUE_SQL.quarantine]);
});

test("rejects malformed ownership and checkpoint inputs before database access", async () => {
  const db = fakeDb(), adapter = createDurableQueueAdapter(db);
  await assert.rejects(adapter.claim("bad id", "worker-a", 60), /INVALID_CLAIM/);
  await assert.rejects(adapter.renew("task-1", "worker-a", 0, 60), /INVALID_RENEWAL/);
  await assert.rejects(adapter.checkpoint("task-1", "worker-a", 1, "bad"), /INVALID_CHECKPOINT/);
  await assert.rejects(adapter.quarantine("task-1", "bad code!"), /INVALID_QUARANTINE/);
  assert.equal(db.calls.length, 0);
});

test("fails closed on malformed database result shapes", async () => {
  const adapter = createDurableQueueAdapter({ async query() { return { rows: [{}], rowCount: 2 }; } });
  await assert.rejects(adapter.claim("task-1", "worker-a", 60), /INVALID_DURABLE_DB_RESULT/);
});

test("fails closed on malformed lease fields even when row counts look valid", async () => {
  const adapter = createDurableQueueAdapter({ async query() {
    return { rows: [{ task_id: "task-1", fence: "not-a-fence", source_commit_sha: "bad", task_type: "unknown" }], rowCount: 1 };
  } });
  await assert.rejects(adapter.claim("task-1", "worker-a", 60), /INVALID_DURABLE_DB_RESULT/);
});

test("normalizes PostgreSQL bigint fences for claim-to-renew and checkpoint flow", async () => {
  const responses = [
    { rows: [{ task_id: "task-1", source_commit_sha: sha, task_type: "draft_only_development", fence: "7", lease_expires_at: "future", checkpoint_commit_sha: null }], rowCount: 1 },
    { rows: [{ task_id: "task-1", fence: "7", lease_expires_at: "future" }], rowCount: 1 },
    { rows: [{ task_id: "task-1", fence: "7", checkpoint_commit_sha: sha }], rowCount: 1 }
  ];
  const adapter = createDurableQueueAdapter({ async query() { return responses.shift(); } });
  const claim = await adapter.claim("task-1", "worker-a", 60);
  assert.equal(claim.fence, 7);
  assert.equal((await adapter.renew("task-1", "worker-a", claim.fence, 60)).fence, 7);
  assert.equal((await adapter.checkpoint("task-1", "worker-a", claim.fence, sha)).fence, 7);
});

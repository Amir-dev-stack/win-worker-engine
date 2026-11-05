import test from "node:test";
import assert from "node:assert/strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing?.etag ?? null };
      }
      const etag = "isolated-agent-task-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) {
      const item = records.get(key);
      return item ? clone(item.value) : null;
    },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

test("persistent agent task claims use atomic leases and reject stale worker writes", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();

  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const { claimNextPersistentAgentTask, updatePersistentAgentTaskLease } =
      await import("../netlify/lib/agent-task-queue.mts");

    const now = Date.parse("2026-11-05T12:00:00.000Z");
    await store.put("library/agent-task-queue", "one-task", {
      id: "one-task", status: "queued", attempts: 0,
      createdAt: "2026-11-05T10:00:00.000Z", updatedAt: "2026-11-05T10:00:00.000Z"
    });

    const competingClaims = await Promise.all([
      claimNextPersistentAgentTask(now),
      claimNextPersistentAgentTask(now)
    ]);
    const winners = competingClaims.filter(Boolean);
    assert.equal(winners.length, 1, "only one competing worker may claim the same queued task");
    const winner = winners[0];
    assert.equal(winner.status, "running");
    assert.equal(winner.attempts, 1);
    assert.ok(winner.leaseId);
    assert.ok(Date.parse(winner.leaseExpiresAt) > now);

    assert.equal(await updatePersistentAgentTaskLease("one-task", "wrong-lease", {
      status: "completed"
    }, now + 1000), false, "a worker without the current lease cannot complete a task");
    assert.equal(await updatePersistentAgentTaskLease("one-task", winner.leaseId, {
      status: "completed", completedAt: new Date(now + 1000).toISOString(), leaseExpiresAt: null
    }, now + 1000), true, "the current lease owner can complete its task");

    await store.put("library/agent-task-queue", "stale-task", {
      id: "stale-task", status: "running", attempts: 1,
      lastAttemptAt: "2026-11-05T10:00:00.000Z",
      leaseExpiresAt: "2026-11-05T10:30:00.000Z",
      leaseId: "expired-lease", createdAt: "2026-11-05T09:00:00.000Z"
    });
    const reclaimed = await claimNextPersistentAgentTask(now);
    assert.equal(reclaimed.id, "stale-task");
    assert.equal(reclaimed.attempts, 2);
    assert.notEqual(reclaimed.leaseId, "expired-lease");
    assert.equal(await updatePersistentAgentTaskLease("stale-task", "expired-lease", {
      status: "completed"
    }, now + 1000), false, "an expired worker cannot overwrite the reclaimed task");

    await store.put("library/agent-task-queue", "exhausted-task", {
      id: "exhausted-task", status: "queued", attempts: 3,
      createdAt: "2026-11-05T08:00:00.000Z"
    });
    const next = await claimNextPersistentAgentTask(now);
    assert.equal(next, null, "tasks at the retry ceiling must not be claimed");
    const exhausted = await store.get("library/agent-task-queue", "exhausted-task");
    assert.equal(exhausted.status, "failed");
    assert.ok([...memoryStore.records.keys()].every(key => key.startsWith("library/agent-task-queue/")),
      "the test may write only synthetic task-queue records");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

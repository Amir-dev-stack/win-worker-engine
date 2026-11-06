import test from "node:test";
import assert from "node:assert/strict";

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
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
      const etag = "scheduled-run-lease-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) { const item = records.get(key); return item ? clone(item.value) : null; },
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

test("scheduled learning run lease elects one concurrent owner and blocks duplicates", async () => {
  const prior = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memory = createMemoryStore();
  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memory);
    const { claimWinScheduledRunLease, releaseWinScheduledRunLease } =
      await import("../netlify/lib/scheduled-run-lease.mts");
    const now = Date.parse("2026-11-06T01:00:00.000Z");
    const claims = await Promise.all([
      claimWinScheduledRunLease("synthetic-run-1", now),
      claimWinScheduledRunLease("synthetic-run-1", now)
    ]);
    const winners = claims.filter(x => x.claimed);
    assert.equal(winners.length, 1);
    const winner = winners[0];
    const loser = claims.find(x => !x.claimed);
    assert.equal(loser.reason, "already_running");
    assert.equal((await claimWinScheduledRunLease("synthetic-run-1", now + 1000)).reason, "already_running");

    assert.equal(await releaseWinScheduledRunLease("synthetic-run-1", "not-the-owner", now + 2000), false);
    assert.equal(await releaseWinScheduledRunLease("synthetic-run-1", winner.leaseId, now + 2000), true);
    const afterRelease = await claimWinScheduledRunLease("synthetic-run-1", now + 3000);
    assert.equal(afterRelease.claimed, true);

    const expired = await claimWinScheduledRunLease("synthetic-run-2", now, 1000);
    assert.equal(expired.claimed, true);
    const reclaimed = await claimWinScheduledRunLease("synthetic-run-2", now + 1001, 1000);
    assert.equal(reclaimed.claimed, true, "an expired run lease must be reclaimable");
    assert.notEqual(reclaimed.leaseId, expired.leaseId);
    assert.equal(await releaseWinScheduledRunLease("synthetic-run-2", expired.leaseId, now + 1002), false,
      "a stale worker must not release the reclaimed lease");

    assert.equal((await claimWinScheduledRunLease("", now)).reason, "invalid_run_id");
    assert.ok([...memory.records.keys()].every(key => key.startsWith("library/scheduled-run-leases/")),
      "the isolated test writes only synthetic scheduled-run lease records");
  } finally {
    if (prior === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = prior;
  }
});

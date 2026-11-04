import test from "node:test";
import assert from "node:assert/strict";

const clone = value => JSON.parse(JSON.stringify(value));

function createPagedMemoryStore() {
  const records = new Map();
  let revision = 0;
  let activeReads = 0;
  return {
    pagesRequested: 0,
    maxConcurrentReads: 0,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) {
        return { modified: false, etag: existing.etag };
      }
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing?.etag ?? null };
      }
      const etag = "memory-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) {
      activeReads++;
      this.maxConcurrentReads = Math.max(this.maxConcurrentReads, activeReads);
      try {
        await Promise.resolve();
        const item = records.get(key);
        return item ? clone(item.value) : null;
      } finally {
        activeReads--;
      }
    },
    async *list({ prefix = "" } = {}) {
      const keys = [...records.keys()].filter(key => key.startsWith(prefix));
      for (let offset = 0; offset < keys.length; offset += 2) {
        this.pagesRequested++;
        yield { blobs: keys.slice(offset, offset + 2).map(key => ({ key })) };
      }
    },
    async delete(key) {
      records.delete(key);
    },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    }
  };
}

test("shared WIN store enforces isolated adapter, paginated limits and conditional writes", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  delete process.env.WIN_STORE_TEST_MODE;

  try {
    const store = await import("../netlify/lib/store.mts");
    const adapter = createPagedMemoryStore();
    assert.throws(
      () => store.installIsolatedTestStore(adapter),
      /WIN_STORE_TEST_MODE=1/,
      "the in-memory adapter must not be installable without the explicit test flag"
    );

    process.env.WIN_STORE_TEST_MODE = "1";
    assert.throws(() => store.installIsolatedTestStore({}), /adapter is incomplete/);
    store.installIsolatedTestStore(adapter);
    assert.throws(
      () => store.installIsolatedTestStore(createPagedMemoryStore()),
      /already installed/,
      "a running process must not silently swap the installed store"
    );

    await store.put("library/coupons", "conditional", { state: "pending", revision: 1 });
    const initial = await store.getWithMetadata("library/coupons", "conditional");
    assert.equal(initial.value.state, "pending");
    assert.ok(initial.etag);

    const duplicate = await store.putIfNew("library/coupons", "conditional", { state: "overwritten" });
    assert.equal(duplicate.modified, false, "onlyIfNew must preserve the existing record");
    const created = await store.putIfNew("library/coupons", "conditional-new", { state: "created" });
    assert.equal(created.modified, true);

    const staleWrite = await store.putIfMatch(
      "library/coupons", "conditional", { state: "stale" }, "not-the-current-etag"
    );
    assert.equal(staleWrite.modified, false, "a stale ETag must not overwrite the record");

    const matchedWrite = await store.putIfMatch(
      "library/coupons", "conditional", { state: "reviewed", revision: 2 }, initial.etag
    );
    assert.equal(matchedWrite.modified, true);
    const updated = await store.getWithMetadata("library/coupons", "conditional");
    assert.equal(updated.value.state, "reviewed");
    assert.notEqual(updated.etag, initial.etag);
    assert.equal(await store.getWithMetadata("library/coupons", "missing"), null);

    for (let index = 0; index < 24; index++) {
      await store.put("sample", "record-" + String(index).padStart(2, "0"), { index });
    }

    const pagesBeforeLimitedRead = adapter.pagesRequested;
    const limited = await store.list("sample", 3);
    assert.equal(limited.length, 3);
    assert.equal(adapter.pagesRequested - pagesBeforeLimitedRead, 2,
      "a three-record request should stop after only two two-record pages");

    const pagesBeforeZeroRead = adapter.pagesRequested;
    assert.deepEqual(await store.list("sample", 0), []);
    assert.equal(adapter.pagesRequested, pagesBeforeZeroRead,
      "a zero-sized request must not ask the storage adapter for any page");
    assert.deepEqual(await store.list("sample", -5), [],
      "negative limits must fail closed as an empty read");

    const bounded = await store.list("sample", 20);
    assert.equal(bounded.length, 20);
    assert.ok(adapter.maxConcurrentReads > 1);
    assert.ok(adapter.maxConcurrentReads <= 16,
      "Blob record reads must stay within the configured 16-read batch");

    const appended = await store.append("library/coupons", "appended", { state: "appended" });
    assert.equal(appended.state, "appended");
    assert.equal((await store.get("library/coupons", "appended")).state, "appended");
    await store.remove("library/coupons", "appended");
    assert.equal(await store.get("library/coupons", "appended"), null);
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

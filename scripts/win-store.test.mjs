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
    setRaw(key, raw) {
      records.set(key, { raw, etag: "memory-raw-etag-" + (++revision) });
    },
    async get(key) {
      activeReads++;
      this.maxConcurrentReads = Math.max(this.maxConcurrentReads, activeReads);
      try {
        await Promise.resolve();
        const item = records.get(key);
        if (!item) return null;
        return item.raw !== undefined ? JSON.parse(item.raw) : clone(item.value);
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
      if (!item) return null;
      const data = item.raw !== undefined ? JSON.parse(item.raw) : clone(item.value);
      return { data, etag: item.etag };
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
    assert.equal(await store.get("library/coupons", "missing"), null,
      "a missing JSON record must resolve to null");
    adapter.setRaw("sample/legacy-json", '{"legacy":true,"schemaVersion":1}');
    assert.deepEqual(await store.get("sample", "legacy-json"),
      { legacy: true, schemaVersion: 1 },
      "a valid legacy JSON record remains readable without an invented migration");
    adapter.setRaw("malformed-sample/malformed-json", "{not-valid-json");
    await assert.rejects(() => store.get("malformed-sample", "malformed-json"), SyntaxError,
      "malformed JSON must surface as a parse failure rather than becoming an empty record");
    await assert.rejects(() => store.list("malformed-sample", 100), SyntaxError,
      "a malformed record in a bounded list must not be silently dropped");

    const createRace = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      store.putIfNew("library/coupons", "create-race", { winner: index })
    ));
    assert.equal(createRace.filter(result => result.modified).length, 1,
      "an atomic onlyIfNew race must have exactly one winner");
    assert.equal(createRace.filter(result => !result.modified).length, 11,
      "all competing create attempts must observe the existing record");

    const raceInitial = await store.getWithMetadata("library/coupons", "update-race");
    assert.equal(raceInitial, null);
    await store.put("library/coupons", "update-race", { revision: 0 });
    const raceEtag = (await store.getWithMetadata("library/coupons", "update-race")).etag;
    const updateRace = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      store.putIfMatch("library/coupons", "update-race", { revision: index + 1 }, raceEtag)
    ));
    assert.equal(updateRace.filter(result => result.modified).length, 1,
      "only one compare-and-swap update may win for a shared ETag");
    assert.equal(updateRace.filter(result => !result.modified).length, 11,
      "stale competing ETag updates must fail closed");

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
    assert.equal((await store.list("library/coupons", 100)).some(item => item.state === "appended"), false,
      "a deleted record must not reappear in a subsequent list read");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

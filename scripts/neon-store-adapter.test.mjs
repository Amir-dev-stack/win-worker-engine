import test from "node:test";
import assert from "node:assert/strict";
import { createNeonStore } from "../netlify/lib/neon-store.mts";

function fakeSql(responses = []) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: Array.from(strings).join("?"), values });
    return responses.shift() ?? [];
  };
  return { sql, calls };
}

test("Neon create-only writes use one INSERT ON CONFLICT DO NOTHING statement", async () => {
  const fake = fakeSql([[]]);
  const store = createNeonStore(fake.sql);
  const result = await store.setJSON("budget/month", { spent: 1 }, { onlyIfNew: true });
  assert.equal(result.modified, false);
  assert.match(fake.calls[0].text, /INSERT INTO public\.win_memory_records/);
  assert.match(fake.calls[0].text, /ON CONFLICT \(record_key\) DO NOTHING/);
  assert.match(fake.calls[0].text, /RETURNING etag/);
  assert.deepEqual(fake.calls[0].values.slice(0, 3), ["budget/month", "budget", "month"]);
});

test("Neon ETag compare-and-swap uses a single conditional UPDATE", async () => {
  const fake = fakeSql([[{ etag: "next-version" }]]);
  const store = createNeonStore(fake.sql);
  const result = await store.setJSON("assignments/task-1", { status: "running" }, { onlyIfMatch: "old-version" });
  assert.equal(result.modified, true);
  assert.equal(result.etag, "next-version");
  assert.match(fake.calls[0].text, /UPDATE public\.win_memory_records/);
  assert.match(fake.calls[0].text, /WHERE record_key = \? AND etag = \?/);
  assert.match(fake.calls[0].text, /RETURNING etag/);
  assert.equal(fake.calls[0].values.at(-1), "old-version");
});

test("Neon reads return payload and ETag in the Blobs-compatible shape", async () => {
  const fake = fakeSql([[{ payload: { status: "approved" }, etag: "v1" }]]);
  const store = createNeonStore(fake.sql);
  assert.deepEqual(await store.getWithMetadata("assignments/task-1"), {
    data: { status: "approved" }, etag: "v1"
  });
  assert.match(fake.calls[0].text, /SELECT payload, etag/);
});

test("Neon prefix listing is ordered and bounded by keyset pagination", async () => {
  const fake = fakeSql([[{ record_key: "agent-memory/a" }, { record_key: "agent-memory/b" }]]);
  const store = createNeonStore(fake.sql, { pageSize: 50 });
  const pages = [];
  for await (const page of store.list({ prefix: "agent-memory/", paginate: true })) pages.push(page);
  assert.deepEqual(pages, [{ blobs: [{ key: "agent-memory/a" }, { key: "agent-memory/b" }] }]);
  assert.match(fake.calls[0].text, /ORDER BY record_key ASC LIMIT \?/);
  assert.equal(fake.calls[0].values[0], "agent-memory/%");
});

test("Neon adapter rejects malformed keys and supports deletion", async () => {
  const fake = fakeSql([[]]);
  const store = createNeonStore(fake.sql);
  await assert.rejects(() => store.setJSON("invalid", { x: 1 }), /kind\/id/);
  await store.delete("agent-memory/a");
  assert.match(fake.calls[0].text, /DELETE FROM public\.win_memory_records/);
});

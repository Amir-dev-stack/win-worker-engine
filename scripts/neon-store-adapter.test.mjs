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

test("Neon pagination defaults invalid page sizes to a bounded safe value", async () => {
  const fake = fakeSql([[]]);
  const store = createNeonStore(fake.sql, { pageSize: Number.NaN });
  for await (const _page of store.list({ prefix: "agent-memory/" })) { /* no rows */ }
  assert.equal(fake.calls[0].values.at(-1), 500);
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

test("OpenAI budget controller and assignment manager share the configured store", async () => {
  const { readFile } = await import("node:fs/promises");
  const storeSource = await readFile(new URL("../netlify/lib/store.mts", import.meta.url), "utf8");
  const budgetSource = await readFile(new URL("../netlify/lib/ai-budget.mts", import.meta.url), "utf8");
  const assignmentSource = await readFile(new URL("../netlify/lib/win-research-assignment-manager.mts", import.meta.url), "utf8");
  const aiSource = await readFile(new URL("../netlify/lib/ai.mts", import.meta.url), "utf8");

  assert.match(storeSource, /export async function getStoreAdapter\(/);
  assert.match(budgetSource, /import \{ getStoreAdapter \} from "\.\/store\.mts"/);
  assert.match(budgetSource, /return getStoreAdapter\(\)/);
  assert.doesNotMatch(budgetSource, /import\("@netlify\/blobs"\)/);
  assert.match(assignmentSource, /from "\.\/store\.mts"/);
  assert.match(aiSource, /reserveAIRequest, settleAIRequest, releaseAIRequest/);
});

test("Blobs-to-Neon audit is read-only and hashes payloads without printing them", async () => {
  const { readFile } = await import("node:fs/promises");
  const auditSource = await readFile(new URL("./win-store-migration-audit.mjs", import.meta.url), "utf8");
  assert.match(auditSource, /READ_ONLY_DRY_RUN/);
  assert.match(auditSource, /createHash\("sha256"\)/);
  assert.match(auditSource, /writesPerformed: 0/);
  assert.match(auditSource, /WIN_NEON_TEST_BRANCH_CONFIRM !== "dedicated-test-branch"/);
  assert.match(auditSource, /WIN_NEON_TEST_EXPECTED_DATABASE/);
  assert.match(auditSource, /SELECT current_database\(\) AS name/);
  assert.match(auditSource, /Destination record cap exceeded/);
  assert.doesNotMatch(auditSource, /INSERT INTO|UPDATE public\.win_memory_records|DELETE FROM|TRUNCATE TABLE|\.setJSON\(|\.delete\(/i);
  assert.doesNotMatch(auditSource, /console\.log\([^\n]*payload/i);
});


test("live Neon integration refuses ambiguous or runtime-matching database targets", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./neon-store-live.integration.mjs", import.meta.url), "utf8");
  assert.match(source, /WIN_NEON_TEST_BRANCH_CONFIRM !== "dedicated-test-branch"/);
  assert.match(source, /WIN_NEON_TEST_EXPECTED_DATABASE/);
  assert.match(source, /WIN_NEON_DATABASE_URL === connectionString/);
  assert.match(source, /SELECT current_database\(\) AS name/);
  assert.match(source, /databaseIdentity\?\.\[0\]\?\.name !== expectedDatabase/);
});

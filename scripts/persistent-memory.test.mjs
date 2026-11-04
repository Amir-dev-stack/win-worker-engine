import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("WIN Neon memory remains opt-in and preserves Blobs as the default", async () => {
  const store = await read("../netlify/lib/store.mts");
  assert.match(store, /\|\| "blobs"/);
  assert.match(store, /mode === "mirror"/);
  assert.match(store, /mode === "neon"/);
  assert.match(store, /if \(secondary\) await secondary\.setJSON/);
  assert.match(store, /if \(secondary\) await secondary\.delete/);
  assert.match(store, /primaryValue !== null && primaryValue !== undefined/);
});

test("Neon store uses parameterized SQL and conditional single-key writes", async () => {
  const adapter = await read("../netlify/lib/neon-store.mts");
  assert.match(adapter, /@neondatabase\/serverless/);
  assert.match(adapter, /ON CONFLICT \(record_key\) DO NOTHING/);
  assert.match(adapter, /WHERE record_key = \$\{key\} AND etag = \$\{options\.onlyIfMatch\}/);
  assert.match(adapter, /payload = \$\{payload\}::jsonb/);
  assert.match(adapter, /WIN_NEON_DATABASE_URL/);
  assert.doesNotMatch(adapter, /console\.log\(.*connectionString/);
});

test("Neon schema preserves generic WIN records and indexes collection reads", async () => {
  const schema = await read("../database/neon/0001_win_memory_records.sql");
  for (const column of ["record_key", "kind", "record_id", "payload JSONB", "etag", "created_at", "updated_at"]) {
    assert.ok(schema.includes(column), "missing schema element: " + column);
  }
  assert.match(schema, /PRIMARY KEY/);
  assert.match(schema, /win_memory_records_kind_updated_idx/);
});

test("memory status endpoint is authenticated and does not expose database credentials", async () => {
  const route = await read("../netlify/functions/memory-status.mts");
  assert.match(route, /requireAuth/);
  assert.match(route, /WIN_NEON_DATABASE_URL/);
  assert.match(route, /getMemoryBackendMode/);
  assert.doesNotMatch(route, /connectionString\s*:/);
  assert.doesNotMatch(route, /DATABASE_URL\s*:/);
});

test("persistent-memory runbook prohibits premature cutover and destructive migration", async () => {
  const docs = await read("../docs/PERSISTENT-MEMORY-ARCHITECTURE.md");
  assert.match(docs, /WIN_MEMORY_BACKEND=blobs/);
  assert.match(docs, /WIN_MEMORY_BACKEND=mirror/);
  assert.match(docs, /WIN_MEMORY_BACKEND=neon/);
  assert.match(docs, /complete backfill and reconciliation/);
  assert.match(docs, /No existing Blobs records are deleted/);
  assert.match(docs, /encrypted, versioned export/);
});

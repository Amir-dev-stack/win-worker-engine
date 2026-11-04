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
  assert.match(store, /catch \(error\)/);
  assert.match(store, /const current = result\?\.modified \? value : await primary\.get/);
  assert.doesNotMatch(store, /if \(value !== null && value !== undefined\) return value/);
  assert.doesNotMatch(store, /library\/model-lab\//);
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
  assert.match(schema, /CREATE TABLE IF NOT EXISTS win_financial_accounts/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS win_financial_ledger/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION win_record_financial_entry/);
  assert.match(schema, /FOR UPDATE/);
  assert.match(schema, /daily_loss_limit_reached/);
  assert.match(schema, /available_balance_exceeded/);
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
  assert.match(docs, /AES-256-GCM encrypted/);
});

test("backfill is authenticated, owner-confirmed, Blobs-first and digest-verified", async () => {
  const route = await read("../netlify/functions/memory-backfill.mts");
  assert.match(route, /requireAuth/);
  assert.match(route, /BACKFILL_STRUCTURED_WIN_MEMORY/);
  assert.match(route, /getMemoryBackendMode\(\) !== "mirror"/);
  assert.match(route, /onlyIfNew/);
  assert.match(route, /sourceDigest/);
  assert.match(route, /targetDigest/);
  assert.match(route, /Source\/target key inventory mismatch/);
});

test("daily Neon snapshots are versioned, checksummed and retained for 30 days", async () => {
  const backup = await read("../netlify/functions/neon-memory-backup.mts");
  assert.match(backup, /schedule: "23 3 \* \* \*"/);
  assert.match(backup, /gzipSync/);
  assert.match(backup, /createCipheriv/);
  assert.match(backup, /background: true/);
  assert.match(backup, /cipher\.final\(\)[\s\S]*cipher\.getAuthTag\(\)/);
  assert.match(backup, /WIN_MEMORY_BACKUP_KEY/);
  assert.match(backup, /sha256/);
  assert.match(backup, /retentionDays: 30/);
  assert.match(backup, /MAX_RAW_BYTES/);
});

test("snapshot restore is authenticated, confirmed, checksum-verified and cannot overwrite Blobs primary", async () => {
  const restore = await read("../netlify/functions/memory-restore.mts");
  assert.match(restore, /requireAuth/);
  assert.match(restore, /RESTORE_NEON_MEMORY_SNAPSHOT/);
  assert.match(restore, /getMemoryBackendMode\(\) !== "mirror"/);
  assert.match(restore, /gunzipSync/);
  assert.match(restore, /createDecipheriv/);
  assert.match(restore, /WIN_MEMORY_BACKUP_KEY/);
  assert.match(restore, /Snapshot SHA-256 verification failed/);
  assert.match(restore, /neon\.setJSON/);
  assert.doesNotMatch(restore, /blobs\.setJSON\(entry\.key/);
});

test("financial memory API is authenticated and never places bets", async () => {
  const route = await read("../netlify/functions/financial-memory.mts");
  assert.match(route, /requireAuth/);
  assert.match(route, /create_account/);
  assert.match(route, /record_entry/);
  assert.match(route, /WIN_NEON_DATABASE_URL/);
  assert.match(route, /WIN did not place any bet/);
  assert.doesNotMatch(route, /placeBet|submitBet|bookmaker\.place/i);
});

test("encrypted backup and restore include financial accounts and append-only ledger", async () => {
  const adapter = await read("../netlify/lib/neon-store.mts");
  const backup = await read("../netlify/functions/neon-memory-backup.mts");
  const restore = await read("../netlify/functions/memory-restore.mts");
  assert.match(adapter, /exportFinancialData/);
  assert.match(adapter, /restoreFinancialRecord/);
  assert.match(backup, /__financial__\/account/);
  assert.match(backup, /__financial__\/ledger/);
  assert.match(restore, /restoreFinancialRecord\("account"/);
  assert.match(restore, /restoreFinancialRecord\("ledger"/);
});

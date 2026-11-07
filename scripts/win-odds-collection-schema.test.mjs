import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../database/migrations/20261107_win_odds_collection_attempts.sql", import.meta.url), "utf8");

test("collection attempts schema records provider usage, estimate variance and source time range", () => {
  for (const field of ["provider_id","licence_id","planned_at","requested_at","ingested_at","total_used","remaining","last_request","estimated_credits","actual_credits","estimate_variance","correlation_id","response_sha256","oldest_source_observed_at","newest_source_observed_at"]) {
    assert.match(sql, new RegExp("\\b" + field + "\\b"));
  }
});

test("collection attempts are immutable and contain no persisted secrets", () => {
  assert.match(sql, /secrets_persisted boolean NOT NULL DEFAULT false CHECK \(secrets_persisted = false\)/);
  assert.match(sql, /immutable boolean NOT NULL DEFAULT true CHECK \(immutable = true\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.win_odds_collection_attempts/);
  assert.match(sql, /WIN odds collection attempts are append-only/);
});

test("database constraints enforce stop policy, timestamp order and outcome shape", () => {
  assert.match(sql, /remaining <= reserve_credits/);
  assert.match(sql, /actual_credits > estimated_credits/);
  assert.match(sql, /provider_usage_headers_incomplete|remaining IS NULL OR last_request IS NULL/);
  assert.match(sql, /oldest_source_observed_at <= newest_source_observed_at/);
  assert.match(sql, /outcome = 'not_attempted' AND requested_at IS NULL AND stop_further_collection/);
  assert.match(sql, /outcome = 'success' AND returned_records > 0/);
  assert.match(sql, /outcome = 'empty' AND returned_records = 0/);
});

test("database enforces exact usage reconciliation and stable safe identifiers", () => {
  assert.match(sql, /actual_credits = last_request/);
  assert.match(sql, /estimate_variance = actual_credits - estimated_credits/);
  assert.match(sql, /correlation_id text NOT NULL CHECK/);
  assert.match(sql, /response_sha256 ~ '\^\[a-f0-9\]\{64\}\$'/);
});

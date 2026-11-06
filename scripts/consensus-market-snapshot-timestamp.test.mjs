import test from "node:test";
import assert from "node:assert/strict";
import { readSourceMarketSnapshotTimestamp } from "../netlify/lib/consensus-market-adapter.mts";

test("market snapshot time is accepted only from an explicit source timestamp field", () => {
  const result = readSourceMarketSnapshotTimestamp({
    close_time_utc: "2026-06-01T17:55:00.000Z",
    kickoff_utc: "2026-06-01T18:00:00.000Z"
  });
  assert.deepEqual(result, {
    at: "2026-06-01T17:55:00.000Z",
    sourceField: "close_time_utc",
    status: "source_timestamp"
  });
});

test("missing source timestamp is not replaced with retrieval time or kickoff time", () => {
  const result = readSourceMarketSnapshotTimestamp({
    kickoff_utc: "2026-06-01T18:00:00.000Z",
    retrievedAt: "2026-06-01T18:05:00.000Z"
  });
  assert.deepEqual(result, {
    at: null,
    sourceField: null,
    status: "source_timestamp_not_provided"
  });
});

test("impossible or non-ISO source timestamps remain ineligible", () => {
  const impossible = readSourceMarketSnapshotTimestamp({ market_snapshot_at: "2026-02-31T17:00:00.000Z" });
  assert.equal(impossible.at, null);
  assert.equal(impossible.status, "invalid_source_timestamp");
  const epoch = readSourceMarketSnapshotTimestamp({ odds_timestamp_utc: 1790000000 });
  assert.equal(epoch.at, null);
  assert.equal(epoch.status, "invalid_source_timestamp");
});

test("a valid explicit timestamp alias is retained with its exact source field", () => {
  const result = readSourceMarketSnapshotTimestamp({
    market_snapshot_at: "not-a-timestamp",
    snapshot_time_utc: "2026-06-01T16:59:00.000Z"
  });
  assert.deepEqual(result, {
    at: "2026-06-01T16:59:00.000Z",
    sourceField: "snapshot_time_utc",
    status: "source_timestamp"
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenFootballSyncRunId, buildOpenFootballDatasetSnapshotId } from "../netlify/lib/openfootball-adapter.mts";
import { buildOpenFootballWorldCupSyncRunId, buildOpenFootballWorldCupDatasetEligibility, buildOpenFootballWorldCupDatasetSnapshotId, selectLatestOpenFootballWorldCupSnapshots } from "../netlify/lib/openfootball-worldcup-adapter.mts";

const revision = "a".repeat(40);
const startedAt = "2026-11-07T10:00:00.000Z";

test("each OpenFootball sync attempt receives a unique audit identity", () => {
  const first = buildOpenFootballSyncRunId(startedAt, revision);
  const second = buildOpenFootballSyncRunId(startedAt, revision);
  assert.match(first, /^openfootball-[a-z0-9]+-a{12}-[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test("OpenFootball sync identity rejects invalid timestamps and unpinned revisions", () => {
  assert.throws(() => buildOpenFootballSyncRunId("not-a-date", revision), /identity_invalid/);
  assert.throws(() => buildOpenFootballSyncRunId(startedAt, "main"), /identity_invalid/);
});

test("World Cup sync attempts also receive unique audit identities", () => {
  const first = buildOpenFootballWorldCupSyncRunId(startedAt, revision);
  const second = buildOpenFootballWorldCupSyncRunId(startedAt, revision);
  assert.match(first, /^openfootball-worldcup-sync-[a-z0-9]+-a{12}-[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test("World Cup sync identity rejects invalid timestamps and unpinned revisions", () => {
  assert.throws(() => buildOpenFootballWorldCupSyncRunId("not-a-date", revision), /identity_invalid/);
  assert.throws(() => buildOpenFootballWorldCupSyncRunId(startedAt, "master"), /identity_invalid/);
});

test("World Cup dataset snapshots declare date-only, unknown-result availability and training exclusion", () => {
  assert.deepEqual(buildOpenFootballWorldCupDatasetEligibility(), {
    eventTimePrecision: "date",
    resultAvailability: "unknown",
    trainingEligible: false
  });
});

test("OpenFootball dataset snapshots are immutable across source revisions", () => {
  const first = buildOpenFootballDatasetSnapshotId("2025-26", "eng.1.json", revision);
  const second = buildOpenFootballDatasetSnapshotId("2025-26", "eng.1.json", "b".repeat(40));
  assert.notEqual(first, second);
  assert.match(first, /-ra{40}$/);
  assert.throws(() => buildOpenFootballDatasetSnapshotId("2025-26", "eng.1.json", "master"), /snapshot_identity_invalid/);
});

test("World Cup dataset snapshots are immutable across source revisions", () => {
  const first = buildOpenFootballWorldCupDatasetSnapshotId(2022, "worldcup-full.json", revision);
  const second = buildOpenFootballWorldCupDatasetSnapshotId(2022, "worldcup-full.json", "b".repeat(40));
  assert.notEqual(first, second);
  assert.match(first, /-ra{40}$/);
  assert.throws(() => buildOpenFootballWorldCupDatasetSnapshotId(2022, "worldcup-full.json", "main"), /snapshot_identity_invalid/);
});

test("World Cup snapshot status counts only the newest revision per logical dataset", () => {
  const snapshots = [
    { id: "openfootball-worldcup-2022-worldcup-full-r" + "a".repeat(40), sourceRevision: "a".repeat(40), retrievedAt: "2026-11-01T00:00:00.000Z", totalRows: 64 },
    { id: "openfootball-worldcup-2022-worldcup-full-r" + "b".repeat(40), sourceRevision: "b".repeat(40), retrievedAt: "2026-11-02T00:00:00.000Z", totalRows: 64 },
    { id: "openfootball-worldcup-2018-worldcup-full-r" + "c".repeat(40), sourceRevision: "c".repeat(40), retrievedAt: "2026-11-01T00:00:00.000Z", totalRows: 64 }
  ];
  const latest = selectLatestOpenFootballWorldCupSnapshots(snapshots);
  assert.equal(latest.length, 2);
  assert.ok(latest.some(item => item.sourceRevision === "b".repeat(40)));
  assert.ok(latest.some(item => item.sourceRevision === "c".repeat(40)));
  assert.ok(!latest.some(item => item.sourceRevision === "a".repeat(40)));
});

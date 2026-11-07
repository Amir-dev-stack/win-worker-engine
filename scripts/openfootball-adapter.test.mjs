import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenFootballSyncRunId } from "../netlify/lib/openfootball-adapter.mts";
import { buildOpenFootballWorldCupSyncRunId, buildOpenFootballWorldCupDatasetEligibility } from "../netlify/lib/openfootball-worldcup-adapter.mts";

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

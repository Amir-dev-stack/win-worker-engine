import test from "node:test";
import assert from "node:assert/strict";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";
import { buildWinFootball1X2TrainingCandidates } from "../netlify/lib/ml-football-training-builder.mts";

const manifest = (overrides = {}) => ({
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
  datasetId: "research-only-fixture",
  providerId: "synthetic-test",
  sport: "association_football",
  competition: "Fixture League",
  season: "2025-26",
  sourceUrl: "https://example.test/data",
  licenceId: "TEST-ONLY",
  attributionRequired: false,
  automationAllowed: false,
  approvedForTraining: false,
  permittedUse: "research_only",
  rowGrain: "match",
  eventTimePrecision: "instant",
  retrievedAt: "2026-11-05T12:00:00.000Z",
  rowCount: 3,
  labeledRowCount: 3,
  schemaVersion: "win.football.results.v1",
  contentSha256: "a".repeat(64),
  ...overrides
});
const row = (overrides = {}) => ({
  sourceRecordId: "source-1", eventId: "match-1",
  kickoff: "2026-10-01T12:00:00.000Z",
  competitionId: "league", season: "2025-26",
  homeTeamId: "A", awayTeamId: "B",
  homeGoals: 2, awayGoals: 1,
  resultAvailableAt: "2026-10-01T14:00:00.000Z",
  ...overrides
});

test("builds labeled 1X2 candidates but keeps research-only data blocked from fitting", () => {
  const rows = [
    row(),
    row({ sourceRecordId: "source-2", eventId: "match-2", kickoff: "2026-10-05T12:00:00.000Z", resultAvailableAt: "2026-10-05T14:00:00.000Z", homeGoals: 0, awayGoals: 0 }),
    row({ sourceRecordId: "target", eventId: "target-match", kickoff: "2026-11-01T18:00:00.000Z", homeGoals: 3, awayGoals: 1, resultAvailableAt: "2026-11-01T20:00:00.000Z" })
  ];
  const result = buildWinFootball1X2TrainingCandidates({
    manifest: manifest(),
    rows,
    predictionCutoffsByEventId: { "target-match": "2026-11-01T17:00:00.000Z" },
    targetEventIds: ["target-match"],
    settlementRuleId: "official-full-time-1x2-v1"
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].example.label.outcome, "HOME");
  assert.equal(result.candidates[0].example.sourceRecordId, "target");
  assert.equal(result.trainingReadiness.eligible, false);
  assert.equal(result.readyForTraining, false);
  assert.equal(result.rejected.length, 0);
});

test("rejects missing prediction cutoffs and unavailable target settlements", () => {
  const rows = [
    row({ eventId: "missing-cutoff" }),
    row({ sourceRecordId: "no-settlement", eventId: "no-settlement", resultAvailableAt: undefined })
  ];
  const result = buildWinFootball1X2TrainingCandidates({
    manifest: manifest(),
    rows,
    predictionCutoffsByEventId: {},
    targetEventIds: ["missing-cutoff", "no-settlement"],
    settlementRuleId: "official-full-time-1x2-v1"
  });
  assert.equal(result.candidates.length, 0);
  assert.ok(result.rejected.some(item => item.reasons.includes("prediction_cutoff_missing")));
});


test("explicit targets use the full row set as historical evidence without rejecting non-target rows", () => {
  const rows = [
    row({ eventId: "history-a", sourceRecordId: "history-a", kickoff: "2026-09-01T12:00:00.000Z", resultAvailableAt: "2026-09-01T14:00:00.000Z" }),
    row({ eventId: "history-b", sourceRecordId: "history-b", kickoff: "2026-09-10T12:00:00.000Z", resultAvailableAt: "2026-09-10T14:00:00.000Z" }),
    row({ eventId: "target", sourceRecordId: "target", kickoff: "2026-10-01T12:00:00.000Z", resultAvailableAt: "2026-10-01T14:00:00.000Z" })
  ];
  const result = buildWinFootball1X2TrainingCandidates({
    manifest: manifest(), rows,
    predictionCutoffsByEventId: { target: "2026-10-01T11:00:00.000Z" },
    targetEventIds: ["target"], settlementRuleId: "official-full-time-1x2-v1"
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].sourceEvidence.historicalMatchesUsedHome, 2);
  assert.equal(result.rejected.length, 0);
});

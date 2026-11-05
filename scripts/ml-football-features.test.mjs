import test from "node:test";
import assert from "node:assert/strict";
import { buildWinFootballPointInTimeFeatures } from "../netlify/lib/ml-football-features.mts";

const match = (overrides = {}) => ({
  sourceRecordId: "src-1",
  eventId: "event-1",
  kickoff: "2026-10-01T12:00:00.000Z",
  competitionId: "league",
  season: "2026",
  homeTeamId: "A",
  awayTeamId: "B",
  homeGoals: 2,
  awayGoals: 1,
  resultAvailableAt: "2026-10-01T14:00:00.000Z",
  ...overrides
});
const target = {
  eventId: "target",
  kickoff: "2026-11-01T18:00:00.000Z",
  homeTeamId: "A",
  awayTeamId: "B"
};

test("point-in-time football features use only source-confirmed available past results", () => {
  const rows = [
    match(),
    match({ sourceRecordId: "src-2", eventId: "event-2", kickoff: "2026-10-05T12:00:00.000Z", resultAvailableAt: "2026-10-05T14:00:00.000Z", homeGoals: 0, awayGoals: 0 }),
    match({ sourceRecordId: "future", eventId: "future", kickoff: "2026-11-02T12:00:00.000Z", resultAvailableAt: "2026-11-02T14:00:00.000Z" }),
    match({ sourceRecordId: "late", eventId: "late", kickoff: "2026-10-20T12:00:00.000Z", resultAvailableAt: "2026-11-01T17:00:01.000Z" }),
    match({ sourceRecordId: "no-time", eventId: "no-time", kickoff: "2026-10-22T12:00:00.000Z", resultAvailableAt: undefined })
  ];
  const result = buildWinFootballPointInTimeFeatures({
    datasetId: "research-fixture",
    historicalRows: rows,
    target,
    predictionCutoff: "2026-11-01T17:00:00.000Z"
  });
  assert.equal(result.evidence.homeMatchesUsed, 2);
  assert.equal(result.evidence.awayMatchesUsed, 2);
  assert.equal(result.evidence.excludedFutureOrUnavailableRows, 3);
  assert.equal(result.features.home_last5_wins.value, 1);
  assert.equal(result.features.home_last5_draws.value, 1);
  assert.equal(result.features.home_last5_points_per_match.value, 2);
  assert.equal(result.features.home_last5_goals_for_per_match.value, 1);
  assert.equal(result.features.home_last5_goals_against_per_match.value, 0.5);
  assert.ok(Object.values(result.features).every(feature =>
    Date.parse(feature.availableAt) <= Date.parse(result.predictionCutoff)));
});

test("feature builder fails closed on invalid cutoff and team identity", () => {
  assert.throws(() => buildWinFootballPointInTimeFeatures({
    datasetId: "fixture", historicalRows: [], target,
    predictionCutoff: target.kickoff
  }), error => error.code === "prediction_cutoff_must_precede_target_kickoff");
  assert.throws(() => buildWinFootballPointInTimeFeatures({
    datasetId: "fixture", historicalRows: [],
    target: { ...target, awayTeamId: "A" },
    predictionCutoff: "2026-11-01T17:00:00.000Z"
  }), error => error.code === "target_identity_invalid");
});

test("missing result availability is never inferred from kickoff", () => {
  const result = buildWinFootballPointInTimeFeatures({
    datasetId: "fixture",
    historicalRows: [match({ resultAvailableAt: undefined })],
    target,
    predictionCutoff: "2026-11-01T17:00:00.000Z"
  });
  assert.equal(result.evidence.homeMatchesUsed, 0);
  assert.equal(result.evidence.awayMatchesUsed, 0);
  assert.equal(result.evidence.excludedFutureOrUnavailableRows, 1);
  assert.deepEqual(result.features, {});
});


test("point-in-time feature builder rejects duplicate or missing historical identities", () => {
  assert.throws(() => buildWinFootballPointInTimeFeatures({
    datasetId: "fixture",
    historicalRows: [match(), match({ eventId: "event-2" })],
    target,
    predictionCutoff: "2026-11-01T17:00:00.000Z"
  }), error => error.code === "historical_row_identity_duplicate_or_invalid");
  assert.throws(() => buildWinFootballPointInTimeFeatures({
    datasetId: "fixture",
    historicalRows: [match({ sourceRecordId: "" })],
    target,
    predictionCutoff: "2026-11-01T17:00:00.000Z"
  }), error => error.code === "historical_row_identity_duplicate_or_invalid");
});

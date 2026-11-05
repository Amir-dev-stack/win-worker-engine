import test from "node:test";
import assert from "node:assert/strict";
import {
  importWinFootballResultsBytes,
  WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA
} from "../netlify/lib/ml-football-importer.mts";
import { buildWinFootball1X2TrainingCandidates } from "../netlify/lib/ml-football-training-builder.mts";
import { WIN_ML_FOOTBALL_1X2_SETTLEMENT_RULE_ID } from "../netlify/lib/ml-data-contract.mts";

test("football results v2 flows through availability-aware point-in-time candidate construction", () => {
  const source = {
    datasetId: "synthetic-integration-fixture",
    providerId: "synthetic-fixture",
    competition: "Synthetic League",
    season: "2025-2026",
    sourceUrl: "https://example.test/football-results.json",
    licenceId: "UNVERIFIED-TEST-FIXTURE",
    attributionRequired: false,
    retrievedAt: "2026-11-06T00:00:00.000Z"
  };
  const records = [
    {
      sourceRecordId: "historical-source", eventId: "historical-event",
      kickoff: "2026-10-01T18:00:00.000Z",
      resultAvailableAt: "2026-10-01T20:00:00.000Z",
      competitionId: "synthetic-league", season: "2025-2026",
      homeTeamId: "home", awayTeamId: "away",
      homeGoals: 2, awayGoals: 1, scoreBasis: "regulation_time", status: "finished"
    },
    {
      sourceRecordId: "target-source", eventId: "target-event",
      kickoff: "2026-10-05T18:00:00.000Z",
      resultAvailableAt: "2026-10-05T20:00:00.000Z",
      competitionId: "synthetic-league", season: "2025-2026",
      homeTeamId: "home", awayTeamId: "away",
      homeGoals: 1, awayGoals: 1, scoreBasis: "regulation_time", status: "finished"
    }
  ];
  const bytes = new TextEncoder().encode(JSON.stringify({
    schemaVersion: WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA, records
  }));
  const imported = importWinFootballResultsBytes(bytes, source);
  assert.equal(imported.rows[0].resultAvailableAt, records[0].resultAvailableAt);
  const candidates = buildWinFootball1X2TrainingCandidates({
    manifest: imported.manifest,
    rows: imported.rows,
    targetEventIds: ["target-event"],
    predictionCutoffsByEventId: {
      "target-event": "2026-10-05T17:00:00.000Z"
    },
    settlementRuleId: WIN_ML_FOOTBALL_1X2_SETTLEMENT_RULE_ID
  });
  assert.equal(candidates.candidates.length, 1);
  assert.equal(candidates.rejected.length, 0);
  assert.equal(candidates.candidates[0].example.label.outcome, "DRAW");
  assert.equal(candidates.candidates[0].example.features.home_points_per_match.value, 3);
  assert.equal(candidates.candidates[0].example.features.home_points_per_match.availableAt,
    records[0].resultAvailableAt);
  assert.equal(candidates.readyForTraining, false);
  assert.ok(candidates.trainingReadiness.reasons.includes("owner_training_approval_missing"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  WIN_FOOTBALL_1X2_LOGISTIC_PLAN,
  WIN_FOOTBALL_TOTAL_GOALS_POISSON_PLAN,
  preflightWinMLExperiment
} from "../netlify/lib/ml-football-experiment-plans.mts";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";

const manifest = (overrides = {}) => ({
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
  datasetId: "research",
  providerId: "fixture",
  sport: "association_football",
  competition: "league",
  season: "2025-26",
  sourceUrl: "https://example.test/data",
  licenceId: "TEST",
  attributionRequired: false,
  automationAllowed: false,
  approvedForTraining: false,
  permittedUse: "research_only",
  rowGrain: "match",
  eventTimePrecision: "instant",
  retrievedAt: "2026-11-05T12:00:00.000Z",
  rowCount: 1000,
  labeledRowCount: 1000,
  schemaVersion: "win.football.results.v1",
  contentSha256: "a".repeat(64),
  ...overrides
});

test("defines deterministic, chronological Logistic Regression and Poisson plans", () => {
  assert.equal(WIN_FOOTBALL_1X2_LOGISTIC_PLAN.seed, 20261105);
  assert.equal(WIN_FOOTBALL_1X2_LOGISTIC_PLAN.algorithm, "logistic_regression");
  assert.equal(WIN_FOOTBALL_TOTAL_GOALS_POISSON_PLAN.algorithm, "poisson_attack_defence");
  assert.deepEqual(WIN_FOOTBALL_1X2_LOGISTIC_PLAN.chronologicalSplit, { training: 70, validation: 15, test: 15 });
  assert.equal(WIN_FOOTBALL_1X2_LOGISTIC_PLAN.fittingAllowed, false);
});

test("research-only datasets remain blocked at experiment preflight", () => {
  const result = preflightWinMLExperiment(manifest(), WIN_FOOTBALL_1X2_LOGISTIC_PLAN, 1000);
  assert.equal(result.status, "blocked");
  assert.equal(result.fittingAllowed, false);
  assert.ok(result.reasons.includes("owner_training_approval_missing"));
  assert.ok(result.reasons.includes("licence_does_not_permit_training"));
});

test("preflight blocks undersized datasets even if training permission is approved", () => {
  const result = preflightWinMLExperiment(manifest({
    approvedForTraining: true,
    permittedUse: "training"
  }), WIN_FOOTBALL_TOTAL_GOALS_POISSON_PLAN, 500);
  assert.ok(result.reasons.includes("candidate_rows_below_experiment_minimum"));
});

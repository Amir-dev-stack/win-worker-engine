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

test("chronological splitter is stable and keeps equal kickoff times in one partition", async () => {
  const { splitWinMLExamplesChronologically } = await import("../netlify/lib/ml-football-experiment-plans.mts");
  const examples = Array.from({ length: 20 }, (_, index) => ({
    eventId: "event-" + index,
    eventStart: new Date(Date.UTC(2026, 0, Math.floor(index / 2) + 1, 12)).toISOString(),
    predictionCutoff: new Date(Date.UTC(2026, 0, Math.floor(index / 2) + 1, 11)).toISOString()
  })).reverse();
  const first = splitWinMLExamplesChronologically(examples);
  const second = splitWinMLExamplesChronologically(examples);
  assert.deepEqual(first.eventIds, second.eventIds);
  assert.ok(Date.parse(first.boundaries.trainingEndsAt) < Date.parse(first.boundaries.validationStartsAt));
  assert.ok(Date.parse(first.boundaries.validationEndsAt) < Date.parse(first.boundaries.testStartsAt));
  const partitionByTime = new Map();
  for (const [name, rows] of [["training", first.training], ["validation", first.validation], ["test", first.test]]) {
    for (const row of rows) {
      const previous = partitionByTime.get(row.eventStart);
      assert.ok(!previous || previous === name, "same kickoff timestamp must not cross partitions");
      partitionByTime.set(row.eventStart, name);
    }
  }
});

test("chronological splitter rejects invalid cutoffs and duplicate event identities", async () => {
  const { splitWinMLExamplesChronologically } = await import("../netlify/lib/ml-football-experiment-plans.mts");
  const examples = Array.from({ length: 10 }, (_, index) => ({
    eventId: "event-" + index,
    eventStart: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
    predictionCutoff: new Date(Date.UTC(2026, 0, index + 1, 11)).toISOString()
  }));
  assert.throws(() => splitWinMLExamplesChronologically([
    ...examples.slice(0, 9), { ...examples[9], eventId: "event-0" }
  ]), /chronological_split_example_invalid/);
  assert.throws(() => splitWinMLExamplesChronologically([
    ...examples.slice(0, 9), { ...examples[9], predictionCutoff: examples[9].eventStart }
  ]), /chronological_split_example_invalid/);
});


test("chronological splitter preserves heavily imbalanced kickoff groups without empty partitions", async () => {
  const { splitWinMLExamplesChronologically } = await import("../netlify/lib/ml-football-experiment-plans.mts");
  const sizes = [14, 1, 1, 1];
  const examples = [];
  let index = 0;
  for (const [group, size] of sizes.entries()) {
    for (let i = 0; i < size; i++) {
      const day = group + 1;
      examples.push({
        eventId: "grouped-" + index++,
        eventStart: new Date(Date.UTC(2026, 0, day, 12)).toISOString(),
        predictionCutoff: new Date(Date.UTC(2026, 0, day, 11)).toISOString()
      });
    }
  }
  const result = splitWinMLExamplesChronologically(examples);
  assert.ok(result.training.length > 0);
  assert.ok(result.validation.length > 0);
  assert.ok(result.test.length > 0);
  assert.equal(result.training.length + result.validation.length + result.test.length, examples.length);
  assert.ok(Date.parse(result.boundaries.trainingEndsAt) < Date.parse(result.boundaries.validationStartsAt));
  assert.ok(Date.parse(result.boundaries.validationEndsAt) < Date.parse(result.boundaries.testStartsAt));
});

test("chronological splitter requires at least three distinct kickoff groups", async () => {
  const { splitWinMLExamplesChronologically } = await import("../netlify/lib/ml-football-experiment-plans.mts");
  const examples = Array.from({ length: 6 }, (_, index) => ({
    eventId: "same-" + index,
    eventStart: new Date(Date.UTC(2026, 0, index < 3 ? 1 : 2, 12)).toISOString(),
    predictionCutoff: new Date(Date.UTC(2026, 0, index < 3 ? 1 : 2, 11)).toISOString()
  }));
  assert.throws(() => splitWinMLExamplesChronologically(examples), /chronological_split_requires_three_distinct_time_groups/);
});


test("chronological splitter requires full timezone-qualified timestamps", async () => {
  const { splitWinMLExamplesChronologically } = await import("../netlify/lib/ml-football-experiment-plans.mts");
  const examples = Array.from({ length: 6 }, (_, index) => ({
    eventId: "strict-" + index,
    eventStart: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
    predictionCutoff: new Date(Date.UTC(2026, 0, index + 1, 11)).toISOString()
  }));
  assert.throws(() => splitWinMLExamplesChronologically([
    ...examples.slice(0, 5), { ...examples[5], eventStart: "2026-01-06" }
  ]), /chronological_split_example_invalid/);
  assert.throws(() => splitWinMLExamplesChronologically([
    ...examples.slice(0, 5), { ...examples[5], predictionCutoff: "2026-01-06T11:00:00" }
  ]), /chronological_split_example_invalid/);
  assert.throws(() => splitWinMLExamplesChronologically([
    ...examples.slice(0, 5), null
  ]), /chronological_split_example_invalid/);
});

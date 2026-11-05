import test from "node:test";
import assert from "node:assert/strict";
import {
  WIN_ML_MODEL_EVALUATION_VERSION,
  evaluateWinMLPromotionReadiness
} from "../netlify/lib/ml-model-contract.mts";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";

const manifest = (overrides = {}) => ({
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
  datasetId: "dataset-1",
  providerId: "approved-historical-provider",
  sport: "football",
  competition: "Example League",
  season: "2024-25",
  sourceUrl: "https://example.com/dataset",
  licenceId: "CC0-1.0",
  attributionRequired: false,
  automationAllowed: true,
  approvedForTraining: true,
  permittedUse: "training",
  rowGrain: "match",
  eventTimePrecision: "instant",
  retrievedAt: "2025-02-01T00:00:00.000Z",
  rowCount: 1000,
  labeledRowCount: 1000,
  schemaVersion: "match-v1",
  contentSha256: "a".repeat(64),
  ...overrides
});

const evaluation = (overrides = {}) => ({
  evaluationVersion: WIN_ML_MODEL_EVALUATION_VERSION,
  modelId: "football-1x2-logistic-v1",
  modelVersion: "1.0.0",
  sport: "football",
  market: "1x2",
  algorithm: "logistic_regression",
  datasetId: "dataset-1",
  datasetContentSha256: "a".repeat(64),
  featureSchemaVersion: "football-match-features-v1",
  featureNames: ["home_strength", "away_strength", "home_advantage"],
  featureBuilderCommitSha: "d".repeat(40),
  trainingConfigSha256: "e".repeat(64),
  splitManifestSha256: "f".repeat(64),
  trainingRunId: "run-2025-02-02-001",
  targetDefinition: "full_time_1x2_official_settlement",
  trainingWindow: { from: "2024-01-01T00:00:00.000Z", to: "2024-08-31T23:59:59.000Z" },
  validationWindow: { from: "2024-09-01T00:00:00.000Z", to: "2024-10-31T23:59:59.000Z" },
  testWindow: { from: "2024-11-01T00:00:00.000Z", to: "2025-01-31T23:59:59.000Z" },
  trainedAt: "2025-02-02T00:00:00.000Z",
  fitDataCutoff: "2024-08-31T23:59:59.000Z",
  trainingRows: 700,
  validationRows: 150,
  testRows: 150,
  baselineMetrics: { brier: 0.21, logLoss: 0.60 },
  modelMetrics: { brier: 0.19, logLoss: 0.55 },
  expectedCalibrationError: 0.03,
  artifactSha256: "b".repeat(64),
  sourceCommitSha: "c".repeat(40),
  ...overrides
});

test("valid out-of-sample evaluation qualifies only for human shadow review", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation());
  assert.equal(result.status, "eligible_for_human_shadow_review");
  assert.equal(result.promotionEligibleForHumanReview, true);
  assert.equal(result.automaticPromotionAllowed, false);
  assert.equal(result.productionPromotionAllowed, false);
});

test("unapproved or non-training datasets cannot qualify", () => {
  const result = evaluateWinMLPromotionReadiness(
    manifest({ approvedForTraining: false, permittedUse: "research_only" }),
    evaluation()
  );
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("dataset_owner_training_approval_missing"));
  assert.ok(result.reasons.includes("dataset_licence_does_not_permit_training"));
});

test("chronological split overlap is rejected", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    validationWindow: { from: "2024-08-01T00:00:00.000Z", to: "2024-10-31T23:59:59.000Z" }
  }));
  assert.ok(result.reasons.includes("chronological_split_invalid_or_overlapping"));
});

test("fit-data cutoff after training window is rejected as leakage", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    fitDataCutoff: "2024-11-15T00:00:00.000Z"
  }));
  assert.ok(result.reasons.includes("fit_data_cutoff_exceeds_training_window"));
});

test("model that does not beat baseline out of sample is blocked", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    modelMetrics: { brier: 0.215, logLoss: 0.62 }
  }));
  assert.ok(result.reasons.includes("out_of_sample_brier_improvement_insufficient"));
  assert.ok(result.reasons.includes("out_of_sample_log_loss_not_improved"));
});

test("small test sample and poor calibration are blocked", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    testRows: 25,
    expectedCalibrationError: 0.12
  }));
  assert.ok(result.reasons.includes("testRows_below_minimum"));
  assert.ok(result.reasons.includes("calibration_error_above_limit"));
});

test("evaluation split row counts cannot exceed the dataset", () => {
  const result = evaluateWinMLPromotionReadiness(manifest({ rowCount: 500, labeledRowCount: 500 }), evaluation());
  assert.ok(result.reasons.includes("evaluation_rows_exceed_dataset_rows"));
});

test("dataset hash mismatch and invalid artifact identity are rejected", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    datasetContentSha256: "d".repeat(64),
    artifactSha256: "not-a-hash",
    sourceCommitSha: "bad"
  }));
  assert.ok(result.reasons.includes("dataset_content_hash_mismatch"));
  assert.ok(result.reasons.includes("model_artifact_hash_invalid"));
  assert.ok(result.reasons.includes("source_commit_sha_invalid"));
});

test("model evaluation rejects date-only windows without timezone precision", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    testWindow: { from: "2024-11-01", to: "2025-01-31T23:59:59.000Z" }
  }));
  assert.ok(result.reasons.includes("evaluation_timestamps_invalid"));
});


test("evaluation rejects sport, market-algorithm and target-definition mismatches", () => {
  const wrongSport = evaluateWinMLPromotionReadiness(manifest(), evaluation({ sport: "basketball" }));
  assert.ok(wrongSport.reasons.includes("evaluation_sport_mismatch"));
  const wrongAlgorithm = evaluateWinMLPromotionReadiness(manifest(), evaluation({ algorithm: "poisson_attack_defence" }));
  assert.ok(wrongAlgorithm.reasons.includes("evaluation_market_algorithm_mismatch"));
  const wrongTarget = evaluateWinMLPromotionReadiness(manifest(), evaluation({ targetDefinition: "full_time_total_goals" }));
  assert.ok(wrongTarget.reasons.includes("evaluation_target_definition_market_mismatch"));
});


test("evaluation requires a training run, configuration hash, split hash and feature-builder commit", () => {
  const result = evaluateWinMLPromotionReadiness(manifest(), evaluation({
    trainingRunId: "",
    trainingConfigSha256: "not-a-hash",
    splitManifestSha256: "",
    featureBuilderCommitSha: "bad"
  }));
  assert.ok(result.reasons.includes("trainingRunId_required"));
  assert.ok(result.reasons.includes("training_config_hash_invalid"));
  assert.ok(result.reasons.includes("split_manifest_hash_invalid"));
  assert.ok(result.reasons.includes("feature_builder_commit_sha_invalid"));
});

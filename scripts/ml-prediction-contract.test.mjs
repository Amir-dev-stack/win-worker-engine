import test from "node:test";
import assert from "node:assert/strict";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";
import { WIN_ML_MODEL_EVALUATION_VERSION } from "../netlify/lib/ml-model-contract.mts";
import { WIN_ML_PREDICTION_VERSION, validateWinMLPrediction } from "../netlify/lib/ml-prediction-contract.mts";

const manifest = {
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
  datasetId: "dataset-1", providerId: "approved-historical-provider",
  sport: "football", competition: "Example League", season: "2024-25",
  sourceUrl: "https://example.com/dataset", licenceId: "CC0-1.0",
  attributionRequired: false, automationAllowed: true, approvedForTraining: true,
  permittedUse: "training", rowGrain: "match", eventTimePrecision: "instant",
  retrievedAt: "2025-02-01T00:00:00.000Z", rowCount: 1000, labeledRowCount: 1000,
  schemaVersion: "match-v1", contentSha256: "a".repeat(64)
};
const evaluation = {
  evaluationVersion: WIN_ML_MODEL_EVALUATION_VERSION,
  modelId: "football-1x2-logistic-v1", modelVersion: "1.0.0",
  sport: "football", market: "1x2", algorithm: "logistic_regression",
  datasetId: "dataset-1", datasetContentSha256: "a".repeat(64),
  featureSchemaVersion: "football-match-features-v1",
  featureNames: ["home_strength", "away_strength", "home_advantage"],
  featureBuilderCommitSha: "d".repeat(40),
  trainingConfigSha256: "e".repeat(64), splitManifestSha256: "f".repeat(64),
  trainingRunId: "run-2025-02-02-001",
  targetDefinition: "full_time_1x2_official_settlement",
  trainingWindow: { from: "2024-01-01T00:00:00.000Z", to: "2024-08-31T23:59:59.000Z" },
  validationWindow: { from: "2024-09-01T00:00:00.000Z", to: "2024-10-31T23:59:59.000Z" },
  testWindow: { from: "2024-11-01T00:00:00.000Z", to: "2025-01-31T23:59:59.000Z" },
  trainedAt: "2025-02-02T00:00:00.000Z", fitDataCutoff: "2024-08-31T23:59:59.000Z",
  trainingRows: 700, validationRows: 150, testRows: 150,
  baselineMetrics: { brier: 0.21, logLoss: 0.60 },
  modelMetrics: { brier: 0.19, logLoss: 0.55 },
  expectedCalibrationError: 0.03,
  artifactSha256: "b".repeat(64), sourceCommitSha: "c".repeat(40)
};
const prediction = (overrides = {}) => ({
  contractVersion: WIN_ML_PREDICTION_VERSION,
  origin: "trained_model", usage: "shadow_only",
  predictionRunId: "prediction-run-001", eventId: "event-2025-02-05",
  eventStart: "2025-02-05T19:00:00.000Z",
  predictionCutoff: "2025-02-05T18:00:00.000Z",
  generatedAt: "2025-02-05T18:00:01.000Z",
  sport: "football", market: "1x2",
  modelId: evaluation.modelId, modelVersion: evaluation.modelVersion,
  algorithm: evaluation.algorithm, artifactSha256: evaluation.artifactSha256,
  datasetId: evaluation.datasetId, datasetContentSha256: evaluation.datasetContentSha256,
  featureSchemaVersion: evaluation.featureSchemaVersion,
  featureVectorSha256: "9".repeat(64),
  probabilities: { home: 0.5, draw: 0.25, away: 0.25 },
  ...overrides
});

test("valid trained-model prediction is eligible only for shadow evaluation", () => {
  const result = validateWinMLPrediction(manifest, evaluation, prediction());
  assert.equal(result.status, "eligible_for_shadow_only");
  assert.equal(result.productionUseAllowed, false);
  assert.equal(result.automatedBettingAllowed, false);
});

test("LLM research output cannot be typed as a trained-model prediction", () => {
  const result = validateWinMLPrediction(manifest, evaluation, prediction({ origin: "llm_research" }));
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("prediction_origin_not_trained_model"));
});

test("prediction provenance must match the evaluated model and dataset", () => {
  const result = validateWinMLPrediction(manifest, evaluation, prediction({
    artifactSha256: "8".repeat(64),
    datasetContentSha256: "7".repeat(64)
  }));
  assert.ok(result.reasons.includes("prediction_provenance_mismatch"));
});

test("prediction cannot be emitted after kickoff or before model training", () => {
  const afterKickoff = validateWinMLPrediction(manifest, evaluation, prediction({
    generatedAt: "2025-02-05T19:01:00.000Z"
  }));
  assert.ok(afterKickoff.reasons.includes("prediction_generated_before_cutoff") === false);
  const beforeTraining = validateWinMLPrediction(manifest, evaluation, prediction({
    generatedAt: "2025-02-01T18:00:01.000Z"
  }));
  assert.ok(beforeTraining.reasons.includes("prediction_generated_before_model_training"));
});

test("invalid or unnormalized probability vectors are rejected", () => {
  const result = validateWinMLPrediction(manifest, evaluation, prediction({
    probabilities: { home: 0.7, draw: 0.2, away: 0.2 }
  }));
  assert.ok(result.reasons.includes("prediction_probabilities_not_normalized"));
});

test("prediction is blocked when the model evaluation is not eligible", () => {
  const result = validateWinMLPrediction(manifest, {
    ...evaluation, modelMetrics: { brier: 0.25, logLoss: 0.8 }
  }, prediction());
  assert.ok(result.reasons.includes("prediction_model_evaluation_not_eligible"));
});

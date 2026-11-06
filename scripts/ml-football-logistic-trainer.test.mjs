import test from "node:test";
import assert from "node:assert/strict";
import {
  trainWinMLFootball1X2LogisticModel,
  evaluateWinMLFootball1X2LogisticModel,
  buildWinMLFootball1X2EvaluationRecord,
  predictWinMLFootball1X2
} from "../netlify/lib/ml-football-logistic-trainer.mts";

function rows(offset, count) {
  return Array.from({ length: count }, (_, index) => {
    const outcome = ["HOME", "DRAW", "AWAY"][index % 3];
    const eventStart = new Date(Date.UTC(2026, 0, 1 + offset + index)).toISOString();
    const predictionCutoff = new Date(Date.parse(eventStart) - 60 * 60 * 1000).toISOString();
    const availableAt = new Date(Date.parse(eventStart) - 2 * 60 * 60 * 1000).toISOString();
    const source = "synthetic-source-" + (offset + index);
    const feature = value => ({ value, availableAt, sourceId: source });
    return {
      eventId: "synthetic-" + (offset + index),
      eventStart,
      predictionCutoff,
      labelAvailableAt: new Date(Date.parse(eventStart) + 6 * 60 * 60 * 1000).toISOString(),
      outcome,
      features: {
        home_signal: feature(outcome === "HOME" ? 1 : 0),
        draw_signal: feature(outcome === "DRAW" ? 1 : 0),
        away_signal: feature(outcome === "AWAY" ? 1 : 0)
      }
    };
  });
}

function train(overrides = {}) {
  return trainWinMLFootball1X2LogisticModel({
    modelId: "synthetic-logistic-test",
    datasetId: "synthetic-football",
    datasetContentSha256: "a".repeat(64),
    featureSchemaVersion: "win.football.form.v1",
    trainingRows: rows(0, 60),
    validationRows: rows(60, 30),
    config: { learningRate: 0.1, epochs: 500, l2: 0.001 },
    ...overrides
  });
}

test("deterministic multinomial trainer learns a synthetic 1X2 pattern and emits a hashed shadow-only artifact", () => {
  const result = train();
  assert.equal(result.artifact.artifactVersion, "win.ml.football.logistic.artifact.v1");
  assert.equal(result.artifact.trainingRows, 60);
  assert.equal(result.validationRows, 30);
  assert.equal(result.heldOutTestRequired, true);
  assert.equal(result.productionPromotionAllowed, false);
  assert.equal(result.automatedBettingAllowed, false);
  assert.ok(result.validationMetrics.brier < result.baselineMetrics.brier);
  assert.ok(result.validationMetrics.logLoss < result.baselineMetrics.logLoss);

  const prediction = predictWinMLFootball1X2(result.artifact, {
    home_signal: 1, draw_signal: 0, away_signal: 0
  });
  assert.equal(prediction.usage, "shadow_only");
  assert.equal(prediction.productionUseAllowed, false);
  assert.equal(prediction.automatedBettingAllowed, false);
  assert.ok(Math.abs(prediction.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(prediction.probabilities[0] > prediction.probabilities[1]);
  assert.ok(prediction.probabilities[0] > prediction.probabilities[2]);
});

test("frozen logistic artifact evaluates only a later held-out test partition", () => {
  const result = train();
  const evaluation = evaluateWinMLFootball1X2LogisticModel(result.artifact, rows(91, 30), "2027-01-01T00:00:00.000Z");
  assert.equal(evaluation.heldOutTest, true);
  assert.equal(evaluation.testRows, 30);
  assert.ok(evaluation.modelMetrics.brier < evaluation.baselineMetrics.brier);
  assert.ok(evaluation.modelMetrics.logLoss < evaluation.baselineMetrics.logLoss);
  assert.equal(evaluation.productionPromotionAllowed, false);
  assert.equal(evaluation.automatedBettingAllowed, false);
  const beforeValidationLabel = rows(90, 30);
  beforeValidationLabel[0].eventStart = "2026-03-31T03:00:00.000Z";
  beforeValidationLabel[0].predictionCutoff = "2026-03-31T02:00:00.000Z";
  for (const feature of Object.values(beforeValidationLabel[0].features)) feature.availableAt = "2026-03-31T01:00:00.000Z";
  assert.throws(() => evaluateWinMLFootball1X2LogisticModel(result.artifact, beforeValidationLabel, "2027-01-01T00:00:00.000Z"),
    /held_out_test_not_after_validation_label_availability/);
  assert.throws(() => evaluateWinMLFootball1X2LogisticModel(result.artifact, rows(91, 30), "2026-04-02T05:00:00.000Z"),
    /held_out_test_labels_not_available_as_of_evaluation/);
  const duplicated = rows(91, 30);
  duplicated[0].eventId = "synthetic-0";
  assert.throws(() => evaluateWinMLFootball1X2LogisticModel(result.artifact, duplicated, "2027-01-01T00:00:00.000Z"),
    /training_event_identity_missing_or_duplicate/);
});

test("held-out results create the existing versioned evaluation contract without granting promotion", () => {
  const result = train();
  const heldOut = evaluateWinMLFootball1X2LogisticModel(
    result.artifact, rows(91, 30), "2027-01-01T00:00:00.000Z"
  );
  const evaluation = buildWinMLFootball1X2EvaluationRecord(result.artifact, heldOut, {
    modelVersion: "0.1.0",
    trainingRunId: "synthetic-run-001",
    featureBuilderCommitSha: "d".repeat(40),
    sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-03-01T07:00:00.000Z"
  });
  assert.equal(evaluation.evaluationVersion, "win.ml.model.evaluation.v1");
  assert.equal(evaluation.algorithm, "logistic_regression");
  assert.equal(evaluation.market, "1x2");
  assert.equal(evaluation.trainingRows, 60);
  assert.equal(evaluation.validationRows, 30);
  assert.equal(evaluation.testRows, 30);
  assert.equal(evaluation.testCohortSha256, heldOut.testCohortSha256);
  assert.equal(evaluation.testRowsSha256, heldOut.testRowsSha256);
  assert.equal(heldOut.testEventIds.length, 30);
  assert.equal(evaluation.artifactSha256, result.artifact.artifactSha256);
  assert.equal(evaluation.fitDataCutoff, result.artifact.fitDataCutoff);
  assert.throws(() => buildWinMLFootball1X2EvaluationRecord(result.artifact, {
    ...heldOut, artifactSha256: "f".repeat(64)
  }, {
    modelVersion: "0.1.0", trainingRunId: "synthetic-run-001",
    featureBuilderCommitSha: "d".repeat(40), sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-03-01T07:00:00.000Z"
  }), /model_evaluation_artifact_binding_invalid/);
  assert.throws(() => buildWinMLFootball1X2EvaluationRecord(result.artifact, heldOut, {
    modelVersion: "0.1.0", trainingRunId: "synthetic-run-001",
    featureBuilderCommitSha: "d".repeat(40), sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-02-01T00:00:00.000Z"
  }), /model_evaluation_chronology_invalid/);
});

test("trainer is deterministic for identical rows and configuration", () => {
  const first = train();
  const second = train();
  assert.equal(first.artifact.artifactSha256, second.artifact.artifactSha256);
  assert.deepEqual(first.validationMetrics, second.validationMetrics);
});

test("trainer rejects overlapping chronology, duplicate identities and feature schema drift", () => {
  const overlapping = rows(60, 30);
  overlapping[0].eventStart = rows(0, 60).at(-1).eventStart;
  overlapping[0].predictionCutoff = new Date(Date.parse(overlapping[0].eventStart) - 60 * 60 * 1000).toISOString();
  const availableAt = new Date(Date.parse(overlapping[0].predictionCutoff) - 60 * 60 * 1000).toISOString();
  for (const feature of Object.values(overlapping[0].features)) feature.availableAt = availableAt;
  assert.throws(() => train({ validationRows: overlapping }), /training_validation_chronology_invalid/);
  const duplicated = rows(60, 30);
  duplicated[0].eventId = "synthetic-0";
  assert.throws(() => train({ validationRows: duplicated }), /training_event_identity_missing_or_duplicate/);
  const drifted = rows(60, 30);
  drifted[0].features.extra = 1;
  assert.throws(() => train({ validationRows: drifted }), /training_feature_schema_mismatch/);
});

test("trainer rejects non-finite features and unsafe numerical configuration", () => {
  const invalid = rows(0, 60);
  invalid[0].features.home_signal.value = Number.NaN;
  assert.throws(() => train({ trainingRows: invalid }), /training_feature_provenance_invalid/);
  assert.throws(() => train({ config: { learningRate: 2, epochs: 500, l2: 0.001 } }), /training_config_invalid/);
  const unsettled = rows(0, 60);
  unsettled[0].labelAvailableAt = "2025-12-31T23:00:00.000Z";
  assert.throws(() => train({ trainingRows: unsettled }), /training_label_availability_invalid/);
  const leaked = rows(0, 60);
  leaked[0].features.home_signal.availableAt = leaked[0].eventStart;
  assert.throws(() => train({ trainingRows: leaked }), /training_feature_provenance_invalid/);
  const impossibleDate = rows(0, 60);
  impossibleDate[0].eventStart = "2026-02-30T00:00:00.000Z";
  assert.throws(() => train({ trainingRows: impossibleDate }), /training_label_availability_invalid/);
});

test("prediction rejects modified artifacts and incompatible feature vectors", () => {
  const result = train();
  const altered = structuredClone(result.artifact);
  altered.weights[0][0] += 0.25;
  assert.throws(() => predictWinMLFootball1X2(altered, {
    home_signal: 1, draw_signal: 0, away_signal: 0
  }), /model_artifact_hash_mismatch/);
  assert.throws(() => predictWinMLFootball1X2(result.artifact, {
    home_signal: 1, draw_signal: 0
  }), /prediction_feature_schema_mismatch/);
  const changedSplit = structuredClone(result.artifact);
  changedSplit.splitManifest.trainingEventIds[0] = "changed-event";
  assert.throws(() => predictWinMLFootball1X2(changedSplit, {
    home_signal: 1, draw_signal: 0, away_signal: 0
  }), /model_artifact_split_manifest_hash_mismatch/);
  const changedConfig = structuredClone(result.artifact);
  changedConfig.trainingConfig.l2 += 0.1;
  assert.throws(() => predictWinMLFootball1X2(changedConfig, {
    home_signal: 1, draw_signal: 0, away_signal: 0
  }), /model_artifact_training_config_hash_mismatch/);
});

test("retrospective offline evaluation may be assembled after historical validation events", () => {
  const result = train();
  const heldOut = evaluateWinMLFootball1X2LogisticModel(result.artifact, rows(91, 30), "2027-01-01T00:00:00.000Z");
  const evaluation = buildWinMLFootball1X2EvaluationRecord(result.artifact, heldOut, {
    modelVersion: "0.1.1", trainingRunId: "synthetic-retrospective-run",
    featureBuilderCommitSha: "d".repeat(40), sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-04-01T00:00:00.000Z"
  });
  assert.equal(evaluation.trainedAt, "2026-04-01T00:00:00.000Z");
  assert.equal(evaluation.testRows, 30);
  assert.throws(() => buildWinMLFootball1X2EvaluationRecord(result.artifact, heldOut, {
    modelVersion: "0.1.2", trainingRunId: "synthetic-too-late-run",
    featureBuilderCommitSha: "d".repeat(40), sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-04-03T00:00:00.000Z"
  }), /model_evaluation_chronology_invalid/);
});

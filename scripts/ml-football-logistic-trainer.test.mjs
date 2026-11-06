import test from "node:test";
import assert from "node:assert/strict";
import {
  trainWinMLFootball1X2LogisticModel,
  predictWinMLFootball1X2
} from "../netlify/lib/ml-football-logistic-trainer.mts";

function rows(offset, count) {
  return Array.from({ length: count }, (_, index) => {
    const outcome = ["HOME", "DRAW", "AWAY"][index % 3];
    return {
      eventId: "synthetic-" + (offset + index),
      eventStart: new Date(Date.UTC(2026, 0, 1 + offset + index)).toISOString(),
      labelAvailableAt: new Date(Date.UTC(2026, 0, 1 + offset + index, 6)).toISOString(),
      outcome,
      features: {
        home_signal: outcome === "HOME" ? 1 : 0,
        draw_signal: outcome === "DRAW" ? 1 : 0,
        away_signal: outcome === "AWAY" ? 1 : 0
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

test("trainer is deterministic for identical rows and configuration", () => {
  const first = train();
  const second = train();
  assert.equal(first.artifact.artifactSha256, second.artifact.artifactSha256);
  assert.deepEqual(first.validationMetrics, second.validationMetrics);
});

test("trainer rejects overlapping chronology, duplicate identities and feature schema drift", () => {
  assert.throws(() => train({ validationRows: rows(59, 30) }), /training_validation_chronology_invalid/);
  const duplicated = rows(60, 30);
  duplicated[0].eventId = "synthetic-0";
  assert.throws(() => train({ validationRows: duplicated }), /training_event_identity_missing_or_duplicate/);
  const drifted = rows(60, 30);
  drifted[0].features.extra = 1;
  assert.throws(() => train({ validationRows: drifted }), /training_feature_schema_mismatch/);
});

test("trainer rejects non-finite features and unsafe numerical configuration", () => {
  const invalid = rows(0, 60);
  invalid[0].features.home_signal = Number.NaN;
  assert.throws(() => train({ trainingRows: invalid }), /training_feature_not_finite_numeric/);
  assert.throws(() => train({ config: { learningRate: 2, epochs: 500, l2: 0.001 } }), /training_config_invalid/);
  const unsettled = rows(0, 60);
  unsettled[0].labelAvailableAt = "2025-12-31T23:00:00.000Z";
  assert.throws(() => train({ trainingRows: unsettled }), /training_label_availability_invalid/);
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
});

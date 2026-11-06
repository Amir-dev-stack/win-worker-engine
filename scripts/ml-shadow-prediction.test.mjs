import test from "node:test";
import assert from "node:assert/strict";
import { buildWinMLShadowPrediction, WinMLShadowPredictionError } from "../netlify/lib/ml-shadow-prediction.mts";

const base = {
  predictionRunId: "shadow-run-1",
  eventId: "event-1",
  eventStart: "2027-04-01T19:00:00.000Z",
  predictionCutoff: "2027-04-01T17:00:00.000Z",
  generatedAt: "2027-04-01T17:00:01.000Z",
  modelId: "registered-model",
  modelVersion: "1.0.0",
  features: {
    home_strength: { value: 0.7, availableAt: "2027-04-01T16:00:00.000Z", sourceId: "source-home" },
    away_strength: { value: 0.4, availableAt: "2027-04-01T16:30:00.000Z", sourceId: "source-away" }
  }
};

test("shadow inference rejects kickoff-time and post-kickoff cutoffs before registry access", async () => {
  await assert.rejects(() => buildWinMLShadowPrediction({
    ...base, predictionCutoff: base.eventStart
  }), error => error instanceof WinMLShadowPredictionError && error.code === "shadow_prediction_time_window_invalid");
  await assert.rejects(() => buildWinMLShadowPrediction({
    ...base, generatedAt: "2027-04-01T19:00:01.000Z"
  }), /shadow_prediction_time_window_invalid/);
});

test("shadow inference rejects features unavailable at the declared cutoff", async () => {
  await assert.rejects(() => buildWinMLShadowPrediction({
    ...base,
    features: {
      ...base.features,
      late_news: { value: 1, availableAt: "2027-04-01T17:00:01.000Z", sourceId: "late-source" }
    }
  }), /shadow_prediction_feature_provenance_invalid:late_news/);
});

test("shadow inference rejects missing feature provenance and malformed numeric inputs", async () => {
  await assert.rejects(() => buildWinMLShadowPrediction({
    ...base,
    features: { home_strength: { value: Number.NaN, availableAt: base.predictionCutoff, sourceId: "source" } }
  }), /shadow_prediction_feature_provenance_invalid:home_strength/);
});

test("shadow inference resolves only a registered model identity, never a caller-supplied artifact", async () => {
  await assert.rejects(() => buildWinMLShadowPrediction(base), /shadow_prediction_model_not_registered/);
});

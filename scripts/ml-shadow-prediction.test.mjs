import test from "node:test";
import assert from "node:assert/strict";
import { buildWinMLShadowPrediction, recordWinMLShadowPrediction, WinMLShadowPredictionError } from "../netlify/lib/ml-shadow-prediction.mts";
import { installIsolatedTestStore } from "../netlify/lib/store.mts";

process.env.WIN_STORE_TEST_MODE = "1";
const records = new Map();
installIsolatedTestStore({
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, structuredClone(value));
    return { modified: true };
  },
  async get(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
  async *list() { yield { blobs: [] }; },
  async delete(key) { records.delete(key); },
  async getWithMetadata(key) { return records.has(key) ? { data: structuredClone(records.get(key)), etag: "test-etag" } : null; }
});

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

test("shadow prediction audit refuses caller-forged predictions without a registered model", async () => {
  await assert.rejects(() => recordWinMLShadowPrediction({
    contractVersion: "win.ml.prediction.v1",
    origin: "trained_model",
    usage: "shadow_only",
    predictionRunId: "forged-run",
    eventId: "event-1",
    eventStart: base.eventStart,
    predictionCutoff: base.predictionCutoff,
    generatedAt: base.generatedAt,
    sport: "association_football",
    market: "1x2",
    modelId: "unregistered-model",
    modelVersion: "1.0.0",
    algorithm: "logistic_regression",
    artifactSha256: "a".repeat(64),
    datasetId: "dataset-1",
    datasetContentSha256: "b".repeat(64),
    featureSchemaVersion: "schema-v1",
    featureVectorSha256: "c".repeat(64),
    probabilities: { home: 0.4, draw: 0.3, away: 0.3 }
  }), /shadow_prediction_model_not_registered/);
});

test("shadow inference rejects impossible calendar dates", async () => {
  await assert.rejects(() => buildWinMLShadowPrediction({
    ...base, eventStart: "2027-02-30T19:00:00.000Z"
  }), /shadow_prediction_time_window_invalid/);
});

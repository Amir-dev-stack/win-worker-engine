import test from "node:test";
import assert from "node:assert/strict";
import { bindWinMLShadowPredictionToBlendInput } from "../netlify/lib/ml-market-anchored-blend-verified.mts";

const modelId = "registered-model";
const modelVersion = "1.0.0";
const artifactSha256 = "a".repeat(64);
const datasetContentSha256 = "b".repeat(64);
const featureVectorSha256 = "c".repeat(64);
const predictionRunId = "shadow-run-verified";
const event = {
  eventId: "event-1",
  kickoff: "2027-04-01T19:00:00.000Z",
  predictionCutoff: "2027-04-01T17:00:00.000Z"
};
const generatedAt = "2027-04-01T17:00:01.000Z";
const trainedAt = "2027-03-01T07:00:00.000Z";
const prediction = {
  predictionRunId,
  modelId,
  modelVersion,
  artifactSha256,
  datasetContentSha256,
  eventId: event.eventId,
  eventStart: event.kickoff,
  predictionCutoff: event.predictionCutoff,
  generatedAt,
  featureVectorSha256,
  probabilities: { home: 0.41, draw: 0.30, away: 0.29 }
};
const model = {
  artifact: { modelId, artifactSha256 },
  evaluation: { modelVersion, trainedAt }
};
const evidence = { datasetContentSha256 };
function fixture() {
  return {
    input: {
      event,
      market: {
        eventId: event.eventId,
        at: "2027-04-01T16:55:00.000Z",
        sourceId: "approved-market-source",
        snapshotId: "snapshot-1",
        decimalOdds: { home: 2.2, draw: 3.3, away: 3.5 }
      },
      model: {
        eventId: event.eventId,
        at: generatedAt,
        modelId,
        trainedAt,
        artifactSha256,
        datasetContentSha256,
        featureVectorSha256,
        probabilities: { home: 0.8, draw: 0.1, away: 0.1 }
      }
    },
    prediction,
    predictionRunId,
    model,
    evidence
  };
}

test("verified blend replaces caller probabilities with the registered shadow prediction", () => {
  const args = fixture();
  const bound = bindWinMLShadowPredictionToBlendInput(args);
  assert.deepEqual(bound.model.probabilities, prediction.probabilities);
  assert.notDeepEqual(bound.model.probabilities, args.input.model.probabilities);
  assert.deepEqual(args.input.model.probabilities, { home: 0.8, draw: 0.1, away: 0.1 });
});

test("verified blend rejects event, cutoff, model and feature provenance drift", () => {
  const args = fixture();
  assert.throws(() => bindWinMLShadowPredictionToBlendInput({
    ...args, input: { ...args.input, event: { ...event, eventId: "other-event" } }
  }), /market_blend_registered_shadow_prediction_binding_mismatch/);
  assert.throws(() => bindWinMLShadowPredictionToBlendInput({
    ...args, input: { ...args.input, model: { ...args.input.model, featureVectorSha256: "d".repeat(64) } }
  }), /market_blend_registered_shadow_prediction_binding_mismatch/);
  assert.throws(() => bindWinMLShadowPredictionToBlendInput({
    ...args, prediction: { ...prediction, modelVersion: "2.0.0" }
  }), /market_blend_registered_shadow_prediction_binding_mismatch/);
  assert.throws(() => bindWinMLShadowPredictionToBlendInput({
    ...args, predictionRunId: "different-run"
  }), /market_blend_registered_shadow_prediction_binding_mismatch/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { assertWinMarketCohortMatchesModel, WinMarketEvaluationError } from "../netlify/lib/win-market-evaluation-registry.mts";
import { hashWinMLProvenance } from "../netlify/lib/ml-provenance.mts";

function fixture() {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    eventId: "fixture-event-" + index,
    kickoffAt: "2026-06-01T18:00:00.000Z",
    predictionCutoff: "2026-06-01T17:00:00.000Z",
    marketSnapshotAt: "2026-06-01T16:55:00.000Z",
    resultAvailableAt: "2026-06-01T20:00:00.000Z",
    probabilities: [0.5, 0.25, 0.25],
    outcome: index % 3 === 0 ? "home" : index % 3 === 1 ? "draw" : "away"
  }));
  const testEventIds = rows.map(row => row.eventId);
  const evaluation = {
    market: "1x2",
    testRows: rows.length,
    testEventIds,
    testCohortSha256: hashWinMLProvenance([...testEventIds].sort()).sha256,
    testEventCutoffs: rows.map(row => ({ eventId: row.eventId, predictionCutoff: row.predictionCutoff }))
  };
  return { rows, evaluation };
}

test("market benchmark requires exact registered held-out event identities and cutoffs", () => {
  const { rows, evaluation } = fixture();
  assert.doesNotThrow(() => assertWinMarketCohortMatchesModel(rows, evaluation));
});

test("market benchmark rejects a different event cohort even at the same sample size", () => {
  const { rows, evaluation } = fixture();
  const changed = rows.map((row, index) => index === 99 ? { ...row, eventId: "another-event" } : row);
  assert.throws(() => assertWinMarketCohortMatchesModel(changed, evaluation), error =>
    error instanceof WinMarketEvaluationError && error.code === "market_evaluation_model_cohort_mismatch"
  );
});

test("market benchmark rejects per-event prediction cutoff drift", () => {
  const { rows, evaluation } = fixture();
  const changed = rows.map((row, index) => index === 20
    ? { ...row, predictionCutoff: "2026-06-01T16:00:00.000Z" }
    : row);
  assert.throws(() => assertWinMarketCohortMatchesModel(changed, evaluation), error =>
    error instanceof WinMarketEvaluationError && error.code === "market_evaluation_prediction_cutoff_mismatch"
  );
});

test("market benchmark rejects duplicate model cutoff identities and malformed cutoff timestamps", () => {
  const { rows, evaluation } = fixture();
  const duplicate = { ...evaluation, testEventCutoffs: [...evaluation.testEventCutoffs] };
  duplicate.testEventCutoffs[99] = { ...duplicate.testEventCutoffs[0] };
  assert.throws(() => assertWinMarketCohortMatchesModel(rows, duplicate), /market_evaluation_model_cutoffs_invalid/);
  const malformed = { ...evaluation, testEventCutoffs: evaluation.testEventCutoffs.map((item, index) =>
    index === 0 ? { ...item, predictionCutoff: "2026-02-31T17:00:00.000Z" } : item
  ) };
  assert.throws(() => assertWinMarketCohortMatchesModel(rows, malformed), /market_evaluation_model_cutoffs_invalid/);
});

import { installIsolatedTestStore, remove, put } from "../netlify/lib/store.mts";
import { registerWinMLDatasetManifest } from "../netlify/lib/ml-dataset-registry.mts";
import { registerWinMLModelArtifact } from "../netlify/lib/ml-model-artifact-registry.mts";
import { getWinMLMarketBlendEvaluationEvidence } from "../netlify/lib/ml-market-blend-evidence.mts";
import { calculateWinMLMarketAnchoredBlendWithRegisteredEvidence } from "../netlify/lib/ml-market-anchored-blend-verified.mts";
import {
  registerWinMarketEvaluation,
  getWinMarketEvaluation
} from "../netlify/lib/win-market-evaluation-registry.mts";
import {
  trainWinMLFootball1X2LogisticModel,
  evaluateWinMLFootball1X2LogisticModel,
  buildWinMLFootball1X2EvaluationRecord
} from "../netlify/lib/ml-football-logistic-trainer.mts";

const storeValues = new Map();
const testStore = {
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && storeValues.has(key)) return { modified: false };
    storeValues.set(key, structuredClone(value));
    return { modified: true };
  },
  async get(key) { return storeValues.has(key) ? structuredClone(storeValues.get(key)) : null; },
  async *list() { yield { blobs: [] }; },
  async delete(key) { storeValues.delete(key); },
  async getWithMetadata(key) { return storeValues.has(key) ? { data: structuredClone(storeValues.get(key)), etag: "market-test-etag" } : null; }
};
process.env.WIN_STORE_TEST_MODE = "1";
installIsolatedTestStore(testStore);

function trainingRows(offset, count) {
  return Array.from({ length: count }, (_, index) => {
    const outcome = ["HOME", "DRAW", "AWAY"][index % 3];
    const eventStart = new Date(Date.UTC(2026, 0, 1 + offset + index)).toISOString();
    const predictionCutoff = new Date(Date.parse(eventStart) - 60 * 60 * 1000).toISOString();
    const availableAt = new Date(Date.parse(eventStart) - 2 * 60 * 60 * 1000).toISOString();
    const feature = value => ({ value, availableAt, sourceId: "market-synthetic-source-" + (offset + index) });
    return {
      eventId: "market-synthetic-event-" + (offset + index),
      eventStart, predictionCutoff,
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

test("market evaluation registry binds immutable market scores to the registered ML artifact and exact held-out cohort", async () => {
  const modelId = "market-registry-model";
  const modelVersion = "0.1.0";
  const datasetId = "market-registry-dataset";
  const evaluationId = "market-registry-evaluation";
  await remove("library/ml-model-artifacts", modelId + "::" + modelVersion);
  await remove("library/ml-dataset-manifests", datasetId);
  await remove("library/win-market-evaluations", evaluationId);

  const train = trainWinMLFootball1X2LogisticModel({
    modelId, datasetId, datasetContentSha256: "a".repeat(64),
    featureSchemaVersion: "win.football.form.v1",
    trainingRows: trainingRows(0, 60),
    validationRows: trainingRows(60, 30),
    config: { learningRate: 0.1, epochs: 500, l2: 0.001 }
  });
  const testRows = trainingRows(91, 100);
  const evaluatedAt = "2027-01-03T00:00:00.000Z";
  const heldOut = evaluateWinMLFootball1X2LogisticModel(train.artifact, testRows, evaluatedAt);
  const evaluation = buildWinMLFootball1X2EvaluationRecord(train.artifact, heldOut, {
    modelVersion, trainingRunId: "market-synthetic-run",
    featureBuilderCommitSha: "d".repeat(40), sourceCommitSha: "e".repeat(40),
    trainedAt: "2026-03-01T07:00:00.000Z"
  });
  await registerWinMLDatasetManifest({
    manifestVersion: "win.ml.dataset.v1", datasetId, providerId: "synthetic",
    sport: "association_football", competition: "synthetic", season: "2026",
    sourceUrl: "https://example.test/synthetic", licenceId: "synthetic-research",
    attributionRequired: false, automationAllowed: false, approvedForTraining: false,
    permittedUse: "research_only", rowGrain: "match", eventTimePrecision: "instant",
    retrievedAt: "2027-01-02T00:00:00.000Z", rowCount: 190, labeledRowCount: 190,
    schemaVersion: "synthetic.v1", contentSha256: "a".repeat(64)
  });
  await registerWinMLModelArtifact({
    artifact: train.artifact, evaluation, testRows, evaluatedAt,
    registeredAt: "2027-01-03T00:00:00.000Z"
  });

  const marketRows = testRows.map((row, index) => ({
    eventId: row.eventId,
    kickoffAt: row.eventStart,
    predictionCutoff: row.predictionCutoff,
    marketSnapshotAt: new Date(Date.parse(row.predictionCutoff) - 5 * 60 * 1000).toISOString(),
    resultAvailableAt: row.labelAvailableAt,
    sourceRecordId: "source-row-" + index,
    probabilities: [0.5, 0.25, 0.25],
    outcome: row.outcome.toLowerCase()
  }));
  const args = {
    evaluationId, modelId, modelVersion,
    sourceId: "hf-minmaxxxer-epl-2025-26",
    sourceRevision: "f".repeat(40),
    evaluatedAt,
    testRows: marketRows
  };
  await assert.rejects(
    () => registerWinMarketEvaluation(args),
    /market_evaluation_source_dataset_binding_invalid/
  );
  const sourceRecords = marketRows.map((row, index) => ({
    id: row.sourceRecordId,
    providerId: args.sourceId,
    sport: "football",
    marketDataType: "consensus_market_lines",
    status: "completed",
    eventStart: row.kickoffAt,
    homeScore: row.outcome === "home" ? 2 : row.outcome === "draw" ? 1 : 0,
    awayScore: row.outcome === "away" ? 2 : row.outcome === "draw" ? 1 : 0,
    closing: {
      marketSnapshotAt: row.marketSnapshotAt,
      marketSnapshotTimestampStatus: "source_timestamp",
      homeWinProbability: row.probabilities[0],
      drawProbability: row.probabilities[1],
      awayWinProbability: row.probabilities[2]
    }
  }));
  await put("library/model-lab/market-consensus-datasets", "consensus-" + args.sourceId, {
    providerId: args.sourceId,
    sourceRevision: args.sourceRevision,
    rawChecksum: "e".repeat(64),
    totalRows: sourceRecords.length,
    records: sourceRecords,
    recordsSha256: hashWinMLProvenance(sourceRecords).sha256,
    marketDataType: "consensus_market_lines",
    origin: "provider_historical_data"
  });
  const first = await registerWinMarketEvaluation(args);
  assert.equal(first.registered, true);
  assert.equal(first.record.modelArtifactSha256, train.artifact.artifactSha256);
  assert.equal(first.record.modelEvaluationSha256, hashWinMLProvenance(evaluation).sha256);
  assert.equal(first.record.testRows, 100);
  const retry = await registerWinMarketEvaluation(args);
  assert.equal(retry.idempotent, true);
  const loaded = await getWinMarketEvaluation(evaluationId);
  assert.equal(loaded.recordSha256, first.record.recordSha256);
  assert.equal(loaded.datasetContentSha256, train.artifact.datasetContentSha256);

  const rejectSourceMutation = async (suffix, mutate, expected) => {
    const changedRows = marketRows.map((row, index) => mutate({ ...row }, index));
    await assert.rejects(() => registerWinMarketEvaluation({
      ...args, evaluationId: "market-registry-source-" + suffix, testRows: changedRows
    }), new RegExp(expected));
  };
  await rejectSourceMutation("missing", (row, index) => index === 0 ? { ...row, sourceRecordId: undefined } : row,
    "market_evaluation_source_record_reference_invalid");
  await rejectSourceMutation("duplicate", (row, index) => index === 1
    ? { ...row, sourceRecordId: "source-row-0" } : row,
    "market_evaluation_source_record_reference_invalid");
  await rejectSourceMutation("kickoff", (row, index) => index === 0
    ? { ...row, kickoffAt: "2026-06-01T19:00:00.000Z" } : row,
    "market_evaluation_source_record_binding_mismatch");
  await rejectSourceMutation("snapshot", (row, index) => index === 0
    ? { ...row, marketSnapshotAt: "2026-06-01T16:54:00.000Z" } : row,
    "market_evaluation_source_record_binding_mismatch");
  await rejectSourceMutation("probabilities", (row, index) => index === 0
    ? { ...row, probabilities: [0.49, 0.26, 0.25] } : row,
    "market_evaluation_source_record_probabilities_mismatch");
  await rejectSourceMutation("outcome", (row, index) => index === 0
    ? { ...row, outcome: "away" } : row,
    "market_evaluation_source_record_outcome_mismatch");
  const blendEvidence = await getWinMLMarketBlendEvaluationEvidence({
    modelId, modelVersion, marketEvaluationId: evaluationId
  });
  assert.equal(blendEvidence.testRows, 100);
  assert.equal(blendEvidence.testCohortSha256, blendEvidence.marketTestCohortSha256);
  assert.equal(blendEvidence.marketEvaluationId, evaluationId);

  const sample = testRows[0];
  const verifiedBlend = await calculateWinMLMarketAnchoredBlendWithRegisteredEvidence({
    modelId, modelVersion, marketEvaluationId: evaluationId,
    input: {
      event: {
        eventId: sample.eventId,
        kickoff: sample.eventStart,
        predictionCutoff: sample.predictionCutoff
      },
      market: {
        eventId: sample.eventId,
        at: new Date(Date.parse(sample.predictionCutoff) - 5 * 60 * 1000).toISOString(),
        sourceId: args.sourceId,
        snapshotId: "synthetic-snapshot-001",
        decimalOdds: { home: 2.1, draw: 3.4, away: 3.8 }
      },
      model: {
        eventId: sample.eventId,
        at: new Date(Date.parse(sample.predictionCutoff) - 2 * 60 * 1000).toISOString(),
        modelId,
        trainedAt: "2026-03-01T07:00:00.000Z",
        artifactSha256: train.artifact.artifactSha256,
        datasetContentSha256: train.artifact.datasetContentSha256,
        featureVectorSha256: "c".repeat(64),
        probabilities: { home: 0.52, draw: 0.25, away: 0.23 }
      },
      // Deliberately forged caller metrics must be overwritten by registry evidence.
      evaluation: {
        modelEvaluationId: "forged-caller-evaluation",
        marketEvaluationId: "forged-caller-market",
        testCohortSha256: "0".repeat(64),
        marketTestCohortSha256: "0".repeat(64),
        datasetContentSha256: "0".repeat(64),
        marketDataSha256: "0".repeat(64),
        testRows: 100,
        modelLogLoss: 0.01,
        marketLogLoss: 10,
        modelBrier: 0.01,
        marketBrier: 1,
        expectedCalibrationError: 0,
        testLabelsAvailableAt: "2026-01-01T00:00:00.000Z",
        evaluationAsOf: "2027-01-03T00:00:00.000Z"
      }
    }
  });
  if (verifiedBlend.status === "research_only") {
    assert.notEqual(verifiedBlend.evidence.modelEvaluationId, "forged-caller-evaluation");
    assert.equal(verifiedBlend.evidence.marketEvaluationId, evaluationId);
    assert.equal(verifiedBlend.evidence.testRows, blendEvidence.testRows);
  } else {
    assert.equal(verifiedBlend.status, "blocked");
    assert.equal(verifiedBlend.probabilities, null);
  }

  const tamperedSourceRecords = sourceRecords.map((record, index) => index === 0
    ? { ...record, closing: { ...record.closing, homeWinProbability: 0.51 } }
    : record);
  await put("library/model-lab/market-consensus-datasets", "consensus-" + args.sourceId, {
    providerId: args.sourceId,
    sourceRevision: args.sourceRevision,
    rawChecksum: "e".repeat(64),
    totalRows: tamperedSourceRecords.length,
    records: tamperedSourceRecords,
    recordsSha256: hashWinMLProvenance(sourceRecords).sha256,
    marketDataType: "consensus_market_lines",
    origin: "provider_historical_data"
  });
  await assert.rejects(() => getWinMarketEvaluation(evaluationId),
    /market_evaluation_source_dataset_binding_mismatch/);
});

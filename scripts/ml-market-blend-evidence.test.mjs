import test from "node:test";
import assert from "node:assert/strict";
import { hashWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import {
  composeWinMLMarketBlendEvaluationEvidence,
  WinMLMarketBlendEvidenceError
} from "../netlify/lib/ml-market-blend-evidence.mts";

function fixture() {
  const evaluation = {
      modelId: "fixture-model",
      modelVersion: "1.0.0",
      datasetId: "fixture-dataset",
      datasetContentSha256: "c".repeat(64),
      testCohortSha256: "d".repeat(64),
      testRows: 120,
      modelMetrics: { brier: 0.18, logLoss: 0.52 },
      expectedCalibrationError: 0.03,
      testWindow: { from: "2026-04-01T00:00:00.000Z", to: "2026-06-01T20:00:00.000Z" },
      artifactSha256: "a".repeat(64)
  };
  const model = {
    artifact: { artifactSha256: "a".repeat(64) },
    provenance: { evaluationSha256: hashWinMLProvenance(evaluation).sha256 },
    evaluation
  };
  const payload = {
    version: "win.market.evaluation.v3",
    evaluationId: "fixture-market-evaluation",
    modelId: "fixture-model",
    modelVersion: "1.0.0",
    modelArtifactSha256: "a".repeat(64),
    modelEvaluationSha256: model.provenance.evaluationSha256,
    datasetId: "fixture-dataset",
    datasetContentSha256: "c".repeat(64),
    sourceId: "fixture-market-source",
    sourceRevision: "e".repeat(40),
    sourceDatasetId: "consensus-fixture-market-source",
    sourceDatasetSha256: "b".repeat(64),
    sourceDatasetRecordsSha256: "c".repeat(64),
    evaluatedAt: "2026-06-02T00:00:00.000Z",
    testEventIdsSha256: "d".repeat(64),
    testRowsSha256: "f".repeat(64),
    testRows: 120,
    metrics: { brier: 0.20, logLoss: 0.58, expectedCalibrationError: 0.04 }
  };
  const market = { ...payload, recordSha256: hashWinMLProvenance(payload).sha256 };
  return { model, market };
}

test("blend evidence is composed from matching immutable model and market records", () => {
  const { model, market } = fixture();
  const evidence = composeWinMLMarketBlendEvaluationEvidence(model, market);
  assert.equal(evidence.modelEvaluationId, "fixture-model::1.0.0");
  assert.equal(evidence.marketEvaluationId, "fixture-market-evaluation");
  assert.equal(evidence.testCohortSha256, evidence.marketTestCohortSha256);
  assert.equal(evidence.modelLogLoss, 0.52);
  assert.equal(evidence.marketLogLoss, 0.58);
  assert.equal(evidence.testRows, 120);
  assert.equal(evidence.testLabelsAvailableAt, "2026-06-01T20:00:00.000Z");
});

test("blend evidence rejects a market report from another held-out cohort", () => {
  const { model, market } = fixture();
  const payload = { ...market, testEventIdsSha256: "9".repeat(64) };
  const { recordSha256, ...withoutHash } = payload;
  const changed = { ...withoutHash, recordSha256: hashWinMLProvenance(withoutHash).sha256 };
  assert.throws(() => composeWinMLMarketBlendEvaluationEvidence(model, changed),
    error => error instanceof WinMLMarketBlendEvidenceError && error.code === "market_blend_evidence_binding_mismatch");
});

test("blend evidence rejects dataset and model artifact drift", () => {
  const { model, market } = fixture();
  assert.throws(() => composeWinMLMarketBlendEvaluationEvidence({
    ...model, artifact: { artifactSha256: "9".repeat(64) }
  }, market), /market_blend_model_evaluation_hash_mismatch/);
  const changedEvaluation = { ...model.evaluation, datasetContentSha256: "8".repeat(64) };
  const changedModel = {
    ...model,
    evaluation: changedEvaluation,
    provenance: { ...model.provenance, evaluationSha256: hashWinMLProvenance(changedEvaluation).sha256 }
  };
  assert.throws(() => composeWinMLMarketBlendEvaluationEvidence(changedModel, market),
    /market_blend_evidence_binding_mismatch/);
});

test("blend evidence cannot be evaluated before all held-out labels are available", () => {
  const { model, market } = fixture();
  const payload = { ...market, evaluatedAt: "2026-06-01T19:59:59.000Z" };
  const { recordSha256, ...withoutHash } = payload;
  const changed = { ...withoutHash, recordSha256: hashWinMLProvenance(withoutHash).sha256 };
  assert.throws(() => composeWinMLMarketBlendEvaluationEvidence(model, changed),
    error => error instanceof WinMLMarketBlendEvidenceError && error.code === "market_blend_evidence_chronology_invalid");
});

test("blend evidence rejects tampered market metrics even when callers provide no replacement metrics", () => {
  const { model, market } = fixture();
  const payload = { ...market, metrics: { ...market.metrics, logLoss: -1 } };
  const { recordSha256, ...withoutHash } = payload;
  const changed = { ...withoutHash, recordSha256: hashWinMLProvenance(withoutHash).sha256 };
  assert.throws(() => composeWinMLMarketBlendEvaluationEvidence(model, changed),
    error => error instanceof WinMLMarketBlendEvidenceError && error.code === "market_blend_evidence_record_invalid");
});

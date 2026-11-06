import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import {
  getWinMarketEvaluation,
  verifyWinMarketEvaluationRecord,
  type WinMarketEvaluationRecord
} from "./win-market-evaluation-registry.mts";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export type WinMLMarketBlendEvaluationEvidence = {
  modelEvaluationId: string;
  marketEvaluationId: string;
  testCohortSha256: string;
  marketTestCohortSha256: string;
  datasetContentSha256: string;
  marketDataSha256: string;
  testRows: number;
  modelLogLoss: number;
  marketLogLoss: number;
  modelBrier: number;
  marketBrier: number;
  expectedCalibrationError: number;
  testLabelsAvailableAt: string;
  evaluationAsOf: string;
};

export class WinMLMarketBlendEvidenceError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "WinMLMarketBlendEvidenceError"; this.code = code; }
}

/** Joins only verified immutable records; caller-supplied metric values are never accepted. */
export function composeWinMLMarketBlendEvaluationEvidence(
  model: Awaited<ReturnType<typeof getWinMLModelArtifact>>,
  market: WinMarketEvaluationRecord
): WinMLMarketBlendEvaluationEvidence {
  if (!model || !market || !verifyWinMarketEvaluationRecord(market)) {
    throw new WinMLMarketBlendEvidenceError("market_blend_evidence_record_invalid");
  }
  const evaluation = model.evaluation;
  const labelsAvailableAt = evaluation?.testWindow?.to;
  if (market.modelId !== evaluation?.modelId ||
      market.modelVersion !== evaluation?.modelVersion ||
      market.modelArtifactSha256 !== model.artifact.artifactSha256 ||
      market.modelEvaluationSha256 !== model.provenance.evaluationSha256 ||
      market.datasetId !== evaluation.datasetId ||
      market.datasetContentSha256 !== evaluation.datasetContentSha256 ||
      market.testEventIdsSha256 !== evaluation.testCohortSha256 ||
      market.testRows !== evaluation.testRows) {
    throw new WinMLMarketBlendEvidenceError("market_blend_evidence_binding_mismatch");
  }
  if (!isStrictIsoTimestamp(labelsAvailableAt) || !isStrictIsoTimestamp(market.evaluatedAt) ||
      Date.parse(market.evaluatedAt) < Date.parse(labelsAvailableAt)) {
    throw new WinMLMarketBlendEvidenceError("market_blend_evidence_chronology_invalid");
  }
  const metrics = [
    evaluation.modelMetrics?.logLoss, evaluation.modelMetrics?.brier,
    market.metrics.logLoss, market.metrics.brier,
    evaluation.expectedCalibrationError
  ];
  if (metrics.some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0) ||
      evaluation.expectedCalibrationError > 1) {
    throw new WinMLMarketBlendEvidenceError("market_blend_evidence_metrics_invalid");
  }
  return {
    modelEvaluationId: evaluation.modelId + "::" + evaluation.modelVersion,
    marketEvaluationId: market.evaluationId,
    testCohortSha256: evaluation.testCohortSha256,
    marketTestCohortSha256: market.testEventIdsSha256,
    datasetContentSha256: evaluation.datasetContentSha256,
    marketDataSha256: market.testRowsSha256,
    testRows: evaluation.testRows,
    modelLogLoss: evaluation.modelMetrics.logLoss,
    marketLogLoss: market.metrics.logLoss,
    modelBrier: evaluation.modelMetrics.brier,
    marketBrier: market.metrics.brier,
    expectedCalibrationError: evaluation.expectedCalibrationError,
    testLabelsAvailableAt: labelsAvailableAt,
    evaluationAsOf: market.evaluatedAt
  };
}

/** Loads both registries and composes the only supported evidence payload for the blend helper. */
export async function getWinMLMarketBlendEvaluationEvidence(args: {
  modelId: string;
  modelVersion: string;
  marketEvaluationId: string;
}) {
  const { modelId, modelVersion, marketEvaluationId } = args || ({} as any);
  const [model, market] = await Promise.all([
    getWinMLModelArtifact(modelId, modelVersion),
    getWinMarketEvaluation(marketEvaluationId)
  ]);
  if (!model) throw new WinMLMarketBlendEvidenceError("market_blend_model_artifact_missing");
  if (!market) throw new WinMLMarketBlendEvidenceError("market_blend_market_evaluation_missing");
  return composeWinMLMarketBlendEvaluationEvidence(model, market);
}

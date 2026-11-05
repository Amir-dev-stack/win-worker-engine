import {
  evaluateWinMLPromotionReadiness,
  type WinMLModelEvaluationV1
} from "./ml-model-contract.mts";
import type { WinMLDatasetManifestV1 } from "./ml-data-contract.mts";

export const WIN_ML_PREDICTION_VERSION = "win.ml.prediction.v1" as const;

/**
 * A model-origin prediction envelope. This contract intentionally supports
 * shadow evaluation only; it cannot authorize a production recommendation.
 */
export type WinMLPredictionV1 = {
  contractVersion: typeof WIN_ML_PREDICTION_VERSION;
  origin: "trained_model";
  usage: "shadow_only";
  predictionRunId: string;
  eventId: string;
  eventStart: string;
  predictionCutoff: string;
  generatedAt: string;
  sport: string;
  market: "1x2";
  modelId: string;
  modelVersion: string;
  algorithm: "logistic_regression" | "catboost";
  artifactSha256: string;
  datasetId: string;
  datasetContentSha256: string;
  featureSchemaVersion: string;
  featureVectorSha256: string;
  probabilities: { home: number; draw: number; away: number };
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function timestamp(value: unknown): number | null {
  if (!nonEmpty(value) ||
      !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

/**
 * Validates the identity and timing envelope against an evaluated artifact.
 * This is not proof that the artifact executed: the inference runtime must
 * compute the feature-vector hash and only emit this envelope after inference.
 */
export function validateWinMLPrediction(
  manifest: WinMLDatasetManifestV1,
  evaluation: WinMLModelEvaluationV1,
  prediction: WinMLPredictionV1
) {
  const reasons: string[] = [];
  const readiness = evaluateWinMLPromotionReadiness(manifest, evaluation);
  if (readiness.status !== "eligible_for_human_shadow_review") {
    reasons.push("prediction_model_evaluation_not_eligible");
  }
  if (!prediction || prediction.contractVersion !== WIN_ML_PREDICTION_VERSION) {
    reasons.push("prediction_contract_version_invalid");
  }
  if (prediction?.origin !== "trained_model") reasons.push("prediction_origin_not_trained_model");
  if (prediction?.usage !== "shadow_only") reasons.push("prediction_usage_must_be_shadow_only");
  for (const [field, value] of Object.entries({
    predictionRunId: prediction?.predictionRunId,
    eventId: prediction?.eventId,
    modelId: prediction?.modelId,
    modelVersion: prediction?.modelVersion,
    sport: prediction?.sport
  })) if (!nonEmpty(value)) reasons.push(field + "_required");

  if (prediction?.market !== "1x2") reasons.push("prediction_market_unsupported");
  if (prediction?.modelId !== evaluation?.modelId ||
      prediction?.modelVersion !== evaluation?.modelVersion ||
      prediction?.algorithm !== evaluation?.algorithm) reasons.push("prediction_model_identity_mismatch");
  if (prediction?.sport !== evaluation?.sport || prediction?.sport !== manifest?.sport) {
    reasons.push("prediction_sport_mismatch");
  }
  if (prediction?.market !== evaluation?.market) reasons.push("prediction_market_mismatch");
  if (prediction?.artifactSha256 !== evaluation?.artifactSha256 ||
      prediction?.datasetId !== evaluation?.datasetId ||
      prediction?.datasetContentSha256 !== evaluation?.datasetContentSha256 ||
      prediction?.featureSchemaVersion !== evaluation?.featureSchemaVersion) {
    reasons.push("prediction_provenance_mismatch");
  }
  if (!sha256(prediction?.featureVectorSha256)) reasons.push("prediction_feature_vector_hash_invalid");

  const eventStart = timestamp(prediction?.eventStart);
  const cutoff = timestamp(prediction?.predictionCutoff);
  const generatedAt = timestamp(prediction?.generatedAt);
  const trainedAt = timestamp(evaluation?.trainedAt);
  if ([eventStart, cutoff, generatedAt, trainedAt].some(value => value === null)) {
    reasons.push("prediction_timestamps_invalid");
  } else {
    if (cutoff! >= eventStart!) reasons.push("prediction_cutoff_must_precede_event");
    if (generatedAt! < cutoff!) reasons.push("prediction_generated_before_cutoff");
    if (generatedAt! >= eventStart!) reasons.push("prediction_generated_at_or_after_event_start");
    if (generatedAt! < trainedAt!) reasons.push("prediction_generated_before_model_training");
  }

  const probabilities = prediction?.probabilities;
  const values = [probabilities?.home, probabilities?.draw, probabilities?.away];
  if (values.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) {
    reasons.push("prediction_probabilities_invalid");
  } else if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) {
    reasons.push("prediction_probabilities_not_normalized");
  }

  return {
    contractVersion: WIN_ML_PREDICTION_VERSION,
    status: reasons.length ? "blocked" : "eligible_for_shadow_only",
    productionUseAllowed: false,
    automatedBettingAllowed: false,
    reasons: [...new Set(reasons)],
    warning: "A valid envelope is not proof that the artifact executed or that probabilities are profitable. Preserve inference logs and independently verify artifact and feature hashes."
  };
}

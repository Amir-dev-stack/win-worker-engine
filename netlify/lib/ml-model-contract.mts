import {
  evaluateWinMLDatasetReadiness,
  type WinMLDatasetManifestV1
} from "./ml-data-contract.mts";

export const WIN_ML_MODEL_EVALUATION_VERSION = "win.ml.model.evaluation.v1" as const;

export type WinMLModelEvaluationV1 = {
  evaluationVersion: typeof WIN_ML_MODEL_EVALUATION_VERSION;
  modelId: string;
  modelVersion: string;
  sport: string;
  market: "1x2" | "total_goals";
  algorithm: "logistic_regression" | "poisson_attack_defence" | "catboost";
  datasetId: string;
  datasetContentSha256: string;
  featureSchemaVersion: string;
  featureNames: string[];
  targetDefinition: string;
  trainingWindow: { from: string; to: string };
  validationWindow: { from: string; to: string };
  testWindow: { from: string; to: string };
  trainedAt: string;
  fitDataCutoff: string;
  trainingRows: number;
  validationRows: number;
  testRows: number;
  baselineMetrics: { brier: number; logLoss: number };
  modelMetrics: { brier: number; logLoss: number };
  expectedCalibrationError: number;
  artifactSha256: string;
  sourceCommitSha: string;
};

export type WinMLPromotionGateOptions = {
  minimumTrainingRows?: number;
  minimumValidationRows?: number;
  minimumTestRows?: number;
  minimumRelativeBrierImprovement?: number;
  maximumExpectedCalibrationError?: number;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function timestamp(value: unknown): number | null {
  if (!nonEmpty(value)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}
function metric(value: unknown, max = Number.POSITIVE_INFINITY): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

/**
 * Validates a frozen, out-of-sample evaluation record. A passing result only
 * qualifies an artifact for human shadow-review; it never auto-promotes it.
 */
export function evaluateWinMLPromotionReadiness(
  manifest: WinMLDatasetManifestV1,
  evaluation: WinMLModelEvaluationV1,
  options: WinMLPromotionGateOptions = {}
) {
  const reasons: string[] = [];
  const datasetReadiness = evaluateWinMLDatasetReadiness(manifest);
  reasons.push(...datasetReadiness.reasons.map(reason => "dataset_" + reason));

  const minimumTrainingRows = options.minimumTrainingRows ?? 500;
  const minimumValidationRows = options.minimumValidationRows ?? 100;
  const minimumTestRows = options.minimumTestRows ?? 100;
  const minimumRelativeBrierImprovement = options.minimumRelativeBrierImprovement ?? 0.01;
  const maximumExpectedCalibrationError = options.maximumExpectedCalibrationError ?? 0.05;

  if (!evaluation || evaluation.evaluationVersion !== WIN_ML_MODEL_EVALUATION_VERSION) reasons.push("unsupported_evaluation_version");
  for (const [field, value] of Object.entries({
    modelId: evaluation?.modelId,
    modelVersion: evaluation?.modelVersion,
    sport: evaluation?.sport,
    featureSchemaVersion: evaluation?.featureSchemaVersion,
    targetDefinition: evaluation?.targetDefinition,
    datasetId: evaluation?.datasetId,
    sourceCommitSha: evaluation?.sourceCommitSha
  })) if (!nonEmpty(value)) reasons.push(field + "_required");

  if (!["1x2", "total_goals"].includes(evaluation?.market)) reasons.push("market_invalid");
  if (!["logistic_regression", "poisson_attack_defence", "catboost"].includes(evaluation?.algorithm)) reasons.push("algorithm_invalid");
  if (!Array.isArray(evaluation?.featureNames) || evaluation.featureNames.length === 0 ||
      evaluation.featureNames.some(name => !nonEmpty(name)) ||
      new Set(evaluation.featureNames).size !== evaluation.featureNames.length) reasons.push("feature_names_invalid");

  if (evaluation?.datasetId !== manifest?.datasetId) reasons.push("dataset_id_mismatch");
  if (!sha256(evaluation?.datasetContentSha256) || evaluation.datasetContentSha256 !== manifest?.contentSha256) {
    reasons.push("dataset_content_hash_mismatch");
  }
  if (!sha256(evaluation?.artifactSha256)) reasons.push("model_artifact_hash_invalid");
  if (!/^[a-f0-9]{40}$/i.test(evaluation?.sourceCommitSha || "")) reasons.push("source_commit_sha_invalid");

  const trainFrom = timestamp(evaluation?.trainingWindow?.from);
  const trainTo = timestamp(evaluation?.trainingWindow?.to);
  const validationFrom = timestamp(evaluation?.validationWindow?.from);
  const validationTo = timestamp(evaluation?.validationWindow?.to);
  const testFrom = timestamp(evaluation?.testWindow?.from);
  const testTo = timestamp(evaluation?.testWindow?.to);
  const trainedAt = timestamp(evaluation?.trainedAt);
  const fitDataCutoff = timestamp(evaluation?.fitDataCutoff);
  if ([trainFrom, trainTo, validationFrom, validationTo, testFrom, testTo, trainedAt, fitDataCutoff].some(value => value === null)) {
    reasons.push("evaluation_timestamps_invalid");
  } else {
    if (!(trainFrom! <= trainTo! && trainTo! < validationFrom! && validationFrom! <= validationTo! &&
          validationTo! < testFrom! && testFrom! <= testTo!)) reasons.push("chronological_split_invalid_or_overlapping");
    if (trainedAt! < trainTo!) reasons.push("model_training_timestamp_precedes_training_data_end");
    if (fitDataCutoff! > trainTo!) reasons.push("fit_data_cutoff_exceeds_training_window");
  }

  for (const [field, value, minimum] of [
    ["trainingRows", evaluation?.trainingRows, minimumTrainingRows],
    ["validationRows", evaluation?.validationRows, minimumValidationRows],
    ["testRows", evaluation?.testRows, minimumTestRows]
  ] as const) {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) reasons.push(field + "_below_minimum");
  }
  const splitRows = Number(evaluation?.trainingRows || 0) +
    Number(evaluation?.validationRows || 0) + Number(evaluation?.testRows || 0);
  if (splitRows > Number(manifest?.labeledRowCount || 0) || splitRows > Number(manifest?.rowCount || 0)) {
    reasons.push("evaluation_rows_exceed_dataset_rows");
  }

  const baselineBrier = evaluation?.baselineMetrics?.brier;
  const modelBrier = evaluation?.modelMetrics?.brier;
  const baselineLogLoss = evaluation?.baselineMetrics?.logLoss;
  const modelLogLoss = evaluation?.modelMetrics?.logLoss;
  if (!metric(baselineBrier, 2) || !metric(modelBrier, 2) ||
      !metric(baselineLogLoss) || !metric(modelLogLoss)) reasons.push("evaluation_metrics_invalid");
  else {
    const relativeBrierImprovement = baselineBrier > 0 ? (baselineBrier - modelBrier) / baselineBrier : 0;
    if (relativeBrierImprovement < minimumRelativeBrierImprovement) reasons.push("out_of_sample_brier_improvement_insufficient");
    if (modelLogLoss > baselineLogLoss) reasons.push("out_of_sample_log_loss_not_improved");
  }
  if (!metric(evaluation?.expectedCalibrationError, 1) ||
      evaluation.expectedCalibrationError > maximumExpectedCalibrationError) reasons.push("calibration_error_above_limit");

  return {
    evaluationVersion: WIN_ML_MODEL_EVALUATION_VERSION,
    modelId: evaluation?.modelId ?? null,
    status: reasons.length ? "blocked" : "eligible_for_human_shadow_review",
    promotionEligibleForHumanReview: reasons.length === 0,
    automaticPromotionAllowed: false,
    productionPromotionAllowed: false,
    reasons: [...new Set(reasons)],
    thresholds: {
      minimumTrainingRows,
      minimumValidationRows,
      minimumTestRows,
      minimumRelativeBrierImprovement,
      maximumExpectedCalibrationError
    },
    warning: "A passing gate is not proof of a profitable betting edge, calibrated loss probability, representative data, or production safety. Human review and a separate shadow evaluation are mandatory."
  };
}

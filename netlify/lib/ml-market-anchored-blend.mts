import { parseStrictIsoTimestamp } from "./strict-timestamp.mts";
import { createHash } from "node:crypto";

export const WIN_ML_MARKET_BLEND_VERSION = "win.ml.market-anchored-blend.v1" as const;
const MAX_MODEL_WEIGHT = 0.20;
const MAX_MARKET_SNAPSHOT_AGE_MS = 6 * 60 * 60 * 1000;
const MIN_HELD_OUT_ROWS = 100;
const MIN_RELATIVE_MARKET_IMPROVEMENT = 0.01;
const MAX_ECE = 0.05;

type Triple = { home: number; draw: number; away: number };

type Timestamped = { eventId: string; at: string };

export type WinMLMarketBlendInput = {
  event: { eventId: string; kickoff: string; predictionCutoff: string };
  market: Timestamped & {
    sourceId: string;
    snapshotId: string;
    decimalOdds: Triple;
  };
  model: Timestamped & {
    modelId: string;
    trainedAt: string;
    artifactSha256: string;
    datasetContentSha256: string;
    featureVectorSha256: string;
    probabilities: Triple;
  };
  evaluation: {
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
};

function timestamp(value: unknown): number | null {
  return parseStrictIsoTimestamp(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validTriple(value: unknown): value is Triple {
  if (!value || typeof value !== "object") return false;
  const item = value as Triple;
  const values = [item.home, item.draw, item.away];
  return values.every(number =>
    typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 1
  ) && Math.abs(values.reduce((sum, number) => sum + number, 0) - 1) <= 1e-6;
}

function normalize(values: Triple): Triple {
  const total = values.home + values.draw + values.away;
  if (!Number.isFinite(total) || total <= 0) throw new Error("probability_total_invalid");
  return { home: values.home / total, draw: values.draw / total, away: values.away / total };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/**
 * Research-only, market-anchored logarithmic pool for one football 1X2 event.
 * Evaluation metadata must come from independently verified immutable records
 * covering the exact same held-out event cohort. This function cannot verify
 * those external records and deliberately never authorizes production use.
 */
export function calculateWinMLMarketAnchoredBlend(input: WinMLMarketBlendInput) {
  const reasons: string[] = [];
  const event = input?.event;
  const market = input?.market;
  const model = input?.model;
  const evaluation = input?.evaluation;

  const kickoff = timestamp(event?.kickoff);
  const cutoff = timestamp(event?.predictionCutoff);
  const marketAt = timestamp(market?.at);
  const modelAt = timestamp(model?.at);
  const trainedAt = timestamp(model?.trainedAt);
  const labelsAt = timestamp(evaluation?.testLabelsAvailableAt);
  const evaluatedAt = timestamp(evaluation?.evaluationAsOf);

  if (typeof event?.eventId !== "string" || !event.eventId.trim()) reasons.push("event_identity_required");
  if (typeof market?.eventId !== "string" || market.eventId !== event?.eventId ||
      typeof model?.eventId !== "string" || model.eventId !== event?.eventId) reasons.push("event_identity_mismatch");
  if (kickoff === null || cutoff === null || cutoff >= kickoff) reasons.push("prediction_cutoff_invalid");
  if (marketAt === null || cutoff === null || marketAt > cutoff ||
      (marketAt !== null && cutoff !== null && cutoff - marketAt > MAX_MARKET_SNAPSHOT_AGE_MS)) {
    reasons.push("market_snapshot_missing_stale_or_after_cutoff");
  }
  if (modelAt === null || cutoff === null || modelAt > cutoff) reasons.push("model_prediction_after_cutoff");
  if (trainedAt === null || cutoff === null || trainedAt > cutoff) reasons.push("model_trained_after_prediction_cutoff");
  if (typeof market?.sourceId !== "string" || !market.sourceId.trim() ||
      typeof market?.snapshotId !== "string" || !market.snapshotId.trim()) reasons.push("market_source_provenance_required");
  if (typeof model?.modelId !== "string" || !model.modelId.trim() ||
      !hash(model?.artifactSha256) || !hash(model?.datasetContentSha256) ||
      !hash(model?.featureVectorSha256)) reasons.push("model_prediction_provenance_invalid");
  if (!validTriple(model?.probabilities)) reasons.push("model_probabilities_invalid");
  if (!market?.decimalOdds || ![market.decimalOdds.home, market.decimalOdds.draw, market.decimalOdds.away]
      .every(value => typeof value === "number" && Number.isFinite(value) && value > 1 && value <= 1000)) {
    reasons.push("market_decimal_odds_invalid");
  } else {
    const overround = 1 / market.decimalOdds.home + 1 / market.decimalOdds.draw + 1 / market.decimalOdds.away;
    if (overround < 0.90 || overround > 1.35) reasons.push("market_overround_out_of_bounds");
  }
  if (!evaluation || typeof evaluation.modelEvaluationId !== "string" || !evaluation.modelEvaluationId.trim() ||
      typeof evaluation.marketEvaluationId !== "string" || !evaluation.marketEvaluationId.trim() ||
      !hash(evaluation.testCohortSha256) || !hash(evaluation.marketTestCohortSha256) ||
      evaluation.testCohortSha256 !== evaluation.marketTestCohortSha256 ||
      !hash(evaluation.datasetContentSha256) || !hash(evaluation.marketDataSha256) ||
      evaluation.datasetContentSha256 !== model?.datasetContentSha256) {
    reasons.push("held_out_evaluation_provenance_or_cohort_mismatch");
  }
  if (!Number.isSafeInteger(evaluation?.testRows) || evaluation.testRows < MIN_HELD_OUT_ROWS) {
    reasons.push("held_out_evaluation_sample_too_small");
  }
  const metrics = [
    evaluation?.modelLogLoss, evaluation?.marketLogLoss,
    evaluation?.modelBrier, evaluation?.marketBrier,
    evaluation?.expectedCalibrationError
  ];
  if (metrics.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0) ||
      evaluation.modelLogLoss > 20 || evaluation.marketLogLoss > 20 ||
      evaluation.modelBrier > 2 || evaluation.marketBrier > 2 ||
      evaluation.expectedCalibrationError > 1) {
    reasons.push("held_out_evaluation_metrics_invalid");
  } else {
    if (evaluation.modelLogLoss <= 0 || evaluation.marketLogLoss <= 0 ||
        evaluation.modelBrier <= 0 || evaluation.marketBrier <= 0) reasons.push("held_out_evaluation_metrics_invalid");
    if (evaluation.modelLogLoss >= evaluation.marketLogLoss ||
        evaluation.modelBrier >= evaluation.marketBrier) reasons.push("model_does_not_beat_market_on_both_metrics");
    const relativeLogLossImprovement = (evaluation.marketLogLoss - evaluation.modelLogLoss) / evaluation.marketLogLoss;
    const relativeBrierImprovement = (evaluation.marketBrier - evaluation.modelBrier) / evaluation.marketBrier;
    if (relativeLogLossImprovement < MIN_RELATIVE_MARKET_IMPROVEMENT ||
        relativeBrierImprovement < MIN_RELATIVE_MARKET_IMPROVEMENT) {
      reasons.push("market_improvement_below_minimum_threshold");
    }
    if (evaluation.expectedCalibrationError > MAX_ECE) reasons.push("model_calibration_gate_failed");
  }
  if (labelsAt === null || evaluatedAt === null || (labelsAt !== null && evaluatedAt !== null && evaluatedAt < labelsAt)) {
    reasons.push("held_out_labels_not_available_as_of_evaluation");
  }

  const uniqueReasons = [...new Set(reasons)];
  if (uniqueReasons.length) {
    return {
      contractVersion: WIN_ML_MARKET_BLEND_VERSION,
      status: "blocked" as const,
      reasons: uniqueReasons,
      marketProbabilities: null,
      modelWeight: 0,
      probabilities: null,
      productionUseAllowed: false as const,
      automatedBettingAllowed: false as const,
      warning: "This research helper does not verify external evaluation records. Blocked inputs produce no blended probabilities."
    };
  }

  const marketRaw = {
    home: 1 / market.decimalOdds.home,
    draw: 1 / market.decimalOdds.draw,
    away: 1 / market.decimalOdds.away
  };
  const marketProbabilities = normalize(marketRaw);
  const modelProbabilities = normalize(model.probabilities);
  const logLossImprovement = (evaluation.marketLogLoss - evaluation.modelLogLoss) / evaluation.marketLogLoss;
  const brierImprovement = (evaluation.marketBrier - evaluation.modelBrier) / evaluation.marketBrier;
  const conservativeImprovement = Math.min(logLossImprovement, brierImprovement);
  const modelWeight = Math.min(MAX_MODEL_WEIGHT, conservativeImprovement * 3);
  const blended = normalize({
    home: Math.exp((1 - modelWeight) * Math.log(Math.max(1e-12, marketProbabilities.home)) +
      modelWeight * Math.log(Math.max(1e-12, modelProbabilities.home))),
    draw: Math.exp((1 - modelWeight) * Math.log(Math.max(1e-12, marketProbabilities.draw)) +
      modelWeight * Math.log(Math.max(1e-12, modelProbabilities.draw))),
    away: Math.exp((1 - modelWeight) * Math.log(Math.max(1e-12, marketProbabilities.away)) +
      modelWeight * Math.log(Math.max(1e-12, modelProbabilities.away)))
  });

  const evidence = {
    eventId: event.eventId,
    marketSourceId: market.sourceId,
    marketSnapshotId: market.snapshotId,
    modelId: model.modelId,
    modelArtifactSha256: model.artifactSha256,
    featureVectorSha256: model.featureVectorSha256,
    modelEvaluationId: evaluation.modelEvaluationId,
    marketEvaluationId: evaluation.marketEvaluationId,
    testCohortSha256: evaluation.testCohortSha256,
    marketDataSha256: evaluation.marketDataSha256,
    testRows: evaluation.testRows,
    modelWeight,
    maximumModelWeight: MAX_MODEL_WEIGHT,
    modelLogLossImprovement: logLossImprovement,
    modelBrierImprovement: brierImprovement
  };

  return {
    contractVersion: WIN_ML_MARKET_BLEND_VERSION,
    status: "research_only" as const,
    reasons: [] as string[],
    marketProbabilities,
    modelProbabilities,
    modelWeight,
    probabilities: blended,
    evidence,
    evidenceSha256: sha256(evidence),
    productionUseAllowed: false as const,
    automatedBettingAllowed: false as const,
    warning: "Research-only comparison. Verify immutable evaluation records, odds source licensing and exact held-out cohort before use. This output is not a betting recommendation."
  };
}

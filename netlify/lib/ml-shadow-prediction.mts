import { get, putIfNew } from "./store.mts";
import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import { getWinMLDatasetManifest } from "./ml-dataset-registry.mts";
import { predictWinMLFootball1X2 } from "./ml-football-logistic-trainer.mts";
import { validateWinMLPrediction, WIN_ML_PREDICTION_VERSION, type WinMLPredictionV1 } from "./ml-prediction-contract.mts";
import { hashWinMLProvenance } from "./ml-provenance.mts";

const COLLECTION = "library/ml-shadow-predictions";
const RECORD_VERSION = "win.ml.shadow-prediction-record.v1";

export class WinMLShadowPredictionError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "WinMLShadowPredictionError"; this.code = code; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}
function instant(value: unknown): number | null {
  if (typeof value !== "string" ||
      !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Runs only a registered, integrity-checked model against point-in-time
 * features. No request can supply an artifact, dataset manifest or model
 * metadata. A successful result is shadow-only and never places a bet.
 */
export async function buildWinMLShadowPrediction(args: {
  predictionRunId: string;
  eventId: string;
  eventStart: string;
  predictionCutoff: string;
  generatedAt: string;
  modelId: string;
  modelVersion: string;
  features: Record<string, { value: number; availableAt: string; sourceId: string }>;
}) {
  if (!args || !validId(args.predictionRunId) || !validId(args.eventId) ||
      !validId(args.modelId) || !validId(args.modelVersion)) {
    throw new WinMLShadowPredictionError("shadow_prediction_identity_invalid");
  }
  const kickoff = instant(args.eventStart);
  const cutoff = instant(args.predictionCutoff);
  const generated = instant(args.generatedAt);
  if (kickoff === null || cutoff === null || generated === null ||
      cutoff >= kickoff || generated < cutoff || generated >= kickoff) {
    throw new WinMLShadowPredictionError("shadow_prediction_time_window_invalid");
  }
  if (!args.features || typeof args.features !== "object" || Array.isArray(args.features)) {
    throw new WinMLShadowPredictionError("shadow_prediction_features_invalid");
  }
  const featureEntries = Object.entries(args.features);
  if (featureEntries.length < 1 || featureEntries.length > 128) {
    throw new WinMLShadowPredictionError("shadow_prediction_feature_count_invalid");
  }
  for (const [name, feature] of featureEntries) {
    const available = instant(feature?.availableAt);
    if (!name.trim() || !feature || typeof feature.value !== "number" ||
        !Number.isFinite(feature.value) || available === null ||
        available > cutoff || typeof feature.sourceId !== "string" || !feature.sourceId.trim()) {
      throw new WinMLShadowPredictionError("shadow_prediction_feature_provenance_invalid:" + name);
    }
  }

  const registered = await getWinMLModelArtifact(args.modelId, args.modelVersion);
  if (!registered) throw new WinMLShadowPredictionError("shadow_prediction_model_not_registered");
  const { artifact, evaluation } = registered;
  if (registered.promotionReadiness.status !== "eligible_for_human_shadow_review") {
    throw new WinMLShadowPredictionError("shadow_prediction_model_not_eligible:" +
      registered.promotionReadiness.status);
  }
  const manifest = await getWinMLDatasetManifest(artifact.datasetId);
  if (!manifest || manifest.contentSha256 !== artifact.datasetContentSha256) {
    throw new WinMLShadowPredictionError("shadow_prediction_dataset_binding_invalid");
  }
  const featureNames = artifact.featureNames;
  const keys = Object.keys(args.features).sort();
  if (keys.length !== featureNames.length || keys.some((key, index) => key !== featureNames[index])) {
    throw new WinMLShadowPredictionError("shadow_prediction_feature_schema_mismatch");
  }
  const numericFeatures = Object.fromEntries(featureNames.map(name => [name, args.features[name].value]));
  const result = predictWinMLFootball1X2(artifact, numericFeatures);
  const prediction: WinMLPredictionV1 = {
    contractVersion: WIN_ML_PREDICTION_VERSION,
    origin: "trained_model",
    usage: "shadow_only",
    predictionRunId: args.predictionRunId,
    eventId: args.eventId,
    eventStart: args.eventStart,
    predictionCutoff: args.predictionCutoff,
    generatedAt: args.generatedAt,
    sport: evaluation.sport,
    market: "1x2",
    modelId: artifact.modelId,
    modelVersion: evaluation.modelVersion,
    algorithm: evaluation.algorithm,
    artifactSha256: artifact.artifactSha256,
    datasetId: artifact.datasetId,
    datasetContentSha256: artifact.datasetContentSha256,
    featureSchemaVersion: artifact.featureSchemaVersion,
    featureVectorSha256: hashWinMLProvenance(args.features).sha256,
    probabilities: {
      home: result.probabilities[0],
      draw: result.probabilities[1],
      away: result.probabilities[2]
    }
  };
  const validation = validateWinMLPrediction(manifest, evaluation, prediction);
  if (validation.status !== "eligible_for_shadow_only") {
    throw new WinMLShadowPredictionError("shadow_prediction_contract_blocked:" +
      validation.reasons.join("|"));
  }
  return {
    prediction,
    validation,
    productionUseAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

/** Immutable audit write; identical retries are safe, conflicting IDs fail. */
export async function recordWinMLShadowPrediction(prediction: WinMLPredictionV1) {
  if (!prediction || prediction.usage !== "shadow_only" ||
      prediction.contractVersion !== WIN_ML_PREDICTION_VERSION ||
      !validId(prediction.predictionRunId)) {
    throw new WinMLShadowPredictionError("shadow_prediction_record_invalid");
  }
  const payload = {
    recordVersion: RECORD_VERSION,
    prediction,
    predictionSha256: hashWinMLProvenance(prediction).sha256,
    recordedAt: new Date().toISOString(),
    productionUseAllowed: false,
    automatedBettingAllowed: false
  };
  const recordSha256 = hashWinMLProvenance(payload).sha256;
  const record = { ...payload, recordSha256 };
  const result = await putIfNew(COLLECTION, prediction.predictionRunId, record);
  if (result?.modified) return { recorded: true, idempotent: false, recordSha256 };
  const existing = await get<typeof record>(COLLECTION, prediction.predictionRunId);
  if (existing && existing.recordVersion === RECORD_VERSION &&
      existing.predictionSha256 === payload.predictionSha256) {
    const { recordSha256: storedHash, ...storedPayload } = existing;
    if (storedHash === hashWinMLProvenance(storedPayload).sha256) {
      return { recorded: false, idempotent: true, recordSha256: storedHash };
    }
  }
  throw new WinMLShadowPredictionError("shadow_prediction_immutable_conflict");
}

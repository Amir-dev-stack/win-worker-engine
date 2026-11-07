import { getWinMLMarketBlendEvaluationEvidence } from "./ml-market-blend-evidence.mts";
import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import { getWinMLShadowPredictionRecord } from "./ml-shadow-prediction.mts";
import type { WinMLPredictionV1 } from "./ml-prediction-contract.mts";
import {
  calculateWinMLMarketAnchoredBlend,
  type WinMLMarketBlendInput
} from "./ml-market-anchored-blend.mts";

type VerifiedBlendInput = Omit<WinMLMarketBlendInput, "evaluation" | "model"> & {
  model: Omit<WinMLMarketBlendInput["model"], "probabilities"> & {
    /** Ignored even if supplied; probabilities always come from the immutable shadow record. */
    probabilities?: WinMLMarketBlendInput["model"]["probabilities"];
  };
};

type RegisteredModel = NonNullable<Awaited<ReturnType<typeof getWinMLModelArtifact>>>;
type RegisteredEvidence = Awaited<ReturnType<typeof getWinMLMarketBlendEvaluationEvidence>>;

/** Pure binding helper; the caller must supply a prediction loaded and verified by the registry. */
export function bindWinMLShadowPredictionToBlendInput(args: {
  input: VerifiedBlendInput;
  prediction: WinMLPredictionV1;
  predictionRunId: string;
  model: RegisteredModel;
  evidence: RegisteredEvidence;
}) {
  const { input, prediction, predictionRunId, model, evidence } = args;
  if (!input || !input.event || !input.market || !input.model || !prediction ||
      !predictionRunId || !model || !evidence) {
    throw new Error("market_blend_registered_evidence_arguments_invalid");
  }
  if (input.model.modelId !== model.artifact.modelId ||
      input.model.artifactSha256 !== model.artifact.artifactSha256 ||
      input.model.datasetContentSha256 !== evidence.datasetContentSha256) {
    throw new Error("market_blend_registered_model_binding_mismatch");
  }
  if (prediction.usage !== "shadow_only" || prediction.origin !== "trained_model") {
    throw new Error("market_blend_registered_shadow_prediction_usage_invalid");
  }
  if (prediction.predictionRunId !== predictionRunId ||
      prediction.modelId !== model.artifact.modelId ||
      prediction.modelVersion !== model.evaluation.modelVersion ||
      prediction.artifactSha256 !== model.artifact.artifactSha256 ||
      prediction.datasetContentSha256 !== evidence.datasetContentSha256 ||
      prediction.eventId !== input.event.eventId ||
      prediction.eventId !== input.model.eventId ||
      prediction.eventStart !== input.event.kickoff ||
      prediction.predictionCutoff !== input.event.predictionCutoff ||
      prediction.generatedAt !== input.model.at ||
      prediction.featureVectorSha256 !== input.model.featureVectorSha256 ||
      model.evaluation.trainedAt !== input.model.trainedAt) {
    throw new Error("market_blend_registered_shadow_prediction_binding_mismatch");
  }
  return {
    ...input,
    model: { ...input.model, probabilities: prediction.probabilities }
  };
}

/**
 * Loads immutable evaluation evidence and the exact registered event prediction.
 * Caller-supplied event probabilities are never used by this wrapper.
 */
export async function calculateWinMLMarketAnchoredBlendWithRegisteredEvidence(args: {
  input: VerifiedBlendInput;
  modelId: string;
  modelVersion: string;
  marketEvaluationId: string;
  predictionRunId: string;
}) {
  const { input, modelId, modelVersion, marketEvaluationId, predictionRunId } = args || ({} as any);
  if (!input || !modelId || !modelVersion || !marketEvaluationId || !predictionRunId) {
    throw new Error("market_blend_registered_evidence_arguments_invalid");
  }
  const [evidence, model, shadowRecord] = await Promise.all([
    getWinMLMarketBlendEvaluationEvidence({ modelId, modelVersion, marketEvaluationId }),
    getWinMLModelArtifact(modelId, modelVersion),
    getWinMLShadowPredictionRecord(predictionRunId)
  ]);
  if (!model) throw new Error("market_blend_registered_model_missing");
  if (!shadowRecord) throw new Error("market_blend_registered_shadow_prediction_missing");
  const boundInput = bindWinMLShadowPredictionToBlendInput({
    input, prediction: shadowRecord.prediction, predictionRunId, model, evidence
  });
  return calculateWinMLMarketAnchoredBlend({ ...boundInput, evaluation: evidence });
}

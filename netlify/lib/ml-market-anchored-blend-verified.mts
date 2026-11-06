import { getWinMLMarketBlendEvaluationEvidence } from "./ml-market-blend-evidence.mts";
import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import { getWinMLShadowPredictionRecord } from "./ml-shadow-prediction.mts";
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
  if (!input || !modelId || !modelVersion || !marketEvaluationId || !predictionRunId ||
      !input.event || !input.market || !input.model) {
    throw new Error("market_blend_registered_evidence_arguments_invalid");
  }
  const [evidence, model, shadowRecord] = await Promise.all([
    getWinMLMarketBlendEvaluationEvidence({ modelId, modelVersion, marketEvaluationId }),
    getWinMLModelArtifact(modelId, modelVersion),
    getWinMLShadowPredictionRecord(predictionRunId)
  ]);
  if (!model || input.model.modelId !== modelId ||
      input.model.artifactSha256 !== model.artifact.artifactSha256 ||
      input.model.datasetContentSha256 !== evidence.datasetContentSha256) {
    throw new Error("market_blend_registered_model_binding_mismatch");
  }
  if (!shadowRecord) throw new Error("market_blend_registered_shadow_prediction_missing");
  const prediction = shadowRecord.prediction;
  if (prediction.predictionRunId !== predictionRunId ||
      prediction.modelId !== modelId || prediction.modelVersion !== modelVersion ||
      prediction.artifactSha256 !== model.artifact.artifactSha256 ||
      prediction.datasetContentSha256 !== evidence.datasetContentSha256 ||
      prediction.eventId !== input.event.eventId ||
      prediction.eventId !== input.model.eventId ||
      prediction.eventStart !== input.event.kickoff ||
      prediction.predictionCutoff !== input.event.predictionCutoff ||
      prediction.predictionCutoff !== input.model.at ||
      prediction.generatedAt !== input.model.at ||
      prediction.featureVectorSha256 !== input.model.featureVectorSha256 ||
      model.evaluation.trainedAt !== input.model.trainedAt) {
    throw new Error("market_blend_registered_shadow_prediction_binding_mismatch");
  }
  const trustedModel = { ...input.model, probabilities: prediction.probabilities };
  return calculateWinMLMarketAnchoredBlend({
    ...input,
    model: trustedModel,
    evaluation: evidence
  });
}

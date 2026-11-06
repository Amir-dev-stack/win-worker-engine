import { getWinMLMarketBlendEvaluationEvidence } from "./ml-market-blend-evidence.mts";
import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import {
  calculateWinMLMarketAnchoredBlend,
  type WinMLMarketBlendInput
} from "./ml-market-anchored-blend.mts";

/**
 * Loads immutable evaluation evidence itself; callers cannot provide metrics.
 * The event probability vector is still caller-supplied and is not independently
 * proven here to be the output of registered shadow inference.
 */
export async function calculateWinMLMarketAnchoredBlendWithRegisteredEvidence(args: {
  input: Omit<WinMLMarketBlendInput, "evaluation">;
  modelId: string;
  modelVersion: string;
  marketEvaluationId: string;
}) {
  const { input, modelId, modelVersion, marketEvaluationId } = args || ({} as any);
  if (!input || !modelId || !modelVersion || !marketEvaluationId) {
    throw new Error("market_blend_registered_evidence_arguments_invalid");
  }
  const [evidence, model] = await Promise.all([
    getWinMLMarketBlendEvaluationEvidence({ modelId, modelVersion, marketEvaluationId }),
    getWinMLModelArtifact(modelId, modelVersion)
  ]);
  if (!model || input.model?.modelId !== modelId ||
      input.model?.artifactSha256 !== model.artifact.artifactSha256 ||
      input.model?.datasetContentSha256 !== evidence.datasetContentSha256) {
    throw new Error("market_blend_registered_model_binding_mismatch");
  }
  return calculateWinMLMarketAnchoredBlend({ ...input, evaluation: evidence });
}

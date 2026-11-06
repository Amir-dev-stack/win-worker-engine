import { getWinMLMarketBlendEvaluationEvidence } from "./ml-market-blend-evidence.mts";
import {
  calculateWinMLMarketAnchoredBlend,
  type WinMLMarketBlendInput
} from "./ml-market-anchored-blend.mts";

/**
 * The production-facing research composition path loads immutable evaluation
 * evidence itself. Callers cannot provide or override evaluation metrics.
 *
 * The event's model probability vector remains an input and is NOT independently
 * proven to be the output of registered shadow inference by this wrapper.
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
  const evidence = await getWinMLMarketBlendEvaluationEvidence({
    modelId,
    modelVersion,
    marketEvaluationId
  });
  if (input.model?.modelId !== modelId ||
      input.model?.artifactSha256 !== (await import("./ml-model-artifact-registry.mts"))
        .getWinMLModelArtifact(modelId, modelVersion).then(model => model?.artifact.artifactSha256) ||
      input.model?.datasetContentSha256 !== evidence.datasetContentSha256) {
    throw new Error("market_blend_registered_model_binding_mismatch");
  }
  return calculateWinMLMarketAnchoredBlend({ ...input, evaluation: evidence });
}

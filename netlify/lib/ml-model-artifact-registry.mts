import { get, putIfNew } from "./store.mts";
import { getWinMLDatasetManifest } from "./ml-dataset-registry.mts";
import { evaluateWinMLPromotionReadiness, type WinMLModelEvaluationV1 } from "./ml-model-contract.mts";
import { hashWinMLProvenance } from "./ml-provenance.mts";
import {
  predictWinMLFootball1X2,
  type WinMLFootballLogisticArtifactV1
} from "./ml-football-logistic-trainer.mts";

const COLLECTION = "library/ml-model-artifacts";
const VERSION = "win.ml.model-artifact-record.v1";

type StoredRecord = {
  recordVersion: typeof VERSION;
  modelId: string;
  modelVersion: string;
  datasetId: string;
  datasetContentSha256: string;
  artifactSha256: string;
  evaluationSha256: string;
  recordSha256: string;
  artifact: WinMLFootballLogisticArtifactV1;
  evaluation: WinMLModelEvaluationV1;
  registeredAt: string;
};

export class WinMLModelArtifactRegistryError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "WinMLModelArtifactRegistryError"; this.code = code; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}
function key(modelId: string, modelVersion: string) { return modelId + "::" + modelVersion; }
function withoutRecordHash(record: StoredRecord) {
  const { recordSha256, ...payload } = record;
  return payload;
}
function validateBinding(artifact: WinMLFootballLogisticArtifactV1, evaluation: WinMLModelEvaluationV1) {
  if (!artifact || !evaluation || evaluation.evaluationVersion !== "win.ml.model.evaluation.v1") {
    throw new WinMLModelArtifactRegistryError("model_evaluation_version_invalid");
  }
  // Validates every internal artifact/config/split hash and the feature schema.
  predictWinMLFootball1X2(artifact, Object.fromEntries(artifact.featureNames.map(name => [name, 0])));
  if (evaluation.modelId !== artifact.modelId ||
      evaluation.datasetId !== artifact.datasetId ||
      evaluation.datasetContentSha256 !== artifact.datasetContentSha256 ||
      evaluation.artifactSha256 !== artifact.artifactSha256 ||
      evaluation.trainingConfigSha256 !== artifact.trainingConfigSha256 ||
      evaluation.splitManifestSha256 !== artifact.splitManifestSha256 ||
      evaluation.trainingRows !== artifact.trainingRows ||
      evaluation.validationRows !== artifact.validationRows ||
      evaluation.fitDataCutoff !== artifact.fitDataCutoff ||
      evaluation.featureSchemaVersion !== artifact.featureSchemaVersion ||
      evaluation.featureNames.length !== artifact.featureNames.length ||
      evaluation.featureNames.some((name, index) => name !== artifact.featureNames[index]) ||
      evaluation.market !== "1x2" || evaluation.algorithm !== "logistic_regression") {
    throw new WinMLModelArtifactRegistryError("model_artifact_evaluation_binding_mismatch");
  }
}
function verifyRecord(record: StoredRecord) {
  if (!record || record.recordVersion !== VERSION ||
      !validId(record.modelId) || !validId(record.modelVersion) ||
      !validId(record.datasetId) ||
      !/^[a-f0-9]{64}$/i.test(record.datasetContentSha256 || "") ||
      !/^[a-f0-9]{64}$/i.test(record.artifactSha256 || "") ||
      !/^[a-f0-9]{64}$/i.test(record.evaluationSha256 || "") ||
      !/^[a-f0-9]{64}$/i.test(record.recordSha256 || "")) {
    throw new WinMLModelArtifactRegistryError("model_artifact_record_invalid");
  }
  validateBinding(record.artifact, record.evaluation);
  if (record.modelId !== record.artifact.modelId ||
      record.datasetId !== record.artifact.datasetId ||
      record.datasetContentSha256 !== record.artifact.datasetContentSha256 ||
      record.artifactSha256 !== record.artifact.artifactSha256 ||
      hashWinMLProvenance(record.evaluation).sha256 !== record.evaluationSha256 ||
      hashWinMLProvenance(withoutRecordHash(record)).sha256 !== record.recordSha256) {
    throw new WinMLModelArtifactRegistryError("model_artifact_record_hash_mismatch");
  }
}

/**
 * Stores one immutable artifact + evaluation envelope. This is provenance
 * storage only: it never trains, approves, promotes, or enables predictions.
 */
export async function registerWinMLModelArtifact(args: {
  artifact: WinMLFootballLogisticArtifactV1;
  evaluation: WinMLModelEvaluationV1;
  registeredAt: string;
}) {
  const { artifact, evaluation, registeredAt } = args || ({} as any);
  validateBinding(artifact, evaluation);
  if (!validId(evaluation.modelId) || !validId(evaluation.modelVersion) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(registeredAt || "") ||
      !Number.isFinite(Date.parse(registeredAt))) {
    throw new WinMLModelArtifactRegistryError("model_artifact_registration_metadata_invalid");
  }
  const manifest = await getWinMLDatasetManifest(artifact.datasetId);
  if (!manifest || manifest.contentSha256 !== artifact.datasetContentSha256) {
    throw new WinMLModelArtifactRegistryError("registered_dataset_content_binding_missing_or_mismatched");
  }
  const promotionReadiness = evaluateWinMLPromotionReadiness(manifest, evaluation);
  const payload = {
    recordVersion: VERSION,
    modelId: artifact.modelId,
    modelVersion: evaluation.modelVersion,
    datasetId: artifact.datasetId,
    datasetContentSha256: artifact.datasetContentSha256,
    artifactSha256: artifact.artifactSha256,
    evaluationSha256: hashWinMLProvenance(evaluation).sha256,
    artifact,
    evaluation,
    registeredAt
  };
  const record = { ...payload, recordSha256: hashWinMLProvenance(payload).sha256 } as StoredRecord;
  const id = key(record.modelId, record.modelVersion);
  const result = await putIfNew(COLLECTION, id, record);
  if (result?.modified) {
    return {
      registered: true, idempotent: false, modelId: record.modelId, modelVersion: record.modelVersion,
      artifactSha256: record.artifactSha256, evaluationSha256: record.evaluationSha256,
      promotionReadiness, productionPromotionAllowed: false, automatedBettingAllowed: false
    };
  }
  const existing = await get<StoredRecord>(COLLECTION, id);
  if (existing) {
    verifyRecord(existing);
    if (existing.recordSha256 === record.recordSha256) {
      return {
        registered: false, idempotent: true, modelId: existing.modelId, modelVersion: existing.modelVersion,
        artifactSha256: existing.artifactSha256, evaluationSha256: existing.evaluationSha256,
        promotionReadiness, productionPromotionAllowed: false, automatedBettingAllowed: false
      };
    }
  }
  throw new WinMLModelArtifactRegistryError("model_artifact_immutable_conflict");
}

export async function getWinMLModelArtifact(modelId: string, modelVersion: string) {
  if (!validId(modelId) || !validId(modelVersion)) {
    throw new WinMLModelArtifactRegistryError("model_artifact_identity_invalid");
  }
  const record = await get<StoredRecord>(COLLECTION, key(modelId, modelVersion));
  if (!record) return null;
  verifyRecord(record);
  const manifest = await getWinMLDatasetManifest(record.datasetId);
  if (!manifest || manifest.contentSha256 !== record.datasetContentSha256) {
    throw new WinMLModelArtifactRegistryError("registered_dataset_content_binding_missing_or_mismatched");
  }
  return {
    artifact: record.artifact,
    evaluation: record.evaluation,
    provenance: {
      recordVersion: record.recordVersion,
      recordSha256: record.recordSha256,
      evaluationSha256: record.evaluationSha256,
      datasetId: record.datasetId,
      datasetContentSha256: record.datasetContentSha256,
      registeredAt: record.registeredAt
    },
    promotionReadiness: evaluateWinMLPromotionReadiness(manifest, record.evaluation),
    productionPromotionAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

import {
  verifyWinMLOwnerTrainingApproval,
  verifyWinMLOwnerTrainingRevocation,
  type WinMLOwnerTrainingApprovalEvidenceV1,
  type WinMLOwnerTrainingRevocationEvidenceV1
} from "./ml-owner-approval.mts";
import { getWinMLDatasetManifest } from "./ml-dataset-registry.mts";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";
import { get, list, putIfNew } from "./store.mts";

const APPROVAL_COLLECTION = "library/ml-owner-training-approvals";
const REVOCATION_COLLECTION = "library/ml-owner-training-revocations";

export class WinMLOwnerApprovalRegistryError extends Error {
  readonly code: string;
  readonly details: string[];
  constructor(code: string, details: string[] = []) {
    super(code);
    this.name = "WinMLOwnerApprovalRegistryError";
    this.code = code;
    this.details = details;
  }
}

type TrustedOwnerConfig = {
  publicKeyPem: string;
  reviewerId: string;
};

type StoredApproval = {
  recordVersion: "win.ml.owner-training-approval-record.v1";
  evidence: WinMLOwnerTrainingApprovalEvidenceV1;
  recordedAt: string;
};

type StoredRevocation = {
  recordVersion: "win.ml.owner-training-revocation-record.v1";
  evidence: WinMLOwnerTrainingRevocationEvidenceV1;
  recordedAt: string;
};

function configValid(config: TrustedOwnerConfig): boolean {
  return typeof config?.publicKeyPem === "string" && config.publicKeyPem.trim().length > 0 &&
    typeof config?.reviewerId === "string" && config.reviewerId.trim().length > 0;
}

function sameRecord(left: unknown, right: unknown): boolean {
  try { return canonicalizeWinMLProvenance(left) === canonicalizeWinMLProvenance(right); }
  catch { return false; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

function registryError(code: string, details: string[] = []): never {
  throw new WinMLOwnerApprovalRegistryError(code, details);
}

/**
 * Internal storage service only. A future owner-only route must obtain this
 * configuration from protected Netlify environment settings, never request data.
 * This module intentionally does not expose an HTTP endpoint or unlock training.
 */
export async function registerWinMLOwnerTrainingApproval(
  evidence: WinMLOwnerTrainingApprovalEvidenceV1,
  trustedConfig: TrustedOwnerConfig,
  now = new Date().toISOString()
) {
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const payload = evidence?.payload;
  if (!validId(payload?.approvalId)) registryError("owner_approval_id_invalid");
  if (payload?.reviewerId !== trustedConfig.reviewerId) registryError("owner_approval_reviewer_not_authorized");

  const manifest = await getWinMLDatasetManifest(payload.datasetId);
  if (!manifest) registryError("owner_approval_dataset_not_registered");
  if (manifest.permittedUse !== "training") registryError("dataset_licence_not_marked_for_training");
  const verification = verifyWinMLOwnerTrainingApproval(evidence, trustedConfig.publicKeyPem, {
    datasetId: manifest.datasetId,
    datasetContentSha256: manifest.contentSha256,
    licenceId: manifest.licenceId,
    now
  });
  if (!verification.valid) registryError("owner_approval_evidence_invalid", verification.reasons);

  const record: StoredApproval = {
    recordVersion: "win.ml.owner-training-approval-record.v1",
    evidence,
    recordedAt: now
  };
  const result = await putIfNew(APPROVAL_COLLECTION, payload.approvalId, record);
  if (result?.modified) return { recorded: true, idempotent: false, approvalId: payload.approvalId };
  const existing = await get<StoredApproval>(APPROVAL_COLLECTION, payload.approvalId);
  if (existing?.recordVersion === "win.ml.owner-training-approval-record.v1" && sameRecord(existing.evidence, evidence)) {
    return { recorded: false, idempotent: true, approvalId: payload.approvalId };
  }
  registryError("owner_approval_id_immutable_conflict");
}

/** One immutable revocation record per approval; a conflicting second record is rejected. */
export async function registerWinMLOwnerTrainingRevocation(
  evidence: WinMLOwnerTrainingRevocationEvidenceV1,
  trustedConfig: TrustedOwnerConfig,
  now = new Date().toISOString()
) {
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const payload = evidence?.payload;
  if (!validId(payload?.approvalId)) registryError("owner_revocation_approval_id_invalid");
  if (payload?.reviewerId !== trustedConfig.reviewerId) registryError("owner_revocation_reviewer_not_authorized");

  const approval = await get<StoredApproval>(APPROVAL_COLLECTION, payload.approvalId);
  if (!approval || approval.recordVersion !== "win.ml.owner-training-approval-record.v1") {
    registryError("owner_approval_record_not_found");
  }
  const approvalPayload = approval.evidence?.payload;
  const verification = verifyWinMLOwnerTrainingRevocation(evidence, trustedConfig.publicKeyPem, {
    approvalId: approvalPayload.approvalId,
    datasetId: approvalPayload.datasetId,
    datasetContentSha256: approvalPayload.datasetContentSha256,
    approvedAt: approvalPayload.approvedAt,
    now
  });
  if (!verification.valid) registryError("owner_revocation_evidence_invalid", verification.reasons);

  const record: StoredRevocation = {
    recordVersion: "win.ml.owner-training-revocation-record.v1",
    evidence,
    recordedAt: now
  };
  const result = await putIfNew(REVOCATION_COLLECTION, payload.approvalId, record);
  if (result?.modified) return { recorded: true, idempotent: false, approvalId: payload.approvalId };
  const existing = await get<StoredRevocation>(REVOCATION_COLLECTION, payload.approvalId);
  if (existing?.recordVersion === "win.ml.owner-training-revocation-record.v1" && sameRecord(existing.evidence, evidence)) {
    return { recorded: false, idempotent: true, approvalId: payload.approvalId };
  }
  registryError("owner_revocation_already_recorded");
}

/** Bounded owner-only audit inventory. Each entry is revalidated against current dataset, key and revocation state. */
export async function listWinMLOwnerTrainingApprovalStatuses(
  trustedConfig: TrustedOwnerConfig,
  limit = 50,
  now = new Date().toISOString()
) {
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 50;
  const records = await list<StoredApproval>(APPROVAL_COLLECTION, boundedLimit);
  const ids = records
    .filter(record => record?.recordVersion === "win.ml.owner-training-approval-record.v1")
    .map(record => record.evidence?.payload?.approvalId)
    .filter((id): id is string => validId(id));
  const uniqueIds = [...new Set(ids)];
  const statuses = await Promise.all(uniqueIds.map(id =>
    getWinMLOwnerTrainingApprovalStatus(id, trustedConfig, now)
  ));
  return { count: statuses.length, limit: boundedLimit, approvals: statuses };
}

/** Read-only status check; readiness remains blocked until a later explicit integration. */
export async function getWinMLOwnerTrainingApprovalStatus(
  approvalId: string,
  trustedConfig: TrustedOwnerConfig,
  now = new Date().toISOString()
) {
  if (!validId(approvalId)) registryError("owner_approval_id_invalid");
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const approval = await get<StoredApproval>(APPROVAL_COLLECTION, approvalId);
  if (!approval || approval.recordVersion !== "win.ml.owner-training-approval-record.v1") {
    return { status: "missing" as const, approvalId };
  }
  const payload = approval.evidence?.payload;
  if (payload?.approvalId !== approvalId) return { status: "invalid" as const, approvalId, reasons: ["owner_approval_record_id_mismatch"] };
  if (payload?.reviewerId !== trustedConfig.reviewerId) return { status: "invalid" as const, approvalId, reasons: ["owner_approval_reviewer_not_authorized"] };
  const manifest = await getWinMLDatasetManifest(payload.datasetId);
  if (!manifest) return { status: "invalid" as const, approvalId, reasons: ["owner_approval_dataset_not_registered"] };
  if (manifest.permittedUse !== "training") return { status: "invalid" as const, approvalId, reasons: ["dataset_licence_not_marked_for_training"] };
  const verification = verifyWinMLOwnerTrainingApproval(approval.evidence, trustedConfig.publicKeyPem, {
    datasetId: manifest.datasetId,
    datasetContentSha256: manifest.contentSha256,
    licenceId: manifest.licenceId,
    now
  });
  if (!verification.valid) return { status: "invalid" as const, approvalId, reasons: verification.reasons };

  const revocation = await get<StoredRevocation>(REVOCATION_COLLECTION, approvalId);
  if (revocation) {
    if (revocation.evidence?.payload?.reviewerId !== trustedConfig.reviewerId) return { status: "invalid" as const, approvalId, reasons: ["owner_revocation_reviewer_not_authorized"] };
    const revoked = verifyWinMLOwnerTrainingRevocation(revocation.evidence, trustedConfig.publicKeyPem, {
      approvalId,
      datasetId: payload.datasetId,
      datasetContentSha256: payload.datasetContentSha256,
      approvedAt: payload.approvedAt,
      now
    });
    if (!revoked.valid) return { status: "invalid" as const, approvalId, reasons: revoked.reasons };
    return { status: "revoked" as const, approvalId, revokedAt: revocation.evidence.payload.revokedAt };
  }
  return {
    status: "active" as const,
    approvalId,
    datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256,
    licenceId: payload.licenceId,
    expiresAt: payload.expiresAt
  };
}

import {
  verifyWinMLOwnerTrainingApproval,
  verifyWinMLOwnerTrainingRevocation,
  type WinMLOwnerTrainingApprovalEvidenceV1,
  type WinMLOwnerTrainingRevocationEvidenceV1
} from "./ml-owner-approval.mts";
import {
  hashWinMLLicenceEvidence,
  verifyWinMLLicenceEvidence,
  type WinMLSignedLicenceEvidenceV1
} from "./ml-licence-evidence.mts";
import { validateWinMLDatasetManifest } from "./ml-data-contract.mts";
import { getWinMLDatasetManifest } from "./ml-dataset-registry.mts";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";
import { get, list, putIfNew } from "./store.mts";

const LICENCE_COLLECTION = "library/ml-licence-review-evidence";
const LICENCE_ID_COLLECTION = "library/ml-licence-review-evidence-ids";
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

type StoredLicenceEvidenceId = {
  recordVersion: "win.ml.licence-review-id-record.v1";
  evidenceSha256: string;
};

type StoredLicenceEvidence = {
  recordVersion: "win.ml.licence-review-record.v1";
  evidence: WinMLSignedLicenceEvidenceV1;
  evidenceSha256: string;
  recordedAt: string;
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
 * Internal storage service. Trusted keys and reviewer identity must come from
 * protected server configuration, never request data. All evidence records are
 * immutable; registering them does not itself run or unlock model training.
 */
export async function registerWinMLLicenceReviewEvidence(
  evidence: WinMLSignedLicenceEvidenceV1,
  trustedConfig: TrustedOwnerConfig,
  now = new Date().toISOString()
) {
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const payload = evidence?.payload;
  if (!payload || !validId(payload.evidenceId)) registryError("licence_evidence_id_invalid");
  if (payload?.reviewerId !== trustedConfig.reviewerId) registryError("licence_evidence_reviewer_not_authorized");
  let evidenceSha256: string;
  try { evidenceSha256 = hashWinMLLicenceEvidence(payload); }
  catch { registryError("licence_evidence_payload_invalid"); }
  const verification = verifyWinMLLicenceEvidence(evidence, trustedConfig.publicKeyPem, {
    licenceId: payload.licenceId, evidenceSha256, reviewerId: trustedConfig.reviewerId, now
  });
  if (!verification.valid) registryError("licence_evidence_invalid", verification.reasons);
  const idIndex: StoredLicenceEvidenceId = {
    recordVersion: "win.ml.licence-review-id-record.v1", evidenceSha256
  };
  const idResult = await putIfNew(LICENCE_ID_COLLECTION, payload.evidenceId, idIndex);
  if (!idResult?.modified) {
    const existingId = await get<StoredLicenceEvidenceId>(LICENCE_ID_COLLECTION, payload.evidenceId);
    if (existingId?.recordVersion !== "win.ml.licence-review-id-record.v1" ||
        existingId.evidenceSha256 !== evidenceSha256) {
      registryError("licence_evidence_id_immutable_conflict");
    }
  }
  const record: StoredLicenceEvidence = {
    recordVersion: "win.ml.licence-review-record.v1", evidence, evidenceSha256, recordedAt: now
  };
  const result = await putIfNew(LICENCE_COLLECTION, evidenceSha256, record);
  if (result?.modified) return { recorded: true, idempotent: false, evidenceId: payload.evidenceId, evidenceSha256 };
  const existing = await get<StoredLicenceEvidence>(LICENCE_COLLECTION, evidenceSha256);
  if (existing?.recordVersion === "win.ml.licence-review-record.v1" &&
      existing.evidenceSha256 === evidenceSha256 && sameRecord(existing.evidence, evidence)) {
    return { recorded: false, idempotent: true, evidenceId: payload.evidenceId, evidenceSha256 };
  }
  registryError("licence_evidence_hash_immutable_conflict");
}

async function verifyRegisteredLicenceEvidence(
  evidenceSha256: string, licenceId: string, trustedConfig: TrustedOwnerConfig, now: string
) {
  if (!/^[a-f0-9]{64}$/i.test(evidenceSha256 || "")) {
    return { valid: false, reasons: ["licence_evidence_hash_invalid"] };
  }
  const record = await get<StoredLicenceEvidence>(LICENCE_COLLECTION, evidenceSha256);
  if (!record || record.recordVersion !== "win.ml.licence-review-record.v1" ||
      record.evidenceSha256 !== evidenceSha256) {
    return { valid: false, reasons: ["registered_licence_evidence_missing"] };
  }
  return verifyWinMLLicenceEvidence(record.evidence, trustedConfig.publicKeyPem, {
    licenceId, evidenceSha256, reviewerId: trustedConfig.reviewerId, now
  });
}
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
  const licenceVerification = await verifyRegisteredLicenceEvidence(
    payload.licenceEvidenceSha256, manifest.licenceId, trustedConfig, now
  );
  if (!licenceVerification.valid) registryError("owner_approval_licence_evidence_invalid", licenceVerification.reasons);
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

/**
 * Composite, read-only readiness audit. It verifies the registered dataset,
 * its signed time-bounded licence review, the owner approval and revocation
 * state as one chain. This is an evidence-readiness result only: it never
 * enables fitting, artifact promotion, production predictions or betting.
 */
export async function evaluateWinMLTrainingReadiness(
  datasetId: string,
  approvalId: string,
  trustedConfig: TrustedOwnerConfig,
  now = new Date().toISOString()
) {
  if (!configValid(trustedConfig)) registryError("trusted_owner_approval_configuration_missing");
  const reasons: string[] = [];
  const manifest = await getWinMLDatasetManifest(datasetId);
  if (!manifest) {
    reasons.push("dataset_not_registered");
    return { evidenceReady: false, reasons, datasetId, approvalId, modelFittingAllowed: false as const,
      productionPromotionAllowed: false as const, automatedBettingAllowed: false as const };
  }
  reasons.push(...validateWinMLDatasetManifest(manifest));
  if (manifest.permittedUse !== "training") reasons.push("licence_does_not_permit_training");
  if (manifest.eventTimePrecision !== "instant") reasons.push("exact_event_time_required_for_point_in_time_training");
  if (manifest.rowCount < 1 || manifest.labeledRowCount < 1) reasons.push("dataset_has_no_labeled_rows");
  if (!validId(approvalId)) reasons.push("owner_approval_id_invalid");
  else {
    const status = await getWinMLOwnerTrainingApprovalStatus(approvalId, trustedConfig, now);
    if (status.status !== "active") {
      reasons.push("owner_approval_not_active:" + status.status);
      if (status.status === "invalid" && Array.isArray(status.reasons)) reasons.push(...status.reasons);
    } else {
      if (status.datasetId !== manifest.datasetId) reasons.push("owner_approval_dataset_mismatch");
      if (status.datasetContentSha256 !== manifest.contentSha256) reasons.push("owner_approval_dataset_hash_mismatch");
      if (status.licenceId !== manifest.licenceId) reasons.push("owner_approval_licence_mismatch");
    }
  }
  const uniqueReasons = [...new Set(reasons)];
  return {
    evidenceReady: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    datasetId: manifest.datasetId,
    approvalId,
    licenceId: manifest.licenceId,
    datasetContentSha256: manifest.contentSha256,
    modelFittingAllowed: false as const,
    productionPromotionAllowed: false as const,
    automatedBettingAllowed: false as const
  };
}

/** Read-only status check; every owner approval is revalidated against signed licence evidence. */
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
  const licenceVerification = await verifyRegisteredLicenceEvidence(
    payload.licenceEvidenceSha256, manifest.licenceId, trustedConfig, now
  );
  if (!licenceVerification.valid) return { status: "invalid" as const, approvalId, reasons: licenceVerification.reasons };
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

import { verify as verifySignature } from "node:crypto";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";

export const WIN_ML_OWNER_APPROVAL_VERSION = "win.ml.owner-training-approval.v1" as const;

export type WinMLOwnerTrainingApprovalPayloadV1 = {
  approvalVersion: typeof WIN_ML_OWNER_APPROVAL_VERSION;
  approvalId: string;
  datasetId: string;
  datasetContentSha256: string;
  licenceId: string;
  licenceEvidenceSha256: string;
  scope: "training";
  reviewerId: string;
  approvedAt: string;
  expiresAt: string;
};

export type WinMLOwnerTrainingApprovalEvidenceV1 = {
  payload: WinMLOwnerTrainingApprovalPayloadV1;
  signatureBase64: string;
};

export type WinMLOwnerTrainingApprovalExpectation = {
  datasetId: string;
  datasetContentSha256: string;
  licenceId: string;
  now?: string;
};

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Verify an owner-signed, dataset- and licence-bound training approval.
 * The public key MUST come from trusted server configuration, never request data.
 * This verifier is deliberately not wired into dataset readiness yet: WIN
 * remains fail-closed until a protected approval/revocation registry is deployed.
 */
export function verifyWinMLOwnerTrainingApproval(
  evidence: WinMLOwnerTrainingApprovalEvidenceV1,
  trustedPublicKeyPem: string,
  expected: WinMLOwnerTrainingApprovalExpectation
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const payload = evidence?.payload;
  if (!payload || payload.approvalVersion !== WIN_ML_OWNER_APPROVAL_VERSION) reasons.push("owner_approval_version_invalid");
  if (typeof payload?.approvalId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(payload.approvalId)) reasons.push("owner_approval_id_invalid");
  if (payload?.scope !== "training") reasons.push("owner_approval_scope_invalid");
  if (typeof payload?.reviewerId !== "string" || !payload.reviewerId.trim()) reasons.push("owner_approval_reviewer_missing");
  if (payload?.datasetId !== expected?.datasetId) reasons.push("owner_approval_dataset_mismatch");
  if (payload?.datasetContentSha256 !== expected?.datasetContentSha256 ||
      !/^[a-f0-9]{64}$/i.test(payload?.datasetContentSha256 || "")) reasons.push("owner_approval_dataset_hash_mismatch");
  if (payload?.licenceId !== expected?.licenceId) reasons.push("owner_approval_licence_mismatch");
  if (!/^[a-f0-9]{64}$/i.test(payload?.licenceEvidenceSha256 || "")) reasons.push("owner_approval_licence_evidence_hash_invalid");

  const approvedAt = timestamp(payload?.approvedAt);
  const expiresAt = timestamp(payload?.expiresAt);
  const now = timestamp(expected?.now ?? new Date().toISOString());
  if (approvedAt === null || expiresAt === null || now === null || expiresAt <= approvedAt) {
    reasons.push("owner_approval_time_window_invalid");
  } else {
    if (approvedAt > now) reasons.push("owner_approval_not_yet_valid");
    if (expiresAt <= now) reasons.push("owner_approval_expired");
  }

  if (typeof trustedPublicKeyPem !== "string" || !trustedPublicKeyPem.trim()) {
    reasons.push("trusted_owner_approval_public_key_missing");
  }
  if (typeof evidence?.signatureBase64 !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(evidence.signatureBase64)) {
    reasons.push("owner_approval_signature_encoding_invalid");
  }

  if (reasons.length === 0) {
    try {
      const canonicalPayload = canonicalizeWinMLProvenance(payload);
      const signature = Buffer.from(evidence.signatureBase64, "base64");
      if (!signature.length || !verifySignature(null, Buffer.from(canonicalPayload, "utf8"), trustedPublicKeyPem, signature)) {
        reasons.push("owner_approval_signature_invalid");
      }
    } catch {
      reasons.push("owner_approval_signature_verification_failed");
    }
  }
  return { valid: reasons.length === 0, reasons };
}

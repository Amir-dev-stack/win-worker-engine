import { createHash, verify as verifySignature } from "node:crypto";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";
export const WIN_ML_LICENCE_EVIDENCE_VERSION = "win.ml.licence-review.v1" as const;
export type WinMLLicenceEvidenceV1 = {
  evidenceVersion: typeof WIN_ML_LICENCE_EVIDENCE_VERSION; evidenceId: string; licenceId: string;
  sourceUrl: string; sourceDocumentSha256: string; reviewedUse: "training"; reviewerId: string;
  reviewedAt: string; reviewExpiresAt: string; rationale: string;
};
export type WinMLSignedLicenceEvidenceV1 = { payload: WinMLLicenceEvidenceV1; signatureBase64: string };
function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , , offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const calendar = new Date(Date.UTC(y, m - 1, d));
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
/** Hashes the exact canonical review payload, not the source document itself. */
export function hashWinMLLicenceEvidence(payload: WinMLLicenceEvidenceV1): string {
  return createHash("sha256").update(canonicalizeWinMLProvenance(payload), "utf8").digest("hex");
}
/** Signature proves reviewer integrity, not legal truth; source terms still require human review. */
export function verifyWinMLLicenceEvidence(
  evidence: WinMLSignedLicenceEvidenceV1, trustedPublicKeyPem: string,
  expected: { licenceId: string; evidenceSha256: string; reviewerId: string; now?: string }
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [], payload = evidence?.payload;
  if (!payload || payload.evidenceVersion !== WIN_ML_LICENCE_EVIDENCE_VERSION) reasons.push("licence_evidence_version_invalid");
  if (typeof payload?.evidenceId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(payload.evidenceId)) reasons.push("licence_evidence_id_invalid");
  if (typeof payload?.licenceId !== "string" || !payload.licenceId.trim()) reasons.push("licence_evidence_licence_id_invalid");
  if (payload?.licenceId !== expected?.licenceId) reasons.push("licence_evidence_licence_mismatch");
  if (payload?.reviewedUse !== "training") reasons.push("licence_training_permission_not_attested");
  if (typeof payload?.reviewerId !== "string" || payload.reviewerId !== expected?.reviewerId || !payload.reviewerId.trim()) {
    reasons.push("licence_evidence_reviewer_mismatch");
  }
  try {
    if (typeof payload?.sourceUrl !== "string") throw new Error("source_url_not_string");
    const source = new URL(payload.sourceUrl);
    if (source.protocol !== "https:" || !source.hostname || source.username || source.password) {
      reasons.push("licence_evidence_source_url_invalid");
    }
  } catch { reasons.push("licence_evidence_source_url_invalid"); }
  if (typeof payload?.sourceDocumentSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(payload.sourceDocumentSha256)) {
    reasons.push("licence_source_document_hash_invalid");
  }
  if (typeof payload?.rationale !== "string" || payload.rationale.trim().length < 12) reasons.push("licence_review_rationale_required");
  const reviewedAt = timestamp(payload?.reviewedAt), expiresAt = timestamp(payload?.reviewExpiresAt);
  const now = timestamp(expected?.now ?? new Date().toISOString());
  if (reviewedAt === null || expiresAt === null || now === null || expiresAt <= reviewedAt) reasons.push("licence_review_time_window_invalid");
  else { if (reviewedAt > now) reasons.push("licence_review_not_yet_valid"); if (expiresAt <= now) reasons.push("licence_review_expired"); }
  if (!/^[a-f0-9]{64}$/i.test(expected?.evidenceSha256 || "")) reasons.push("licence_evidence_expected_hash_invalid");
  if (typeof trustedPublicKeyPem !== "string" || !trustedPublicKeyPem.trim()) reasons.push("trusted_licence_reviewer_key_missing");
  if (typeof evidence?.signatureBase64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(evidence.signatureBase64)) reasons.push("licence_evidence_signature_encoding_invalid");
  if (!reasons.length) try {
    const canonical = canonicalizeWinMLProvenance(payload);
    const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
    if (hash !== expected.evidenceSha256) reasons.push("licence_evidence_hash_mismatch");
    const signature = Buffer.from(evidence.signatureBase64, "base64");
    if (!signature.length || !verifySignature(null, Buffer.from(canonical, "utf8"), trustedPublicKeyPem, signature)) reasons.push("licence_evidence_signature_invalid");
  } catch { reasons.push("licence_evidence_verification_failed"); }
  return { valid: reasons.length === 0, reasons };
}

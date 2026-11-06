import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalizeWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import { hashWinMLLicenceEvidence, WIN_ML_LICENCE_EVIDENCE_VERSION, verifyWinMLLicenceEvidence } from "../netlify/lib/ml-licence-evidence.mts";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const key = publicKey.export({ type: "spki", format: "pem" }).toString();
const payload = {
 evidenceVersion: WIN_ML_LICENCE_EVIDENCE_VERSION, evidenceId: "licence-review-2026-001",
 licenceId: "CC0-1.0", sourceUrl: "https://example.test/licence", sourceDocumentSha256: "a".repeat(64),
 reviewedUse: "training", reviewerId: "owner:amir", reviewedAt: "2026-11-06T09:00:00.000Z",
 reviewExpiresAt: "2027-02-06T09:00:00.000Z", rationale: "Source terms reviewed and training use explicitly permitted."
};
const signed = (value = payload) => ({ payload: value, signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(value)), privateKey).toString("base64") });
const expected = { licenceId: payload.licenceId, evidenceSha256: hashWinMLLicenceEvidence(payload), reviewerId: payload.reviewerId, now: "2026-11-10T12:00:00.000Z" };
test("signed licence review verifies exact source, licence, reviewer and canonical evidence hash", () => {
 assert.deepEqual(verifyWinMLLicenceEvidence(signed(), key, expected), { valid: true, reasons: [] });
});
test("licence evidence cannot be reused for a different licence, reviewer or altered payload", () => {
 assert.ok(verifyWinMLLicenceEvidence(signed(), key, { ...expected, licenceId: "other" }).reasons.includes("licence_evidence_licence_mismatch"));
 assert.ok(verifyWinMLLicenceEvidence(signed(), key, { ...expected, reviewerId: "other" }).reasons.includes("licence_evidence_reviewer_mismatch"));
 assert.ok(verifyWinMLLicenceEvidence(signed(), key, { ...expected, evidenceSha256: "b".repeat(64) }).reasons.includes("licence_evidence_hash_mismatch"));
 assert.ok(verifyWinMLLicenceEvidence(signed({ ...payload, reviewedUse: "research_only" }), key, expected).reasons.includes("licence_training_permission_not_attested"));
});
test("expired, future, malformed and incorrectly signed licence reviews fail closed", () => {
 assert.ok(verifyWinMLLicenceEvidence(signed({ ...payload, reviewExpiresAt: "2026-11-07T00:00:00.000Z" }), key, expected).reasons.includes("licence_review_expired"));
 assert.ok(verifyWinMLLicenceEvidence(signed({ ...payload, reviewedAt: "2026-11-11T00:00:00.000Z" }), key, expected).reasons.includes("licence_review_not_yet_valid"));
 assert.ok(verifyWinMLLicenceEvidence(signed({ ...payload, reviewedAt: "2026-02-30T09:00:00.000Z" }), key, expected).reasons.includes("licence_review_time_window_invalid"));
 assert.ok(verifyWinMLLicenceEvidence(signed({ ...payload, sourceUrl: "https://reviewer:secret@example.test/licence" }), key, expected).reasons.includes("licence_evidence_source_url_invalid"));
 const other = generateKeyPairSync("ed25519");
 assert.ok(verifyWinMLLicenceEvidence(signed(), other.publicKey.export({ type: "spki", format: "pem" }).toString(), expected).reasons.includes("licence_evidence_signature_invalid"));
 assert.ok(verifyWinMLLicenceEvidence({ ...signed(), signatureBase64: "not-base64!" }, key, expected).reasons.includes("licence_evidence_signature_encoding_invalid"));
});

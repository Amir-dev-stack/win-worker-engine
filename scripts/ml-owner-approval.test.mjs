import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalizeWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import { WIN_ML_OWNER_APPROVAL_VERSION, verifyWinMLOwnerTrainingApproval, verifyWinMLOwnerTrainingRevocation } from "../netlify/lib/ml-owner-approval.mts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const payload = {
  approvalVersion: WIN_ML_OWNER_APPROVAL_VERSION,
  approvalId: "approval-2026-001",
  datasetId: "football-results-2026",
  datasetContentSha256: "a".repeat(64),
  licenceId: "CC0-1.0",
  licenceEvidenceSha256: "b".repeat(64),
  scope: "training",
  reviewerId: "owner:github-account",
  approvedAt: "2026-11-06T09:00:00.000Z",
  expiresAt: "2026-12-06T09:00:00.000Z"
};
const evidence = (overrides = {}) => {
  const nextPayload = { ...payload, ...overrides };
  return {
    payload: nextPayload,
    signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(nextPayload)), privateKey).toString("base64")
  };
};
const expected = {
  datasetId: payload.datasetId,
  datasetContentSha256: payload.datasetContentSha256,
  licenceId: payload.licenceId,
  now: "2026-11-10T12:00:00.000Z"
};

test("Ed25519 owner approval verifies only for the exact dataset and licence evidence", () => {
  const result = verifyWinMLOwnerTrainingApproval(evidence(), publicKey.export({ type: "spki", format: "pem" }).toString(), expected);
  assert.deepEqual(result, { valid: true, reasons: [] });
});

test("approval signature cannot be reused for a different dataset, content hash or licence", () => {
  const key = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence(), key, { ...expected, datasetId: "other" }).reasons.includes("owner_approval_dataset_mismatch"));
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence(), key, { ...expected, datasetContentSha256: "c".repeat(64) }).reasons.includes("owner_approval_dataset_hash_mismatch"));
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence(), key, { ...expected, licenceId: "other-licence" }).reasons.includes("owner_approval_licence_mismatch"));
});

test("tampered payload, wrong signing key and malformed signature fail closed", () => {
  const key = publicKey.export({ type: "spki", format: "pem" }).toString();
  const tampered = evidence();
  tampered.payload.reviewerId = "attacker";
  assert.ok(verifyWinMLOwnerTrainingApproval(tampered, key, expected).reasons.includes("owner_approval_signature_invalid"));
  const other = generateKeyPairSync("ed25519");
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence(), other.publicKey.export({ type: "spki", format: "pem" }).toString(), expected).reasons.includes("owner_approval_signature_invalid"));
  assert.ok(verifyWinMLOwnerTrainingApproval({ ...evidence(), signatureBase64: "not base64!" }, key, expected).reasons.includes("owner_approval_signature_encoding_invalid"));
});

test("expired, future and missing-key approvals are rejected", () => {
  const key = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence({ expiresAt: "2026-11-07T00:00:00.000Z" }), key, expected).reasons.includes("owner_approval_expired"));
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence({ approvedAt: "2026-11-11T00:00:00.000Z" }), key, expected).reasons.includes("owner_approval_not_yet_valid"));
  assert.ok(verifyWinMLOwnerTrainingApproval(evidence(), "", expected).reasons.includes("trusted_owner_approval_public_key_missing"));
});


test("signed revocation is bound to the approval, dataset and content hash", () => {
  const key = publicKey.export({ type: "spki", format: "pem" }).toString();
  const payload = {
    revocationVersion: "win.ml.owner-training-revocation.v1",
    revocationId: "revoke-2026-001",
    approvalId: "approval-2026-001",
    datasetId: expected.datasetId,
    datasetContentSha256: expected.datasetContentSha256,
    reviewerId: "owner:github-account",
    reason: "Licence review identified a restriction",
    revokedAt: "2026-11-09T12:00:00.000Z"
  };
  const signed = {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(payload)), privateKey).toString("base64")
  };
  assert.deepEqual(verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: payload.approvalId, datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256, approvedAt: "2026-11-06T09:00:00.000Z", now: expected.now
  }), { valid: true, reasons: [] });
  assert.ok(verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: "other-approval", datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256, approvedAt: "2026-11-06T09:00:00.000Z", now: expected.now
  }).reasons.includes("owner_revocation_approval_mismatch"));
  assert.ok(verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: payload.approvalId, datasetId: payload.datasetId,
    datasetContentSha256: "c".repeat(64), approvedAt: "2026-11-06T09:00:00.000Z", now: expected.now
  }).reasons.includes("owner_revocation_dataset_hash_mismatch"));
});

test("revocation cannot be future-dated or unsigned", () => {
  const key = publicKey.export({ type: "spki", format: "pem" }).toString();
  const payload = {
    revocationVersion: "win.ml.owner-training-revocation.v1",
    revocationId: "revoke-2026-002", approvalId: "approval-2026-001",
    datasetId: expected.datasetId, datasetContentSha256: expected.datasetContentSha256,
    reviewerId: "owner:github-account", reason: "Revocation for testing",
    revokedAt: "2026-11-11T12:00:00.000Z"
  };
  const signed = { payload, signatureBase64: sign(null, Buffer.from(canonicalizeWinMLProvenance(payload)), privateKey).toString("base64") };
  const result = verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: payload.approvalId, datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256, approvedAt: "2026-11-06T09:00:00.000Z", now: expected.now
  });
  assert.ok(result.reasons.includes("owner_revocation_not_yet_effective"));
  assert.ok(verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: payload.approvalId, datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256, approvedAt: "2026-11-06T09:00:00.000Z", now: expected.now
  }).reasons.includes("owner_revocation_not_yet_effective"));
  assert.ok(verifyWinMLOwnerTrainingRevocation(signed, key, {
    approvalId: payload.approvalId, datasetId: payload.datasetId,
    datasetContentSha256: payload.datasetContentSha256, approvedAt: "2026-11-10T00:00:00.000Z", now: expected.now
  }).reasons.includes("owner_revocation_predates_approval"));
});

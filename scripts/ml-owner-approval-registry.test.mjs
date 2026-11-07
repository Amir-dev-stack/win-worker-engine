import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { WIN_ML_DATASET_MANIFEST_VERSION, evaluateWinMLDatasetReadiness } from "../netlify/lib/ml-data-contract.mts";
import { canonicalizeWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import { hashWinMLLicenceEvidence } from "../netlify/lib/ml-licence-evidence.mts";

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      const etag = "owner-approval-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) { const item = records.get(key); return item ? clone(item.value) : null; },
    async getWithMetadata(key) { const item = records.get(key); return item ? { data: clone(item.value), etag: item.etag } : null; },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

test("owner approval registry records signed evidence once, reports it active, and revokes it immutably", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const trustedConfig = { publicKeyPem, reviewerId: "owner:amir" };
  const datasetId = "registry-test-football";
  const datasetHash = "a".repeat(64);
  const signPayload = payload => sign(null, Buffer.from(canonicalizeWinMLProvenance(payload)), privateKey).toString("base64");
  const licencePayload = {
    evidenceVersion: "win.ml.licence-review.v1", evidenceId: "licence-review-registry-1",
    licenceId: "CC0-1.0", sourceUrl: "https://example.test/licence",
    sourceDocumentSha256: "c".repeat(64), reviewedUse: "training", reviewerId: "owner:amir",
    reviewedAt: "2026-11-06T08:00:00.000Z", reviewExpiresAt: "2027-11-06T08:00:00.000Z",
    rationale: "Reviewed source terms and confirmed training permission."
  };
  const licenceEvidence = { payload: licencePayload, signatureBase64: signPayload(licencePayload) };
  const licenceEvidenceHash = hashWinMLLicenceEvidence(licencePayload);
  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const datasets = await import("../netlify/lib/ml-dataset-registry.mts");
    const registry = await import("../netlify/lib/ml-owner-approval-registry.mts");
    const manifest = {
      manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION, datasetId, providerId: "reviewed-source",
      sport: "association_football", competition: "test-league", season: "2026",
      sourceUrl: "https://example.test/results", licenceId: "CC0-1.0",
      attributionRequired: false, automationAllowed: false, approvedForTraining: false,
      permittedUse: "training", rowGrain: "match", eventTimePrecision: "instant",
      retrievedAt: "2026-11-06T08:00:00.000Z", rowCount: 120, labeledRowCount: 120,
      schemaVersion: "football.match.v2", contentSha256: datasetHash
    };
    await datasets.registerWinMLDatasetManifest(manifest);
    assert.deepEqual(await registry.registerWinMLLicenceReviewEvidence(
      licenceEvidence, trustedConfig, "2026-11-10T12:00:00.000Z"
    ), { recorded: true, idempotent: false, evidenceId: licencePayload.evidenceId, evidenceSha256: licenceEvidenceHash });
    assert.deepEqual(await registry.registerWinMLLicenceReviewEvidence(
      licenceEvidence, trustedConfig, "2026-11-10T12:00:00.000Z"
    ), { recorded: false, idempotent: true, evidenceId: licencePayload.evidenceId, evidenceSha256: licenceEvidenceHash });
    const conflictingLicencePayload = { ...licencePayload, rationale: "A conflicting review reuses this evidence ID." };
    const conflictingLicence = {
      payload: conflictingLicencePayload, signatureBase64: signPayload(conflictingLicencePayload)
    };
    await assert.rejects(
      registry.registerWinMLLicenceReviewEvidence(conflictingLicence, trustedConfig, "2026-11-10T12:00:00.000Z"),
      error => error.code === "licence_evidence_id_immutable_conflict"
    );
    const approvalPayload = {
      approvalVersion: "win.ml.owner-training-approval.v1",
      approvalId: "owner-registry-approval-1", datasetId, datasetContentSha256: datasetHash,
      licenceId: "CC0-1.0", licenceEvidenceSha256: licenceEvidenceHash,
      scope: "training", reviewerId: "owner:amir",
      approvedAt: "2026-11-06T09:00:00.000Z", expiresAt: "2028-12-06T09:00:00.000Z"
    };
    const approval = { payload: approvalPayload, signatureBase64: signPayload(approvalPayload) };
    assert.deepEqual(await registry.registerWinMLOwnerTrainingApproval(approval, trustedConfig, "2026-11-10T12:00:00.000Z"),
      { recorded: true, idempotent: false, approvalId: approvalPayload.approvalId });
    assert.deepEqual(await registry.registerWinMLOwnerTrainingApproval(approval, trustedConfig, "2026-11-10T12:00:00.000Z"),
      { recorded: false, idempotent: true, approvalId: approvalPayload.approvalId });
    assert.deepEqual(await registry.registerWinMLOwnerTrainingApproval(approval, trustedConfig, "2026-11-10T13:00:00.000Z"),
      { recorded: false, idempotent: true, approvalId: approvalPayload.approvalId },
      "resubmitting identical signed evidence later must not conflict because the registry recording timestamp differs");
    assert.equal((await registry.getWinMLOwnerTrainingApprovalStatus(approvalPayload.approvalId, trustedConfig, "2026-11-10T12:00:00.000Z")).status, "active");
    const readiness = await registry.evaluateWinMLTrainingReadiness(datasetId, approvalPayload.approvalId, trustedConfig, "2026-11-10T12:00:00.000Z");
    assert.equal(readiness.evidenceReady, true);
    assert.equal(readiness.modelFittingAllowed, false);
    assert.equal(readiness.productionPromotionAllowed, false);
    assert.equal(readiness.automatedBettingAllowed, false);
    await assert.rejects(registry.registerWinMLOwnerTrainingApproval(approval, { ...trustedConfig, reviewerId: "someone-else" }, "2026-11-10T12:00:00.000Z"),
      error => error.code === "owner_approval_reviewer_not_authorized");

    const unregisteredLicencePayload = {
      ...approvalPayload, approvalId: "owner-registry-unregistered-licence",
      licenceEvidenceSha256: "d".repeat(64)
    };
    const unregisteredLicence = {
      payload: unregisteredLicencePayload, signatureBase64: signPayload(unregisteredLicencePayload)
    };
    await assert.rejects(
      registry.registerWinMLOwnerTrainingApproval(unregisteredLicence, trustedConfig, "2026-11-10T12:00:00.000Z"),
      error => error.code === "owner_approval_licence_evidence_invalid" &&
        error.details.includes("registered_licence_evidence_missing")
    );

    const expiredLicenceReadiness = await registry.evaluateWinMLTrainingReadiness(
      datasetId, approvalPayload.approvalId, trustedConfig, "2027-12-06T12:00:00.000Z"
    );
    assert.equal(expiredLicenceReadiness.evidenceReady, false);
    assert.ok(expiredLicenceReadiness.reasons.includes("licence_review_expired"));

    const changedPayload = { ...approvalPayload, expiresAt: "2029-01-06T09:00:00.000Z" };
    const changed = { payload: changedPayload, signatureBase64: signPayload(changedPayload) };
    await assert.rejects(registry.registerWinMLOwnerTrainingApproval(changed, trustedConfig, "2026-11-10T12:00:00.000Z"),
      error => error.code === "owner_approval_id_immutable_conflict");

    const revokePayload = {
      revocationVersion: "win.ml.owner-training-revocation.v1",
      revocationId: "owner-registry-revocation-1", approvalId: approvalPayload.approvalId,
      datasetId, datasetContentSha256: datasetHash, reviewerId: "owner:amir",
      reason: "Licence review requires revocation", revokedAt: "2026-11-11T12:00:00.000Z"
    };
    const revocation = { payload: revokePayload, signatureBase64: signPayload(revokePayload) };
    await assert.rejects(registry.registerWinMLOwnerTrainingRevocation(revocation, trustedConfig, "2026-11-10T12:00:00.000Z"),
      error => error.code === "owner_revocation_evidence_invalid" && error.details.includes("owner_revocation_not_yet_effective"));
    assert.deepEqual(await registry.registerWinMLOwnerTrainingRevocation(revocation, trustedConfig, "2026-11-12T12:00:00.000Z"),
      { recorded: true, idempotent: false, approvalId: approvalPayload.approvalId });
    assert.equal((await registry.getWinMLOwnerTrainingApprovalStatus(approvalPayload.approvalId, trustedConfig, "2026-11-12T12:00:00.000Z")).status, "revoked");
    const revokedReadiness = await registry.evaluateWinMLTrainingReadiness(datasetId, approvalPayload.approvalId, trustedConfig, "2026-11-12T12:00:00.000Z");
    assert.equal(revokedReadiness.evidenceReady, false);
    assert.ok(revokedReadiness.reasons.some(reason => reason.startsWith("owner_approval_not_active:revoked")));
    assert.deepEqual(await registry.registerWinMLOwnerTrainingRevocation(revocation, trustedConfig, "2026-11-12T12:00:00.000Z"),
      { recorded: false, idempotent: true, approvalId: approvalPayload.approvalId });
    assert.deepEqual(await registry.registerWinMLOwnerTrainingRevocation(revocation, trustedConfig, "2026-11-12T13:00:00.000Z"),
      { recorded: false, idempotent: true, approvalId: approvalPayload.approvalId },
      "resubmitting identical revocation evidence must be idempotent");

    assert.equal(evaluateWinMLDatasetReadiness(manifest).eligible, false,
      "recording owner approval must not silently unlock model training before explicit readiness integration");
    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/ml-dataset-manifests/") ||
      key.startsWith("library/ml-licence-review-evidence/") ||
      key.startsWith("library/ml-licence-review-evidence-ids/") ||
      key.startsWith("library/ml-owner-training-approvals/") ||
      key.startsWith("library/ml-owner-training-revocations/")));
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

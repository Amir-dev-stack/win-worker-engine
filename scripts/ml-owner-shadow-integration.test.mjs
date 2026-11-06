import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { installIsolatedTestStore } from "../netlify/lib/store.mts";
import { canonicalizeWinMLProvenance } from "../netlify/lib/ml-provenance.mts";
import { hashWinMLLicenceEvidence } from "../netlify/lib/ml-licence-evidence.mts";
import { registerWinMLDatasetManifest } from "../netlify/lib/ml-dataset-registry.mts";
import {
  registerWinMLLicenceReviewEvidence,
  registerWinMLOwnerTrainingApproval,
  registerWinMLOwnerTrainingRevocation
} from "../netlify/lib/ml-owner-approval-registry.mts";
import {
  trainWinMLFootball1X2LogisticModel,
  evaluateWinMLFootball1X2LogisticModel,
  buildWinMLFootball1X2EvaluationRecord
} from "../netlify/lib/ml-football-logistic-trainer.mts";
import { registerWinMLModelArtifact, getWinMLModelArtifact } from "../netlify/lib/ml-model-artifact-registry.mts";
import { buildWinMLShadowPrediction, recordWinMLShadowPrediction, WinMLShadowPredictionError } from "../netlify/lib/ml-shadow-prediction.mts";

const records = new Map();
process.env.WIN_STORE_TEST_MODE = "1";
installIsolatedTestStore({
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && records.has(key)) return { modified: false };
    records.set(key, structuredClone(value));
    return { modified: true };
  },
  async get(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
  async *list({ prefix = "" } = {}) {
    yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
  },
  async delete(key) { records.delete(key); },
  async getWithMetadata(key) { return records.has(key) ? { data: structuredClone(records.get(key)), etag: "integration-etag" } : null; }
});

const datasetId = "signed-shadow-integration-dataset";
const approvalId = "signed-shadow-integration-approval";
const datasetHash = "a".repeat(64);
const now = new Date().toISOString();
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const reviewerId = "owner:integration-test";
const trustedConfig = { publicKeyPem, reviewerId };
const signPayload = payload => sign(null, Buffer.from(canonicalizeWinMLProvenance(payload)), privateKey).toString("base64");
const previousNetlify = globalThis.Netlify;
globalThis.Netlify = { env: { get(name) {
  if (name === "WIN_ML_OWNER_APPROVAL_PUBLIC_KEY") return publicKeyPem;
  if (name === "WIN_ML_OWNER_REVIEWER_ID") return reviewerId;
  return "";
} } };

function rows(offset, count) {
  return Array.from({ length: count }, (_, index) => {
    const absolute = offset + index;
    const outcome = ["HOME", "DRAW", "AWAY"][absolute % 3];
    const eventStart = new Date(Date.UTC(2026, 0, 1 + absolute)).toISOString();
    const predictionCutoff = new Date(Date.parse(eventStart) - 3600000).toISOString();
    const availableAt = new Date(Date.parse(eventStart) - 7200000).toISOString();
    const feature = value => ({ value, availableAt, sourceId: "signed-shadow-source-" + absolute });
    return {
      eventId: "signed-shadow-event-" + absolute,
      eventStart,
      predictionCutoff,
      labelAvailableAt: new Date(Date.parse(eventStart) + 21600000).toISOString(),
      outcome,
      features: {
        home_signal: feature(outcome === "HOME" ? 1 : 0),
        draw_signal: feature(outcome === "DRAW" ? 1 : 0),
        away_signal: feature(outcome === "AWAY" ? 1 : 0)
      }
    };
  });
}

test("signed owner approval unlocks only registered human shadow review and revocation blocks it", async () => {
  try {
    const manifest = {
      manifestVersion: "win.ml.dataset.v1",
      datasetId,
      providerId: "synthetic-integration-fixture",
      sport: "association_football",
      competition: "synthetic-integration",
      season: "2026-2027",
      sourceUrl: "https://example.test/synthetic-dataset",
      licenceId: "CC0-1.0",
      attributionRequired: false,
      automationAllowed: false,
      approvedForTraining: true,
      permittedUse: "training",
      rowGrain: "match",
      eventTimePrecision: "instant",
      retrievedAt: "2028-01-01T00:00:00.000Z",
      rowCount: 700,
      labeledRowCount: 700,
      schemaVersion: "synthetic.football.v1",
      contentSha256: datasetHash
    };
    await registerWinMLDatasetManifest(manifest);

    const licencePayload = {
      evidenceVersion: "win.ml.licence-review.v1",
      evidenceId: "signed-shadow-licence-review",
      licenceId: manifest.licenceId,
      sourceUrl: manifest.sourceUrl,
      sourceDocumentSha256: "c".repeat(64),
      reviewedUse: "training",
      reviewerId,
      reviewedAt: now,
      reviewExpiresAt: "2029-01-01T00:00:00.000Z",
      rationale: "Synthetic integration fixture; signed review used only to test the approval chain."
    };
    const licenceEvidence = { payload: licencePayload, signatureBase64: signPayload(licencePayload) };
    const licenceEvidenceSha256 = hashWinMLLicenceEvidence(licencePayload);
    await registerWinMLLicenceReviewEvidence(licenceEvidence, trustedConfig, now);

    const approvalPayload = {
      approvalVersion: "win.ml.owner-training-approval.v1",
      approvalId,
      datasetId,
      datasetContentSha256: datasetHash,
      licenceId: manifest.licenceId,
      licenceEvidenceSha256,
      scope: "training",
      reviewerId,
      approvedAt: now,
      expiresAt: "2029-01-01T00:00:00.000Z"
    };
    const approval = { payload: approvalPayload, signatureBase64: signPayload(approvalPayload) };
    await registerWinMLOwnerTrainingApproval(approval, trustedConfig, now);

    // Exercise approval failures against the same registry used by artifact registration.
    const invalidApproval = (approvalIdValue, overrides = {}, signature = null) => {
      const payload = { ...approvalPayload, approvalId: approvalIdValue, ...overrides };
      return { payload, signatureBase64: signature || signPayload(payload) };
    };
    await assert.rejects(
      registerWinMLOwnerTrainingApproval(invalidApproval("signed-shadow-wrong-hash", {
        datasetContentSha256: "b".repeat(64)
      }), trustedConfig, now),
      error => error.code === "owner_approval_evidence_invalid" &&
        error.details.includes("owner_approval_dataset_hash_mismatch")
    );
    await assert.rejects(
      registerWinMLOwnerTrainingApproval(invalidApproval("signed-shadow-wrong-licence", {
        licenceId: "LICENCE-NOT-IN-MANIFEST"
      }), trustedConfig, now),
      error => error.code === "owner_approval_evidence_invalid" &&
        error.details.includes("owner_approval_licence_mismatch")
    );
    await assert.rejects(
      registerWinMLOwnerTrainingApproval(invalidApproval("signed-shadow-expired", {
        expiresAt: "2026-01-01T00:00:00.000Z"
      }), trustedConfig, now),
      error => error.code === "owner_approval_evidence_invalid" &&
        error.details.includes("owner_approval_expired")
    );
    const forgedApproval = invalidApproval("signed-shadow-invalid-signature", {
      expiresAt: "2029-01-01T00:00:00.000Z"
    }, "Zm9yZ2Vk");
    await assert.rejects(
      registerWinMLOwnerTrainingApproval(forgedApproval, trustedConfig, now),
      error => error.code === "owner_approval_evidence_invalid" &&
        error.details.includes("owner_approval_signature_encoding_invalid")
    );

    const otherDatasetId = "signed-shadow-other-dataset";
    await registerWinMLDatasetManifest({
      ...manifest, datasetId: otherDatasetId, contentSha256: "f".repeat(64)
    });
    const wrongDatasetApprovalPayload = {
      ...approvalPayload,
      approvalId: "signed-shadow-wrong-dataset",
      datasetId: otherDatasetId,
      datasetContentSha256: "f".repeat(64)
    };
    await registerWinMLOwnerTrainingApproval({
      payload: wrongDatasetApprovalPayload,
      signatureBase64: signPayload(wrongDatasetApprovalPayload)
    }, trustedConfig, now);
    const wrongDatasetReadiness = await import("../netlify/lib/ml-owner-approval-registry.mts")
      .then(module => module.evaluateWinMLTrainingReadiness(datasetId, "signed-shadow-wrong-dataset", trustedConfig, now));
    assert.equal(wrongDatasetReadiness.evidenceReady, false);
    assert.ok(wrongDatasetReadiness.reasons.includes("owner_approval_dataset_mismatch"));

    const trainingRows = rows(0, 500);
    const validationRows = rows(501, 100);
    const testRows = rows(602, 100);
    const trained = trainWinMLFootball1X2LogisticModel({
      modelId: "signed-shadow-model",
      datasetId,
      datasetContentSha256: datasetHash,
      featureSchemaVersion: "win.football.form.v1",
      trainingRows,
      validationRows,
      config: { learningRate: 0.1, epochs: 1000, l2: 0.001 }
    });
    const evaluatedAt = "2028-01-01T00:00:00.000Z";
    const heldOut = evaluateWinMLFootball1X2LogisticModel(trained.artifact, testRows, evaluatedAt);
    const evaluation = buildWinMLFootball1X2EvaluationRecord(trained.artifact, heldOut, {
      modelVersion: "1.0.0",
      trainingRunId: "signed-shadow-integration-run",
      featureBuilderCommitSha: "d".repeat(40),
      sourceCommitSha: "e".repeat(40),
      trainedAt: "2027-05-16T00:00:00.000Z"
    });
    const registration = await registerWinMLModelArtifact({
      artifact: trained.artifact,
      evaluation,
      testRows,
      evaluatedAt,
      registeredAt: "2028-01-02T00:00:00.000Z",
      approvalId
    });
    assert.equal(registration.registered, true);
    assert.equal(registration.promotionReadiness.status, "eligible_for_human_shadow_review");
    assert.equal(registration.productionPromotionAllowed, false);
    assert.equal(registration.automatedBettingAllowed, false);

    const loaded = await getWinMLModelArtifact(trained.artifact.modelId, evaluation.modelVersion);
    assert.equal(loaded.ownerApprovalEvidenceReady, true);
    assert.equal(loaded.promotionReadiness.status, "eligible_for_human_shadow_review");

    const eventStart = "2028-01-10T19:00:00.000Z";
    const predictionCutoff = "2028-01-10T17:00:00.000Z";
    const features = {
      home_signal: { value: 1, availableAt: "2028-01-10T16:00:00.000Z", sourceId: "pre-match-home" },
      draw_signal: { value: 0, availableAt: "2028-01-10T16:00:00.000Z", sourceId: "pre-match-draw" },
      away_signal: { value: 0, availableAt: "2028-01-10T16:00:00.000Z", sourceId: "pre-match-away" }
    };
    const shadow = await buildWinMLShadowPrediction({
      predictionRunId: "signed-shadow-run",
      eventId: "signed-shadow-target-event",
      eventStart,
      predictionCutoff,
      generatedAt: "2028-01-10T17:01:00.000Z",
      modelId: trained.artifact.modelId,
      modelVersion: evaluation.modelVersion,
      features
    });
    assert.equal(shadow.validation.status, "eligible_for_shadow_only");
    assert.equal(shadow.prediction.usage, "shadow_only");
    assert.equal(shadow.productionUseAllowed, false);
    assert.equal(shadow.automatedBettingAllowed, false);
    const audit = await recordWinMLShadowPrediction(shadow.prediction, features);
    assert.equal(audit.recorded, true);

    const revocationPayload = {
      revocationVersion: "win.ml.owner-training-revocation.v1",
      revocationId: "signed-shadow-integration-revocation",
      approvalId,
      datasetId,
      datasetContentSha256: datasetHash,
      reviewerId,
      reason: "Integration test verifies revocation blocks subsequent shadow eligibility.",
      revokedAt: new Date().toISOString()
    };
    const revocation = { payload: revocationPayload, signatureBase64: signPayload(revocationPayload) };
    await registerWinMLOwnerTrainingRevocation(revocation, trustedConfig, revocationPayload.revokedAt);
    const afterRevocation = await getWinMLModelArtifact(trained.artifact.modelId, evaluation.modelVersion);
    assert.equal(afterRevocation.ownerApprovalEvidenceReady, false);
    assert.equal(afterRevocation.promotionReadiness.status, "blocked");
    await assert.rejects(() => buildWinMLShadowPrediction({
      predictionRunId: "signed-shadow-run-after-revocation",
      eventId: "signed-shadow-target-event-2",
      eventStart,
      predictionCutoff,
      generatedAt: "2028-01-10T17:01:00.000Z",
      modelId: trained.artifact.modelId,
      modelVersion: evaluation.modelVersion,
      features
    }), error => error instanceof WinMLShadowPredictionError &&
      error.code.startsWith("shadow_prediction_model_not_eligible"));
  } finally {
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

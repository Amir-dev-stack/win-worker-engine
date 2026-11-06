import test from "node:test";
import assert from "node:assert/strict";
import { installIsolatedTestStore, remove } from "../netlify/lib/store.mts";
import { registerWinMLDatasetManifest } from "../netlify/lib/ml-dataset-registry.mts";
import { registerWinMLModelArtifact, getWinMLModelArtifact, WinMLModelArtifactRegistryError } from "../netlify/lib/ml-model-artifact-registry.mts";
import { trainWinMLFootball1X2LogisticModel, evaluateWinMLFootball1X2LogisticModel, buildWinMLFootball1X2EvaluationRecord } from "../netlify/lib/ml-football-logistic-trainer.mts";

const values = new Map();
function makeStore() {
  return {
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      values.set(key, structuredClone(value)); return { modified: true };
    },
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async *list() { yield { blobs: [] }; },
    async delete(key) { values.delete(key); },
    async getWithMetadata(key) { return values.has(key) ? { data: structuredClone(values.get(key)), etag: "test-etag" } : null; }
  };
}
const testStore = makeStore();
process.env.WIN_STORE_TEST_MODE = "1";
installIsolatedTestStore(testStore);
async function resetRecords() {
  await remove("library/ml-model-artifacts", "registry-synthetic-model::0.1.0");
  await remove("library/ml-dataset-manifests", "registry-synthetic-data");
}
function rows(offset, count) {
  return Array.from({ length: count }, (_, index) => {
    const outcome = ["HOME", "DRAW", "AWAY"][index % 3];
    const eventStart = new Date(Date.UTC(2026, 0, 1 + offset + index)).toISOString();
    const predictionCutoff = new Date(Date.parse(eventStart) - 3600000).toISOString();
    const availableAt = new Date(Date.parse(eventStart) - 7200000).toISOString();
    const feature = value => ({ value, availableAt, sourceId: "synthetic-source-" + (offset + index) });
    return {
      eventId: "synthetic-" + (offset + index), eventStart, predictionCutoff,
      labelAvailableAt: new Date(Date.parse(eventStart) + 21600000).toISOString(), outcome,
      features: { home_signal: feature(outcome === "HOME" ? 1 : 0), draw_signal: feature(outcome === "DRAW" ? 1 : 0), away_signal: feature(outcome === "AWAY" ? 1 : 0) }
    };
  });
}
function setup() {
  const trained = trainWinMLFootball1X2LogisticModel({
    modelId: "registry-synthetic-model", datasetId: "registry-synthetic-data", datasetContentSha256: "a".repeat(64),
    featureSchemaVersion: "win.football.form.v1", trainingRows: rows(0, 60), validationRows: rows(60, 30),
    config: { learningRate: 0.1, epochs: 500, l2: 0.001 }
  });
  const heldOut = evaluateWinMLFootball1X2LogisticModel(trained.artifact, rows(91, 30), "2027-01-03T00:00:00.000Z");
  const evaluation = buildWinMLFootball1X2EvaluationRecord(trained.artifact, heldOut, {
    modelVersion: "0.1.0", trainingRunId: "synthetic-run", featureBuilderCommitSha: "d".repeat(40),
    sourceCommitSha: "e".repeat(40), trainedAt: "2026-03-01T07:00:00.000Z"
  });
  return { artifact: trained.artifact, evaluation, testRows: rows(91, 30), evaluatedAt: "2027-01-03T00:00:00.000Z" };
}
const manifest = {
  manifestVersion: "win.ml.dataset.v1", datasetId: "registry-synthetic-data", providerId: "synthetic",
  sport: "association_football", competition: "synthetic", season: "2026", sourceUrl: "https://example.test/data",
  licenceId: "synthetic-research", attributionRequired: false, automationAllowed: false, approvedForTraining: false,
  permittedUse: "research_only", rowGrain: "match", eventTimePrecision: "instant", retrievedAt: "2027-01-02T00:00:00.000Z",
  rowCount: 120, labeledRowCount: 120, schemaVersion: "synthetic.v1", contentSha256: "a".repeat(64)
};
test("model artifact registry immutably binds artifact, evaluation and registered dataset", async () => {
  await resetRecords();
  const { artifact, evaluation, testRows, evaluatedAt } = setup();
  await registerWinMLDatasetManifest(manifest);
  const first = await registerWinMLModelArtifact({ artifact, evaluation, testRows, evaluatedAt, registeredAt: "2027-01-03T00:00:00.000Z" });
  assert.equal(first.registered, true);
  assert.equal(first.productionPromotionAllowed, false);
  assert.equal(first.automatedBettingAllowed, false);
  assert.equal(first.promotionReadiness.status, "blocked");
  const second = await registerWinMLModelArtifact({ artifact, evaluation, testRows, evaluatedAt, registeredAt: "2027-01-03T00:00:00.000Z" });
  assert.equal(second.idempotent, true);
  const loaded = await getWinMLModelArtifact(artifact.modelId, evaluation.modelVersion);
  assert.equal(loaded.artifact.artifactSha256, artifact.artifactSha256);
  assert.equal(loaded.evaluation.artifactSha256, artifact.artifactSha256);
  assert.equal(loaded.productionPromotionAllowed, false);
});
test("model artifact registry rejects dataset hash drift and immutable version conflicts", async () => {
  await resetRecords();
  const { artifact, evaluation, testRows, evaluatedAt } = setup();
  await registerWinMLDatasetManifest(manifest);
  await assert.rejects(() => registerWinMLModelArtifact({
    artifact: { ...artifact, datasetContentSha256: "b".repeat(64) }, evaluation, testRows, evaluatedAt,
    registeredAt: "2027-01-03T00:00:00.000Z"
  }), /model_artifact_hash_mismatch/);
  await registerWinMLModelArtifact({ artifact, evaluation, testRows, evaluatedAt, registeredAt: "2027-01-03T00:00:00.000Z" });
  await assert.rejects(() => registerWinMLModelArtifact({
    artifact, evaluation, testRows, evaluatedAt,
    registeredAt: "2027-01-04T00:00:00.000Z"
  }), /model_artifact_immutable_conflict/);
});
test("model artifact registration rejects caller-forged held-out metrics", async () => {
  await resetRecords();
  const { artifact, evaluation, testRows, evaluatedAt } = setup();
  await registerWinMLDatasetManifest(manifest);
  await assert.rejects(() => registerWinMLModelArtifact({ artifact, evaluation: { ...evaluation, modelMetrics: { ...evaluation.modelMetrics, brier: 0 } }, testRows, evaluatedAt, registeredAt: "2027-01-03T00:00:00.000Z" }), /model_artifact_held_out_evaluation_mismatch/);
});
test("model artifact retrieval fails closed after stored record tampering", async () => {
  await resetRecords();
  const { artifact, evaluation, testRows, evaluatedAt } = setup();
  await registerWinMLDatasetManifest(manifest);
  await registerWinMLModelArtifact({ artifact, evaluation, testRows, evaluatedAt, registeredAt: "2027-01-03T00:00:00.000Z" });
  await testStore.setJSON("library/ml-model-artifacts/registry-synthetic-model::0.1.0", { recordVersion: "tampered" });
  await assert.rejects(() => getWinMLModelArtifact("registry-synthetic-model", "0.1.0"), error =>
    error instanceof WinMLModelArtifactRegistryError || /model_artifact/.test(error.message)
  );
});

test("model artifact registry rejects impossible registration and evaluation dates", async () => {
  await resetRecords();
  const { artifact, evaluation, testRows, evaluatedAt } = setup();
  await registerWinMLDatasetManifest(manifest);
  await assert.rejects(() => registerWinMLModelArtifact({
    artifact, evaluation, testRows, evaluatedAt,
    registeredAt: "2026-02-31T00:00:00.000Z"
  }), /model_artifact_registration_metadata_invalid/);
  await assert.rejects(() => registerWinMLModelArtifact({
    artifact, evaluation, testRows,
    evaluatedAt: "2026-02-31T00:00:00.000Z",
    registeredAt: "2027-01-03T00:00:00.000Z"
  }), /model_artifact_test_evaluation_evidence_invalid/);
});

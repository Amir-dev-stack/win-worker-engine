import test from "node:test";
import assert from "node:assert/strict";
import { WIN_ML_DATASET_MANIFEST_VERSION } from "../netlify/lib/ml-data-contract.mts";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      const etag = "ml-registry-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) {
      const item = records.get(key);
      return item ? clone(item.value) : null;
    },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

const manifest = (overrides = {}) => ({
  manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
  datasetId: "football-results-2026",
  providerId: "owner-reviewed-public-source",
  sport: "association_football",
  competition: "example-league",
  season: "2025-26",
  sourceUrl: "https://example.test/results",
  licenceId: "CC0-1.0",
  attributionRequired: false,
  automationAllowed: false,
  approvedForTraining: false,
  permittedUse: "research_only",
  rowGrain: "match",
  eventTimePrecision: "instant",
  retrievedAt: "2026-11-05T12:00:00.000Z",
  rowCount: 120,
  labeledRowCount: 120,
  schemaVersion: "football.match.v1",
  contentSha256: "a".repeat(64),
  ...overrides
});

test("ML dataset registry is isolated, immutable, idempotent and keeps approval separate", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();

  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const registry = await import("../netlify/lib/ml-dataset-registry.mts");

    const researchOnly = manifest();
    const first = await registry.registerWinMLDatasetManifest(researchOnly);
    assert.equal(first.registered, true);
    assert.equal(first.idempotent, false);

    const repeated = await registry.registerWinMLDatasetManifest({ ...researchOnly });
    assert.equal(repeated.registered, false);
    assert.equal(repeated.idempotent, true);

    // Missing optional metadata and explicit null are distinct manifest states.
    await assert.rejects(
      registry.registerWinMLDatasetManifest({ ...researchOnly, attributionText: null }),
      error => error.code === "dataset_manifest_immutable_conflict"
    );

    await assert.rejects(
      registry.registerWinMLDatasetManifest(manifest({ contentSha256: "b".repeat(64) })),
      error => error.code === "dataset_manifest_immutable_conflict"
    );

    assert.equal((await registry.getWinMLDatasetManifest(researchOnly.datasetId)).permittedUse, "research_only");
    const inventory = await registry.listWinMLDatasetManifests(10);
    assert.equal(inventory.length, 1);
    assert.equal(inventory[0].approvedForTraining, false,
      "cataloguing a research-only dataset must not silently approve training");


    const concurrentId = "concurrent-football-2026";
    const competing = await Promise.allSettled([
      registry.registerWinMLDatasetManifest(manifest({ datasetId: concurrentId, contentSha256: "c".repeat(64) })),
      registry.registerWinMLDatasetManifest(manifest({ datasetId: concurrentId, contentSha256: "d".repeat(64) }))
    ]);
    assert.equal(competing.filter(result => result.status === "fulfilled").length, 1,
      "atomic registration must allow only one manifest to win a concurrent ID race");
    assert.equal(competing.filter(result => result.status === "rejected").length, 1,
      "the competing different manifest must fail closed");

    await assert.rejects(
      registry.registerWinMLDatasetManifest(manifest({ datasetId: "../unsafe" })),
      error => error.code === "dataset_id_invalid"
    );

    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/ml-dataset-manifests/")),
      "the isolated test may write only ML dataset manifest records");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

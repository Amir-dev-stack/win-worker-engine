import test from "node:test";
import assert from "node:assert/strict";
import { WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA } from "../netlify/lib/ml-football-importer.mts";

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
      const etag = "workflow-etag-" + (++revision);
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
const source = {
  datasetId: "workflow-football-research",
  providerId: "synthetic-fixture",
  competition: "Synthetic League",
  season: "2025-26",
  sourceUrl: "https://example.test/results",
  sourceRevision: "synthetic-fixture-rev-1",
  licenceId: "TEST-ONLY-NOT-LEGAL-APPROVAL",
  attributionRequired: false,
  retrievedAt: "2026-11-05T12:00:00.000Z"
};
const bytes = new TextEncoder().encode(JSON.stringify({
  schemaVersion: WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA,
  records: [{
    sourceRecordId: "row-1", eventId: "match-1",
    kickoff: "2026-10-01T18:00:00.000Z",
    resultAvailableAt: "2026-10-01T20:00:00.000Z",
    scoreBasis: "regulation_time",
    competitionId: "synthetic", season: "2025-26",
    homeTeamId: "home", awayTeamId: "away",
    homeGoals: 2, awayGoals: 0, status: "finished"
  }]
}));

test("research import workflow registers only manifest metadata and is idempotent", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const { ingestWinFootballResultsResearchSample } = await import("../netlify/lib/ml-football-import-workflow.mts");

    const first = await ingestWinFootballResultsResearchSample(bytes, source);
    assert.equal(first.registration.registered, true);
    assert.equal(first.registration.idempotent, false);
    assert.equal(first.rows.length, 1);
    assert.equal(first.manifest.approvedForTraining, false);
    assert.equal(first.manifest.permittedUse, "research_only");
    assert.equal(first.manifest.automationAllowed, false);

    const second = await ingestWinFootballResultsResearchSample(bytes, source);
    assert.equal(second.registration.registered, false);
    assert.equal(second.registration.idempotent, true);
    assert.deepEqual(second.rows, first.rows);

    assert.deepEqual([...memoryStore.records.keys()], [
      "library/ml-dataset-manifests/workflow-football-research"
    ], "the workflow must persist manifest metadata only, never raw bytes or match rows");

    const changedBytes = new TextEncoder().encode(JSON.stringify({
      schemaVersion: WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA,
      records: [{
        sourceRecordId: "row-1", eventId: "match-1",
        kickoff: "2026-10-01T18:00:00.000Z",
        resultAvailableAt: "2026-10-01T20:00:00.000Z",
        scoreBasis: "regulation_time",
        competitionId: "synthetic", season: "2025-26",
        homeTeamId: "home", awayTeamId: "away",
        homeGoals: 3, awayGoals: 0, status: "finished"
      }]
    }));
    await assert.rejects(
      ingestWinFootballResultsResearchSample(changedBytes, source),
      error => error.code === "dataset_manifest_immutable_conflict"
    );
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

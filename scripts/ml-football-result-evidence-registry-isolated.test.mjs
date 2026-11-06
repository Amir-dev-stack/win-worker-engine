import test from "node:test";
import assert from "node:assert/strict";

function createMemoryStore() {
  const records = new Map();
  return {
    records,
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value));
      return { modified: true };
    },
    async get(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
    async getWithMetadata(key) {
      return records.has(key) ? { data: structuredClone(records.get(key)), etag: "test-etag" } : null;
    },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

const primary = {
  evidenceVersion: "win.football.result-evidence.v1", providerId: "provider-a",
  independenceGroup: "publisher-a", sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  sourceRecordId: "a-1", recordSha256: "a".repeat(64),
  retrievedAt: "2026-11-01T22:00:00.000Z", resultAvailableAt: "2026-11-01T20:00:00.000Z",
  eventId: "event-1", competitionId: "league-1", kickoff: "2026-11-01T18:00:00.000Z",
  homeTeamId: "home", awayTeamId: "away", scoreBasis: "regulation_time", homeGoals: 2, awayGoals: 1
};
const corroborating = { ...primary, providerId: "provider-b", independenceGroup: "publisher-b",
  sourceRecordId: "b-1", recordSha256: "b".repeat(64) };

test("football result evidence registry refuses providers without server-reviewed upstream identity", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const registry = await import("../netlify/lib/ml-football-result-evidence-registry.mts");
    await assert.rejects(
      registry.registerWinFootballResultEvidence({
        primary, corroborating, createdAt: "2026-11-02T00:00:00.000Z"
      }),
      error => error.code === "result_evidence_source_identity_unverified"
    );
    assert.equal(memoryStore.records.size, 0);
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

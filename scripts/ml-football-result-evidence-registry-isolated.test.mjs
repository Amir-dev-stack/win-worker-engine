import test from "node:test";
import assert from "node:assert/strict";

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    records,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      const etag = "result-evidence-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) { const item = records.get(key); return item ? clone(item.value) : null; },
    async getWithMetadata(key) { const item = records.get(key); return item ? { data: clone(item.value), etag: item.etag } : null; },
    async delete(key) { records.delete(key); },
    async *list({ prefix = "" } = {}) { yield { blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
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

test("football result evidence registry persists immutable matching and conflicting pairs", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  try {
    const store = await import("../netlify/lib/store.mts");
    store.installIsolatedTestStore(memoryStore);
    const registry = await import("../netlify/lib/ml-football-result-evidence-registry.mts");
    const args = { primary, corroborating, createdAt: "2026-11-02T00:00:00.000Z" };
    const first = await registry.registerWinFootballResultEvidence(args);
    assert.equal(first.registered, true);
    assert.equal(first.reconciliationStatus, "source_diverse_match");
    assert.equal(first.trainingApprovalGranted, false);
    const repeated = await registry.registerWinFootballResultEvidence(args);
    assert.equal(repeated.idempotent, true);
    const stored = await registry.getWinFootballResultEvidence(first.evidenceId);
    assert.equal(stored.reconciliationStatus, "source_diverse_match");
    assert.equal(stored.trainingApprovalGranted, false);

    const conflict = await registry.registerWinFootballResultEvidence({
      ...args, corroborating: { ...corroborating, homeGoals: 3 }
    });
    assert.equal(conflict.registered, true);
    assert.equal(conflict.reconciliationStatus, "source_diverse_conflict");
    assert.notEqual(conflict.evidenceId, first.evidenceId);

    assert.equal([...memoryStore.records.keys()].length, 2);
    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/ml-football-result-evidence/")));
    
    // Reuse the same process-wide adapter: store.mts intentionally forbids replacement.
    await assert.rejects(
      registry.registerWinFootballResultEvidence({
        primary, corroborating: { ...corroborating, providerId: primary.providerId },
        createdAt: "2026-11-02T00:00:00.000Z"
      }),
      error => error.code === "result_evidence_unverifiable"
    );
    const saved = await registry.registerWinFootballResultEvidence({
      primary, corroborating, createdAt: "2026-11-02T00:00:00.000Z"
    });
    const storageKey = "library/ml-football-result-evidence/" + saved.evidenceId;
    const tampered = memoryStore.records.get(storageKey);
    tampered.value.primary.homeGoals = 9;
    await assert.rejects(
      registry.getWinFootballResultEvidence(saved.evidenceId),
      error => ["result_evidence_reconciliation_mismatch", "result_evidence_record_hash_mismatch"].includes(error.code)
    );
    await assert.rejects(
      registry.getWinFootballResultEvidence("../bad"),
      error => error.code === "result_evidence_id_invalid"
    );
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});


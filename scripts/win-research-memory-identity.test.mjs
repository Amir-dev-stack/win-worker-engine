import test from "node:test";
import assert from "node:assert/strict";

function fakeStore() {
  const map = new Map();
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    async setJSON(key, value, options = {}) {
      const old = map.get(key);
      if (options.onlyIfNew && old) return { modified: false };
      if (options.onlyIfMatch && (!old || old.etag !== options.onlyIfMatch))
        return { modified: false };
      map.set(key, { value: clone(value), etag: "etag-" + map.size });
      return { modified: true };
    },
    async get(key) { return map.has(key) ? clone(map.get(key).value) : null; },
    async *list({ prefix = "" } = {}) {
      yield { blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
    },
    async getWithMetadata(key) {
      const row = map.get(key);
      return row ? { data: clone(row.value), etag: row.etag } : null;
    }
  };
}

test("punctuation-colliding assignments persist separately, retain private scope, and promote exact records", async () => {
  process.env.WIN_STORE_TEST_MODE = "1";
  const store = await import("../netlify/lib/store.mts");
  store.installIsolatedTestStore(fakeStore());
  const memory = await import("../netlify/lib/win-research-memory.mts");
  const evidence = [{ title: "Evidence", url: "https://example.org", retrievedAt: "2026-11-08", note: "Public reference" }];
  try {
    const a = await memory.rememberResearchSubmission({
      agentId:"agent-A", assignmentId:"task/a", division:"R1",
      summary:"Distinct A", findings:["one"], limitations:["bounded"], evidence
    });
    const b = await memory.rememberResearchSubmission({
      agentId:"agent-A", assignmentId:"task?a", division:"R1",
      summary:"Distinct B", findings:["two"], limitations:["bounded"], evidence
    });
    assert.notEqual(a.id, b.id);
    assert.equal(a.summary, "Distinct A");
    assert.equal(b.summary, "Distinct B");
    assert.equal((await memory.getResearchAgentMemory("agent-A")).privateResearch.length, 2);
    assert.equal((await memory.getResearchAgentMemory("other")).privateResearch.length, 0);
    assert.deepEqual((await memory.getResearchAgentMemory("other")).sharedValidatedResearch, []);
    const accepted = await memory.promoteReviewedResearchMemory({
      agentId:"agent-A", assignmentId:"task?a", reviewerId:"reviewer-B"
    });
    assert.equal(accepted.summary, "Distinct B");
    assert.equal(accepted.assignmentId, "task?a");
    assert.equal((await memory.getResearchAgentMemory("other")).sharedValidatedResearch.length, 1);
    assert.equal((await memory.getResearchAgentMemory("other")).sharedValidatedResearch[0].summary, "Distinct B");
    const repeat = await memory.rememberResearchSubmission({
      agentId:"agent-A", assignmentId:"task/a", division:"R1",
      summary:"Must not overwrite", findings:["new"], limitations:["bounded"], evidence
    });
    assert.equal(repeat.summary, "Distinct A");
  } finally {
    delete process.env.WIN_STORE_TEST_MODE;
  }
});

test("hash-based memory keys do not overlap across ambiguous pairs or truncation", async () => {
  const { researchMemoryKey } = await import("../netlify/lib/win-research-memory.mts");
  assert.notEqual(researchMemoryKey("agent", "a__b"), researchMemoryKey("agent__a", "b"));
  assert.notEqual(researchMemoryKey("agent", "x".repeat(120)+"1"), researchMemoryKey("agent", "x".repeat(120)+"2"));
  assert.match(researchMemoryKey("agent", "task/a"), /^v2_[a-f0-9]{64}$/);
});

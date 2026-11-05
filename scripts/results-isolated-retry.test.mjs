import test from "node:test";
import assert from "node:assert/strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  const writes = [];
  let revision = 0;
  let failOnceForPrefix = null;

  return {
    records,
    writes,
    failOnce(prefix) { failOnceForPrefix = prefix; },
    async setJSON(key, value, options = {}) {
      if (failOnceForPrefix && key.startsWith(failOnceForPrefix)) {
        failOnceForPrefix = null;
        throw new Error("Injected isolated storage failure: " + key);
      }
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing?.etag ?? null };
      }
      const etag = "isolated-result-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      writes.push(key);
      return { modified: true, etag };
    },
    async get(key) {
      const item = records.get(key);
      return item ? clone(item.value) : null;
    },
    async *list({ prefix = "" } = {}) {
      const blobs = [...records.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => ({ key }));
      yield { blobs };
    },
    async delete(key) { records.delete(key); },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    }
  };
}

test("result submission retry repairs a partial projection in an isolated store", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  const previousNetlify = globalThis.Netlify;
  process.env.WIN_STORE_TEST_MODE = "1";
  globalThis.Netlify = {
    env: { get: name => name === "WIN_INTERNAL_TOKEN" ? "isolated-test-token" : undefined }
  };

  const memoryStore = createMemoryStore();
  const { installIsolatedTestStore, put, get, list } = await import("../netlify/lib/store.mts");
  installIsolatedTestStore(memoryStore);
  const { default: submitResult } = await import("../netlify/functions/results.mts");

  const submit = (predictionId, outcome = "won") => submitResult(new Request("https://win.test/api/results", {
    method: "POST",
    headers: {
      authorization: "Bearer isolated-test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      predictionId,
      outcome,
      settlementSource: "https://evidence.example/match-result",
      evidence: ["https://evidence.example/official-score"]
    })
  }));

  try {
    await put("predictions", "result-retry-fixture", {
      id: "result-retry-fixture",
      runId: "isolated-run",
      brief: { sport: "football", event: "Synthetic FC vs Test United" },
      coupons: []
    });

    memoryStore.failOnce("library/settled-results/");
    await assert.rejects(
      () => submit("result-retry-fixture"),
      /Injected isolated storage failure/
    );

    const partialResults = await list("results", 20);
    assert.equal(partialResults.length, 1, "the canonical result write happened before the injected projection failure");
    assert.equal(await get("library/settled-results", partialResults[0].id), null,
      "the failed projection must remain visibly absent before retry");

    const retryResponse = await submit("result-retry-fixture");
    assert.equal(retryResponse.status, 200, "a retry should resume an existing same-outcome result");
    const retried = await retryResponse.json();
    assert.equal(retried.outcome, "won");
    assert.equal(retried.learningStatus, "recorded");

    const [results, settled, lessons, settlementLearning] = await Promise.all([
      list("results", 20),
      list("library/settled-results", 20),
      list("library/lessons", 20),
      list("library/settlement-learning", 20)
    ]);
    assert.equal(results.length, 1);
    assert.equal(settled.length, 1);
    assert.equal(lessons.length, 1);
    assert.equal(settlementLearning.length, 1);
    assert.equal(results[0].id, retried.id);
    assert.equal(settled[0].id, retried.id);
    assert.equal(lessons[0].id, "prediction-settlement-result-retry-fixture");
    assert.equal(settlementLearning[0].id, "prediction-settlement-result-retry-fixture");

    const repeatedResponse = await submit("result-retry-fixture");
    assert.equal(repeatedResponse.status, 200);
    const repeated = await repeatedResponse.json();
    assert.equal(repeated.id, retried.id, "an identical retry must retain the canonical result ID");

    const conflictResponse = await submit("result-retry-fixture", "lost");
    assert.equal(conflictResponse.status, 409, "a conflicting outcome must require the explicit correction workflow");
    const conflict = await conflictResponse.json();
    assert.equal(conflict.existingOutcome, "won");

    assert.ok(memoryStore.writes.every(key =>
      key.startsWith("predictions/") ||
      key.startsWith("results/") ||
      key.startsWith("library/settled-results/") ||
      key.startsWith("library/lessons/") ||
      key.startsWith("library/settlement-learning/")
    ), "the test must write only synthetic records to the isolated in-memory adapter");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
    if (previousNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = previousNetlify;
  }
});

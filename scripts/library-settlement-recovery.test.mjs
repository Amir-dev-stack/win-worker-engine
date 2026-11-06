import test from "node:test";
import assert from "node:assert/strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  let failOnceForPrefix = null;
  return {
    records,
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
      const etag = "coupon-settlement-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async get(key) {
      const item = records.get(key);
      return item ? clone(item.value) : null;
    },
    async *list({ prefix = "" } = {}) {
      const keys = [...records.keys()].filter(key => key.startsWith(prefix));
      for (let offset = 0; offset < keys.length; offset += 50) {
        yield { blobs: keys.slice(offset, offset + 50).map(key => ({ key })) };
      }
    },
    async delete(key) { records.delete(key); },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    }
  };
}

test("WIN coupon settlement retries repair interrupted learning writes without duplicate history", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  const { installIsolatedTestStore, put, get, list } = await import("../netlify/lib/store.mts");
  installIsolatedTestStore(memoryStore);
  const { settleCouponRecord } = await import("../netlify/lib/library.mts");

  const couponId = "win-coupon-settlement-recovery";
  const input = {
    couponId,
    outcome: "won",
    settlementSource: "https://official.example/fixture-result",
    evidence: ["https://official.example/final-score"]
  };

  try {
    await put("library/coupons", couponId, {
      id: couponId,
      origin: "win",
      outcome: "pending",
      sport: "football",
      competition: "Synthetic League",
      selections: [{ event: "Synthetic FC vs Test United", market: "1X2", pick: "home", odds: 1.8 }]
    });

    // The canonical coupon, split outcome projection, history and lesson are
    // written before the second learning projection; fail at that boundary.
    memoryStore.failOnce("library/settlement-learning/");
    await assert.rejects(
      () => settleCouponRecord(input),
      /Injected isolated storage failure/
    );
    const partial = await get("library/coupons", couponId);
    assert.equal(partial.outcome, "won");
    assert.equal(partial.learningStatus, "available_for_review");
    assert.equal((await list("library/winning-coupons", 20)).length, 1);
    assert.equal((await list("library/coupon-history", 20)).length, 1);
    assert.equal((await list("library/lessons", 20)).length, 1);
    assert.equal((await list("library/settlement-learning", 20)).length, 0);
    assert.equal((await list("library/coupon-settlement-claims", 20)).length, 1);

    const recovered = await settleCouponRecord(input);
    assert.equal(recovered.outcome, "won");
    assert.equal(recovered.learningStatus, "recorded");
    assert.equal(recovered.settlementLearningId, "settlement-" + couponId);

    const [coupons, winning, histories, lessons, learning, claims] = await Promise.all([
      list("library/coupons", 20),
      list("library/winning-coupons", 20),
      list("library/coupon-history", 20),
      list("library/lessons", 20),
      list("library/settlement-learning", 20),
      list("library/coupon-settlement-claims", 20)
    ]);
    assert.equal(coupons.length, 1);
    assert.equal(coupons[0].learningStatus, "recorded");
    assert.equal(winning.length, 1);
    assert.equal(histories.length, 1, "settlement history must use a stable identity");
    assert.equal(lessons.length, 1);
    assert.equal(learning.length, 1);
    assert.equal(claims.length, 1);

    const repeated = await settleCouponRecord(input);
    assert.equal(repeated.outcome, "won");
    assert.equal((await list("library/coupon-history", 20)).length, 1);
    assert.equal((await list("library/settlement-learning", 20)).length, 1);

    await assert.rejects(
      () => settleCouponRecord({ ...input, outcome: "lost" }),
      /different immutable settlement claim|explicit correction workflow/
    );
    assert.equal((await get("library/coupons", couponId)).outcome, "won",
      "a conflicting resubmission must not overwrite the original settlement");

    await put("library/coupons", "legacy-settled-without-claim", {
      id: "legacy-settled-without-claim", origin: "win", outcome: "lost"
    });
    await assert.rejects(
      () => settleCouponRecord({ ...input, couponId: "legacy-settled-without-claim" }),
      /without a matching immutable claim/
    );

    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/coupons/") ||
      key.startsWith("library/winning-coupons/") ||
      key.startsWith("library/coupon-history/") ||
      key.startsWith("library/coupon-settlement-claims/") ||
      key.startsWith("library/lessons/") ||
      key.startsWith("library/settlement-learning/")
    ), "the fixture must write only synthetic records to the isolated adapter");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

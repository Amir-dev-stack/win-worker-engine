import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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
      const etag = "review-recovery-etag-" + (++revision);
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

test("independent coupon review resumes after coupon settlement but before learning projection completion", async () => {
  const previousFlag = process.env.WIN_STORE_TEST_MODE;
  process.env.WIN_STORE_TEST_MODE = "1";
  const memoryStore = createMemoryStore();
  const { installIsolatedTestStore, put, get, list } = await import("../netlify/lib/store.mts");
  installIsolatedTestStore(memoryStore);
  const { reviewCaseForIsolatedTest } = await import("../netlify/functions/independent-review.mts");

  const caseType = "human_coupon";
  const caseId = "human-case-recovery";
  const couponId = "human-coupon-recovery";
  const operationId = "review-" + createHash("sha256").update(caseType + ":" + caseId).digest("hex").slice(0, 40);
  const body = {
    caseType,
    caseId,
    decision: "approve",
    reviewerName: "Independent Reviewer",
    reviewerNotes: "I checked the official event result, the event identity and the applicable market settlement rules independently.",
    evidenceUrls: ["https://official.example/match-result"],
    checks: {
      eventIdentityConfirmed: true,
      marketRulesConfirmed: true,
      everySelectionReviewed: true,
      evidenceIndependent: true
    }
  };
  const reviewer = { credentialId: "reviewer-credential-2" };

  try {
    await put("library/coupons", couponId, {
      id: couponId,
      origin: "human",
      outcome: "pending",
      sport: "football",
      competition: "Synthetic League",
      combinedOdds: 2.1,
      selections: [{ event: "Synthetic FC vs Test United", market: "1X2", pick: "home", odds: 2.1 }]
    });
    await put("library/human-settlement-cases", caseId, {
      id: caseId,
      couponId,
      claimedOutcome: "won",
      evidenceUrl: "https://results.example/final-score",
      sourceCouponUrl: "https://coupon.example/slip",
      evidenceSummary: "Synthetic fixture evidence",
      submitterCredentialId: "submitter-credential-1",
      reviewStatus: "pending_independent_review",
      submittedAt: "2026-11-06T00:00:00.000Z"
    });

    // The coupon and its outcome index are written before the learning projection.
    // Inject a crash at that boundary to exercise the exact retry path.
    memoryStore.failOnce("library/settlement-learning/");
    await assert.rejects(
      () => reviewCaseForIsolatedTest(body, reviewer),
      /Injected isolated storage failure/
    );

    const partiallySettledCoupon = await get("library/coupons", couponId);
    assert.equal(partiallySettledCoupon.outcome, "won");
    assert.equal(partiallySettledCoupon.settlementLearningId, "human-settlement-" + couponId);
    assert.equal((await list("library/winning-coupons", 20)).length, 1);
    assert.equal(await get("library/settlement-learning", "human-settlement-" + couponId), null);

    // Simulate the operation lease expiring after the process crash.
    const operationKey = "library/review-operations/" + operationId;
    const storedOperation = memoryStore.records.get(operationKey);
    assert.ok(storedOperation, "the in-progress review operation must remain recoverable");
    await memoryStore.setJSON(operationKey, {
      ...storedOperation.value,
      leaseExpiresAt: "2000-01-01T00:00:00.000Z"
    });

    const recovered = await reviewCaseForIsolatedTest(body, reviewer);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.outcomeApplied, true);
    assert.equal(recovered.body.settlementLearningId, "human-settlement-" + couponId);

    const [coupons, winning, histories, lessons, settlementLearning, cases] = await Promise.all([
      list("library/coupons", 20),
      list("library/winning-coupons", 20),
      list("library/coupon-history", 20),
      list("library/lessons", 20),
      list("library/settlement-learning", 20),
      list("library/human-settlement-cases", 20)
    ]);
    assert.equal(coupons.length, 1);
    assert.equal(winning.length, 1);
    assert.equal(histories.length, 1, "stable history identity must prevent duplicate history rows");
    assert.equal(lessons.length, 1, "the learning lesson must be repaired idempotently");
    assert.equal(settlementLearning.length, 1, "the settlement-learning projection must be completed once");
    assert.equal(cases[0].reviewStatus, "approved");
    assert.equal(cases[0].outcomeApplied, true);
    const completedOperation = await get("library/review-operations", operationId);
    assert.equal(completedOperation.status, "completed");

    const repeated = await reviewCaseForIsolatedTest(body, reviewer);
    assert.equal(repeated.status, 200);
    assert.equal((await list("library/coupon-history", 20)).length, 1);
    assert.equal((await list("library/settlement-learning", 20)).length, 1);

    assert.ok([...memoryStore.records.keys()].every(key =>
      key.startsWith("library/coupons/") ||
      key.startsWith("library/human-settlement-cases/") ||
      key.startsWith("library/review-operations/") ||
      key.startsWith("library/winning-coupons/") ||
      key.startsWith("library/coupon-history/") ||
      key.startsWith("library/lessons/") ||
      key.startsWith("library/settlement-learning/")
    ), "the recovery fixture must touch only synthetic records in the isolated adapter");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_STORE_TEST_MODE;
    else process.env.WIN_STORE_TEST_MODE = previousFlag;
  }
});

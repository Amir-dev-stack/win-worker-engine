import test from "node:test";
import assert from "node:assert/strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  const writes = [];
  let revision = 0;

  return {
    records,
    writes,
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing?.etag ?? null };
      }
      const etag = "isolated-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      writes.push(key);
      return { modified: true, etag };
    },
    async get(key) {
      return records.has(key) ? clone(records.get(key).value) : null;
    },
    async *list({ prefix = "" } = {}) {
      const blobs = [...records.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => ({ key }));
      yield { blobs };
    },
    async delete(key) {
      records.delete(key);
    },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    }
  };
}

test("real WIN coupon follow-up, independent outcome review and second-stage lesson review run only in memory", async () => {
  process.env.WIN_STORE_TEST_MODE = "1";
  globalThis.Netlify = { env: { get: () => undefined } };

  const memoryStore = createMemoryStore();
  const { installIsolatedTestStore } = await import("../netlify/lib/store.mts");
  installIsolatedTestStore(memoryStore);

  const [{ saveCouponRecord }, { runPostMatchFollowups }, { reviewCaseForIsolatedTest }, core] = await Promise.all([
    import("../netlify/lib/library.mts"),
    import("../netlify/lib/post-match-followup.mts"),
    import("../netlify/functions/independent-review.mts"),
    import("../netlify/lib/win-learning-core.mjs")
  ]);

  const originalFetch = globalThis.fetch;
  const requestedHosts = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    requestedHosts.push(url.hostname);

    if (url.hostname === "api.openligadb.de" && url.pathname.startsWith("/getmatchesbyteam/")) {
      return new Response(JSON.stringify([{
        matchID: 501,
        matchIsFinished: true,
        matchDateTimeUTC: "2026-10-20T18:00:00.000Z",
        team1: { teamName: "Alpha FC" },
        team2: { teamName: "Beta FC" },
        matchResults: [{
          resultName: "Endergebnis",
          pointsTeam1: 2,
          pointsTeam2: 0,
          resultTypeID: 2
        }]
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url.hostname === "news.google.com" && url.pathname === "/rss/search") {
      return new Response("<rss><channel></channel></rss>", {
        status: 200,
        headers: { "content-type": "application/rss+xml" }
      });
    }

    throw new Error("Unexpected network request in isolated test: " + url.href);
  };

  try {
    const coupon = await saveCouponRecord({
      id: "isolated-e2e-coupon",
      origin: "win",
      label: "Isolated synthetic regression fixture",
      couponText: "Synthetic test only; not a real wager or production record.",
      sport: "football",
      competition: "WIN isolated test league",
      selections: [{
        event: "Alpha FC vs Beta FC",
        homeTeam: "Alpha FC",
        awayTeam: "Beta FC",
        market: "Full Time Result 1X2",
        pick: "2",
        odds: 1.9,
        startTime: "2026-10-20T18:00:00.000Z"
      }]
    });
    assert.equal(coupon.origin, "win");
    assert.equal(coupon.outcome, "pending");

    const followup = await runPostMatchFollowups();
    assert.equal(followup.couponsChecked, 1);
    assert.equal(followup.resolved, 1);
    assert.equal(followup.queuedForReview, 1);
    assert.equal(followup.results[0].status, "review_submitted");

    const followupRecord = await memoryStore.get("library/post-match-followups/post-match-isolated-e2e-coupon");
    assert.equal(followupRecord.outcome, "lost");
    assert.equal(followupRecord.legs.length, 1);
    assert.equal(followupRecord.legs[0].status, "lost");

    const couponCaseId = "win-coupon-review-isolated-e2e-coupon";
    const reviewerNotes = "I independently checked the event identity, the full-time market definition, the exact selection and the score source. The documented result supports the recorded lost outcome.";
    const couponReview = {
      caseType: "win_coupon",
      caseId: couponCaseId,
      decision: "approve",
      reviewerName: "Independent Outcome Reviewer",
      reviewerNotes,
      evidenceUrls: ["https://independent-match-review.example/alpha-beta/2026-10-20"],
      checks: {
        eventIdentityConfirmed: true,
        marketRulesConfirmed: true,
        everySelectionReviewed: true,
        evidenceIndependent: true
      }
    };

    const selfReview = await reviewCaseForIsolatedTest(couponReview, { credentialId: "owner-internal-token" });
    assert.equal(selfReview.status, 403, "the submitter credential must not approve its own coupon case");

    const outcomeReview = await reviewCaseForIsolatedTest(couponReview, { credentialId: "reviewer-outcome-1" });
    assert.equal(outcomeReview.status, 200);
    assert.equal(outcomeReview.body.outcomeApplied, true);
    assert.equal(outcomeReview.body.coupon.outcome, "lost");
    assert.equal(outcomeReview.body.reviewCase.reviewStatus, "approved");

    const retriedOutcomeReview = await reviewCaseForIsolatedTest(couponReview, { credentialId: "reviewer-outcome-1" });
    assert.equal(retriedOutcomeReview.status, 200);
    assert.deepEqual(retriedOutcomeReview.body, outcomeReview.body, "an exact retry must return the prior completed result");

    const diagnosticId = "post-match-diagnostic-isolated-e2e-coupon-1";
    const candidate = await memoryStore.get("library/lessons/" + diagnosticId);
    assert.equal(candidate.validationStatus, "candidate_for_validation");
    assert.equal(core.isIndependentlyValidatedLesson(candidate), false);

    const lessonCaseId = "post-match-lesson-review-isolated-e2e-coupon-1";
    const lessonReview = await reviewCaseForIsolatedTest({
      caseType: "lesson",
      caseId: lessonCaseId,
      decision: "approve",
      reviewerName: "Second Lesson Reviewer",
      reviewerNotes: "I compared the pre-match diagnosis record and the dated match result evidence from an independent source. The stated factual outcome is supported; no unsupported causal explanation has been promoted.",
      evidenceUrls: ["https://independent-analysis.example/reports/alpha-beta-2026-10-20"],
      checks: {
        claimSupported: true,
        independentEvidenceConfirmed: true
      }
    }, { credentialId: "reviewer-lesson-2" });

    assert.equal(lessonReview.status, 200);
    assert.equal(lessonReview.body.reviewCase.reviewStatus, "approved");
    assert.equal(lessonReview.body.lesson.validationStatus, "validated");
    assert.equal(core.isIndependentlyValidatedLesson(lessonReview.body.lesson), true);

    const storedCoupon = await memoryStore.get("library/coupons/isolated-e2e-coupon");
    const storedLearning = await memoryStore.get("library/win-settlement-learning/win-settlement-isolated-e2e-coupon");
    const storedLessonCase = await memoryStore.get("library/lesson-review-cases/" + lessonCaseId);
    assert.equal(storedCoupon.outcome, "lost");
    assert.equal(storedCoupon.settlementReviewStatus, "approved_by_separate_reviewer_credential");
    assert.equal(storedLearning.validationStatus, "outcome_verified_cause_unvalidated");
    assert.equal(storedLessonCase.reviewStatus, "approved");
    assert.notEqual(lessonReview.body.lesson.independentReview.reviewerCredentialId, lessonReview.body.lesson.submitterCredentialId);
    assert.deepEqual([...new Set(requestedHosts)].sort(), ["api.openligadb.de", "news.google.com"]);
    assert.ok(memoryStore.writes.length > 0);
    assert.ok(memoryStore.writes.every(key =>
      key.startsWith("library/") || key.startsWith("scheduler-state/") || key.startsWith("runs/")
    ));
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Netlify;
    delete process.env.WIN_STORE_TEST_MODE;
  }
});

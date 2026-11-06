import test from "node:test";
import assert from "node:assert/strict";
import { buildWinCouponArchiveCandidate } from "../netlify/lib/win-coupon-archive-policy.mts";

const baseArgs = {
  runId: "run-1",
  runStatus: "completed",
  libraryReviewGateStatus: "passed",
  riskAssessmentGateStatus: "passed",
  sport: "football",
  country: "England",
  competition: "Premier League",
  createdAt: "2026-11-06T10:00:00.000Z",
  archivedAt: "2026-11-06T10:05:00.000Z"
};
const leg = (eventId, selection = "Home") => ({
  event: "Home vs Away", eventId, market: "1X2", selection, odds: 2.1,
  estimatedWinProbabilityPercent: 72, probabilityType: "agent_heuristic_unverified",
  probabilityConfidence: "medium", probabilityRationale: "Agent estimate from supplied evidence.",
  evidenceRefs: ["https://example.com/evidence"],
  sourceUrl: "https://example.com/odds", observedAt: "2026-11-06T10:00:00.000Z",
  startTime: "2026-11-06T18:00:00.000Z", settlementRule: "full_time_1x2",
  blockers: []
});

test("archives multi-leg proposals as DRAFTABLE without requiring a Master BET decision", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs,
    candidate: { id: "multi", status: "DRAFTABLE", legs: [leg("event-1"), leg("event-2")], theoreticalOddsProduct: 4.41 },
    index: 0
  });
  assert.equal(result.runResearchPassed, true);
  assert.equal(result.fullyQualified, false);
  assert.equal(result.record.status, "DRAFTABLE");
  assert.equal(result.record.couponDraftAllowed, true);
  assert.equal(result.record.wholeCouponWinProbabilityPercent, null);
  assert.equal(result.record.theoreticalOddsProduct, 4.41);
  assert.equal(result.record.legs[0].estimatedWinProbabilityPercent, 72);
  assert.equal(result.record.legs[0].probabilityCalibrated, false);
});

test("archives candidates as DRAFTABLE when research gates are incomplete", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs, riskAssessmentGateStatus: "pending",
    candidate: { id: "pending", status: "DRAFTABLE", legs: [leg("event-1")] }, index: 1
  });
  assert.equal(result.runResearchPassed, false);
  assert.equal(result.record.status, "DRAFTABLE");
  assert.equal(result.record.couponDraftAllowed, true);
  assert.ok(result.record.blockers.some(x => x.includes("retain as draft-only")));
});

test("only fully evidenced qualified single-leg candidates enter pending tracking", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs,
    candidate: { id: "single", status: "QUALIFIED", legs: [leg("event-1")], combinedOdds: 2.1 },
    index: 2
  });
  assert.equal(result.fullyQualified, true);
  assert.equal(result.record.status, "QUALIFIED");
  assert.equal(result.record.couponDraftAllowed, true);
  assert.equal(result.record.combinedOdds, 2.1);
  assert.equal(result.record.wholeCouponWinProbabilityPercent, 72);
});

test("even a fully evidenced multi-leg proposal remains draftable rather than pending-qualified", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs,
    candidate: { id: "multi-qualified", status: "QUALIFIED", legs: [leg("event-1"), leg("event-2")] },
    index: 3
  });
  assert.equal(result.fullyQualified, false);
  assert.equal(result.record.status, "DRAFTABLE");
});

test("incomplete candidates remain draftable and retain missing-evidence warnings", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs,
    candidate: { id: "incomplete", status: "DRAFTABLE", legs: [{ event: "Home vs Away", market: "1X2", selection: "Home" }] },
    index: 4
  });
  assert.equal(result.record.status, "DRAFTABLE");
  assert.equal(result.record.couponDraftAllowed, true);
  assert.equal(result.record.dataQualityStatus, "complete");
  assert.equal(result.record.legs[0].odds, null);
});

test("empty candidates are not draftable", () => {
  const result = buildWinCouponArchiveCandidate({
    ...baseArgs, candidate: { id: "empty", status: "DRAFTABLE", legs: [] }, index: 5
  });
  assert.equal(result.record.status, "BLOCKED");
  assert.equal(result.record.couponDraftAllowed, false);
});

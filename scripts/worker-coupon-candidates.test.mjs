import test from "node:test";
import assert from "node:assert/strict";
import { collectCouponCandidates } from "../netlify/functions/worker-runner.mts";

const leg = (eventId, odds, market = "1X2", selection = "Home") => ({
  eventId, event: "Home vs Away", market, selection, odds,
  estimatedWinProbabilityPercent: eventId === "event-1" ? 72 : 65,
  probabilityType: "agent_heuristic", probabilityConfidence: "medium",
  probabilityRationale: "Synthetic test-only estimate.", evidenceRefs: ["https://example.com/probability-evidence"],
  sourceUrl: "https://example.com/odds", observedAt: "2026-11-06T10:00:00.000Z",
  startTime: "2026-11-06T18:00:00.000Z", settlementRule: "full_time_1x2"
});
const collect = coupon => collectCouponCandidates([{
  departmentId: "D6",
  report: "<WIN_COUPONS_JSON>" + JSON.stringify({ coupons: [coupon] }) + "</WIN_COUPONS_JSON>"
}])[0];

test("multi-event coupon is retained as draftable without claiming joint probability", () => {
  const result = collect({ id: "multi-1", status: "QUALIFIED", legs: [leg("event-1", 2), leg("event-2", 1.8)] });
  assert.equal(result.status, "DRAFTABLE");
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.dataQualityStatus, "complete");
  assert.equal(result.jointProbabilityAvailable, false);
  assert.equal(result.probabilityStatus, "marginal_only_joint_unavailable");
  assert.equal(result.wholeCouponWinProbabilityPercent, null);
  assert.equal(result.legs[0].estimatedWinProbabilityPercent, 72);
  assert.equal(result.legs[0].probabilityType, "agent_heuristic_unverified");
  assert.equal(result.legs[0].probabilityCalibrated, false);
  assert.equal(result.legs[0].probabilityRationale, "Synthetic test-only estimate.");
  assert.deepEqual(result.legs[0].probabilityEvidenceRefs, ["https://example.com/probability-evidence"]);
  assert.equal(result.combinedOdds, null);
  assert.equal(result.theoreticalOddsProduct, 3.6);
  assert.ok(result.probabilityWarnings.includes("cross_event_dependence_not_modelled"));
});

test("same-event multi-market coupon remains draftable and does not multiply leg prices", () => {
  const result = collect({ id: "same-event", status: "QUALIFIED", legs: [
    leg("event-1", 2, "1X2", "Home"), leg("event-1", 1.9, "Over 2.5", "Over")
  ] });
  assert.equal(result.status, "DRAFTABLE");
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.theoreticalOddsProduct, null);
  assert.ok(result.probabilityWarnings.includes("same_event_joint_probability_not_modelled"));
});

test("single-leg coupon remains qualified and exposes its own price", () => {
  const result = collect({ id: "single-1", status: "QUALIFIED", legs: [leg("event-1", 2.15)] });
  assert.equal(result.status, "QUALIFIED");
  assert.equal(result.combinedOdds, 2.15);
  assert.equal(result.jointProbabilityAvailable, true);
  assert.equal(result.wholeCouponWinProbabilityPercent, 72);
  assert.equal(result.probabilityStatus, "single_leg_agent_estimate_unverified");
});

test("unverified model labels from an LLM are not treated as verified probabilities", () => {
  const result = collect({ id: "unverified-model", status: "QUALIFIED", legs: [
    { ...leg("event-1", 2), probabilityType: "verified_model" }
  ] });
  assert.equal(result.legs[0].estimatedWinProbabilityPercent, 72);
  assert.equal(result.legs[0].probabilityType, "unverified_claim");
  assert.equal(result.legs[0].probabilityCalibrated, false);
});

test("incomplete multi-leg evidence is still retained as an incomplete draft", () => {
  const result = collect({ id: "incomplete-1", status: "QUALIFIED", legs: [
    { eventId: "event-1", event: "Home vs Away", market: "1X2", selection: "Home" }
  ] });
  assert.equal(result.status, "DRAFTABLE");
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.dataQualityStatus, "incomplete");
  assert.ok(result.blockers.some(x => x.includes("verified decimal odds")));
  assert.equal(result.combinedOdds, null);
});

test("empty coupon candidate remains blocked because it has no legs", () => {
  const result = collect({ id: "empty-1", status: "QUALIFIED", legs: [] });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.couponDraftAllowed, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCouponConstructionCohorts } from "../netlify/lib/coupon-construction-learning.mts";

const hash = "a".repeat(64);
function rows({ format = "single", legs = 1, count = 120, method = "single_leg", jointHash = undefined, p = 0.7 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    ticketId: format + "-" + i,
    sport: "football",
    format,
    marketMix: "match_result",
    legCount: legs,
    predictedWinProbability: p,
    settlement: i % 3 === 0 ? "lost" : "won",
    predictionCutoff: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
    evaluatedAt: new Date(Date.UTC(2025, 0, 2 + i)).toISOString(),
    settlementRuleVersion: "sts-football-v1",
    chronologicalHoldout: true,
    evidenceSha256: hash,
    jointProbabilityMethod: method,
    ...(jointHash ? { jointModelValidationSha256: jointHash } : {})
  }));
}

test("ranks only sufficiently large chronological single-ticket cohorts", () => {
  const result = evaluateCouponConstructionCohorts([
    ...rows({ format: "single", p: 0.7 }),
    ...rows({ format: "multiple", p: 0.4 })
  ]);
  assert.equal(result.status, "comparative_research_available");
  assert.equal(result.ranked.length, 2);
  assert.equal(result.ranked[0].researchRank, 1);
  assert.equal(result.userDecisionRequired, true);
  assert.equal(result.automaticBettingAllowed, false);
});

test("multi-leg cohorts require independently validated joint-probability evidence", () => {
  const result = evaluateCouponConstructionCohorts(rows({
    format: "multiple", legs: 3, method: "independence_product"
  }));
  assert.equal(result.eligibleCohortCount, 0);
  assert.equal(result.exclusions.invalid_joint_probability_evidence, 120);
});

test("validated multi-leg evidence permits comparative research but not automatic betting", () => {
  const result = evaluateCouponConstructionCohorts(rows({
    format: "multiple", legs: 3, method: "validated_joint_model_v1", jointHash: hash
  }));
  assert.equal(result.eligibleCohortCount, 1);
  assert.equal(result.ranked[0].recommendationEligible, true);
  assert.equal(result.automaticBettingAllowed, false);
});

test("pushes and voids are excluded from win/loss scoring", () => {
  const data = rows({ count: 120 });
  data[0].settlement = "push";
  data[1].settlement = "void";
  const result = evaluateCouponConstructionCohorts(data);
  assert.equal(result.ranked[0].settledTickets, 118);
  assert.equal(result.ranked[0].excludedPushOrVoid, 2);
});

test("small samples and non-holdout records cannot qualify a format", () => {
  const data = rows({ count: 99 });
  const result = evaluateCouponConstructionCohorts(data);
  assert.equal(result.eligibleCohortCount, 0);
  assert.equal(result.ineligible[0].status, "insufficient_sample");
  const nonHoldout = rows();
  nonHoldout.forEach(row => row.chronologicalHoldout = false);
  const excluded = evaluateCouponConstructionCohorts(nonHoldout);
  assert.equal(excluded.status, "waiting_for_validated_ticket_history");
  assert.equal(excluded.exclusions.non_holdout_record, 120);
});

test("invalid records are excluded rather than assigned fabricated probabilities", () => {
  const data = rows();
  data[0].predictedWinProbability = 1.2;
  const result = evaluateCouponConstructionCohorts(data);
  assert.equal(result.exclusions.invalid_record, 1);
  assert.equal(result.ranked[0].settledTickets, 119);
});

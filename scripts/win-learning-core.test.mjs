import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCouponOutcome,
  deriveReviewedCouponOutcome,
  evaluateFullTimeLeg,
  isEligibleWinForecastCoupon,
  isIndependentlyValidatedLesson
} from "../netlify/lib/win-learning-core.mjs";

// Fixtures are pure in-memory values: these tests never call Netlify Blobs,
// public result APIs, the AI runtime, or any production coupon/review endpoint.

test("full-time 1X2 settles home, draw and away selections", () => {
  const base = { market: "Full Time Result 1X2", homeTeam: "Alpha FC", awayTeam: "Beta FC" };
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "1" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "X" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "2" }, { home: 0, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home win" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Alpha FC" }, { home: 0, away: 2 }).status, "lost");
});

test("goal totals settle over, under and an exact whole-number push", () => {
  assert.equal(evaluateFullTimeLeg({ market: "Over 2.5 goals", pick: "Over 2.5" }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market: "Under 2.5 goals", pick: "Under 2.5" }, { home: 1, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market: "Over 2.0 goals", pick: "Over 2.0" }, { home: 1, away: 1 }).status, "void");
  assert.equal(evaluateFullTimeLeg({ market: "Under 2.5 goals", pick: "Under 2.5" }, { home: 2, away: 1 }).status, "lost");
});

test("BTTS yes and no settle from the full-time score", () => {
  assert.equal(evaluateFullTimeLeg({ market: "Both Teams To Score", pick: "Yes" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market: "BTTS", pick: "No" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market: "BTTS", pick: "Yes" }, { home: 1, away: 0 }).status, "lost");
});

test("Draw No Bet settles one match side and voids a regulation draw", () => {
  const base = { market: "Draw No Bet", homeTeam: "Alpha United", awayTeam: "Beta United" };
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "1" }, { home: 0, away: 2 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Beta United" }, { home: 0, away: 2 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Away" }, { home: 1, away: 1 }).status, "void");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "Zakład bez remisu", pick: "Gospodarze" }, { home: 3, away: 1 }).status, "won");
});

test("Double Chance settles only exact 1X, X2 and 12 combinations", () => {
  const market = "Double Chance 1X2";
  assert.equal(evaluateFullTimeLeg({ market, pick: "1X" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market, pick: "X 1" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market, pick: "Home or Draw" }, { home: 0, away: 1 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ market, pick: "X2" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market, pick: "Away or Draw" }, { home: 2, away: 0 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ market, pick: "12" }, { home: 0, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market, pick: "Home or Away" }, { home: 0, away: 0 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ market: "Podwójna szansa", pick: "Remis lub 2" }, { home: 1, away: 2 }).status, "won");
});

test("Draw No Bet and Double Chance reject ambiguous or non-regulation inputs", () => {
  const teams = { homeTeam: "Alpha United", awayTeam: "Beta United" };
  assert.equal(evaluateFullTimeLeg({ ...teams, market: "Draw No Bet", pick: "Draw" }, { home: 1, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...teams, market: "Draw No Bet", pick: "Alpha United or Beta United" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Double Chance", pick: "1X2" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Double Chance", pick: "Home or maybe Draw" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Double Chance and BTTS", pick: "1X and Yes" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Corners Draw No Bet", pick: "Home" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "First Half Draw No Bet", pick: "Home" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Extra Time Double Chance", pick: "1X" }, { home: 1, away: 0 }).status, "unsupported_market");
});

test("period markets, ambiguous picks, unsupported markets and invalid scores fail closed", () => {
  assert.equal(evaluateFullTimeLeg({ market: "1st Half - Over 0.5 Goals", pick: "Over 0.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "2nd Half - Over 0.5 Goals", pick: "Over 0.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Second Period BTTS", pick: "Yes" }, { home: 1, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Over 2.25 Goals", pick: "Over 2.25" }, { home: 3, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Under 2.75 Goals", pick: "Under 2.75" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Extra Time Goals Over 0.5", pick: "Over 0.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Full Time Result 1X2", pick: "Alpha or Beta" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Corners Over 8.5", pick: "Over 8.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Total Cards Over 4.5", pick: "Over 4.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Player Total Goals Over 0.5", pick: "Over 0.5" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Handicap 1X2 (1:0)", pick: "2" }, { home: 2, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Asian Handicap -0.5", pick: "Home" }, { home: 2, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Full Time Result 1X2", pick: "1" }, { home: -1, away: 0 }).status, "unsupported_market");
});

test("coupon aggregation stays pending until every leg is supported", () => {
  assert.equal(aggregateCouponOutcome([]), "pending");
  assert.equal(aggregateCouponOutcome([{ status: "won" }, { status: "unsupported_market" }]), "pending");
  assert.equal(aggregateCouponOutcome([{ status: "won" }, { status: "awaiting_result" }]), "pending");
});

test("resolved coupon aggregation handles wins, losses and void legs conservatively", () => {
  assert.equal(aggregateCouponOutcome([{ status: "won" }, { status: "won" }]), "won");
  assert.equal(aggregateCouponOutcome([{ status: "won" }, { status: "lost" }, { status: "void" }]), "lost");
  assert.equal(aggregateCouponOutcome([{ status: "void" }, { status: "void" }]), "void");
  assert.equal(aggregateCouponOutcome([{ status: "won" }, { status: "void" }]), "partial");
});

test("independent reviewer outcome derivation rejects unresolved or empty legs", () => {
  assert.equal(deriveReviewedCouponOutcome([]), null);
  assert.equal(deriveReviewedCouponOutcome([{ status: "won" }, { status: "pending" }]), null);
  assert.equal(deriveReviewedCouponOutcome([{ status: "won" }, { status: "won" }]), "won");
  assert.equal(deriveReviewedCouponOutcome([{ status: "void" }, { status: "lost" }]), "lost");
});

test("only pending WIN-origin coupons with selections enter the result checker", () => {
  assert.equal(isEligibleWinForecastCoupon({ origin: "win", outcome: "pending", selections: [{ event: "A vs B" }] }), true);
  assert.equal(isEligibleWinForecastCoupon({ origin: "human", outcome: "pending", selections: [{ event: "A vs B" }] }), false);
  assert.equal(isEligibleWinForecastCoupon({ origin: "test", outcome: "pending", selections: [{ event: "A vs B" }] }), false);
  assert.equal(isEligibleWinForecastCoupon({ origin: "win", outcome: "won", selections: [{ event: "A vs B" }] }), false);
  assert.equal(isEligibleWinForecastCoupon({ origin: "win", outcome: "pending", selections: [] }), false);
});

test("lesson validation requires approved second credential and HTTPS corroboration", () => {
  const approved = {
    validationStatus: "validated",
    submitterCredentialId: "submitter-1",
    independentReview: {
      status: "approved",
      reviewerAuth: "separate_reviewer_credential",
      reviewerCredentialId: "reviewer-2",
      reviewedAt: "2026-11-04T12:00:00.000Z",
      evidence: [{ url: "https://independent.example/match-report" }]
    }
  };
  assert.equal(isIndependentlyValidatedLesson(approved), true);
  assert.equal(isIndependentlyValidatedLesson({ ...approved, submitterCredentialId: "reviewer-2" }), false);
  assert.equal(isIndependentlyValidatedLesson({ ...approved, independentReview: { ...approved.independentReview, evidence: [{ url: "http://insecure.example/report" }] } }), false);
  assert.equal(isIndependentlyValidatedLesson({ ...approved, validationStatus: "candidate_for_validation" }), false);
  assert.equal(isIndependentlyValidatedLesson({ ...approved, independentReview: { ...approved.independentReview, reviewerAuth: "owner_token" } }), false);
});

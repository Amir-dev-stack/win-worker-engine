import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCouponOutcome,
  deriveReviewedCouponOutcome,
  evaluateAsianHandicapLeg,
  evaluateEuropeanHandicapLeg,
  evaluateFullTimeLeg,
  isEligibleWinForecastCoupon,
  isIndependentlyValidatedLesson
} from "../netlify/lib/win-learning-core.mjs";

// Fixtures are pure in-memory values: these tests never call Netlify Blobs,
// public result APIs, the AI runtime, or any production coupon/review endpoint.

test("full-time 1X2 settles home, draw and away selections", () => {
  const base = { market: "Full Time Result 1X2", homeTeam: "Alpha United", awayTeam: "Beta United" };
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "1" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "X" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "2" }, { home: 0, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home win" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Alpha United" }, { home: 0, away: 2 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Beta United" }, { home: 0, away: 2 }).status, "won");
});

test("full-time 1X2 rejects compound and contradictory selections", () => {
  const base = { market: "Full Time Result 1X2", homeTeam: "Alpha United", awayTeam: "Beta United" };
  for (const pick of ["Home or Draw", "Home or Away", "Home win or Draw", "Alpha United or Beta United"]) {
    assert.equal(evaluateFullTimeLeg({ ...base, pick }, { home: 2, away: 0 }).status, "unsupported_market", pick);
  }
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home win" }, { home: 2, away: 0 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "X" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Beta United" }, { home: 0, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ market: base.market, homeTeam: "Brighton and Hove Albion", awayTeam: "Leeds United", pick: "Brighton and Hove Albion" }, { home: 1, away: 0 }).status, "won");
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
  assert.equal(evaluateFullTimeLeg({ market: "Draw No Bet and BTTS", pick: "Home and Yes" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Double Chance plus Over 2.5 Goals", pick: "1X and Over" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Full Time Result 1X2 plus Draw No Bet", pick: "Home" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Double Chance and Match Winner", pick: "1X" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Corners Draw No Bet", pick: "Home" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "First Half Draw No Bet", pick: "Home" }, { home: 1, away: 0 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Extra Time Double Chance", pick: "1X" }, { home: 1, away: 0 }).status, "unsupported_market");
});

test("Asian handicap settles explicit whole and half selected-side lines", () => {
  const base = { market: "Asian Handicap", homeTeam: "Alpha United", awayTeam: "Beta United" };
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home", line: -0.5 }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home", line: -1 }, { home: 2, away: 1 }).status, "void");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home -1.5" }, { home: 2, away: 1 }).status, "lost");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Away +1.5" }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Away +1,5" }, { home: 2, away: 1 }).status, "won");
  const named = evaluateAsianHandicapLeg({ ...base, pick: "Beta United +0.5" }, { home: 1, away: 1 });
  assert.equal(named.status, "won");
  assert.equal(named.selectedSide, "away");
  assert.equal(named.line, 0.5);
  assert.equal(named.settlementRule, "asian_handicap_whole_or_half_selected_side_v1");
  assert.equal(evaluateFullTimeLeg({ market: base.market, homeTeam: "Brighton and Hove Albion", awayTeam: "Leeds United", pick: "Brighton and Hove Albion -0.5" }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateAsianHandicapLeg({ ...base, pick: "Home", line: 0 }, { home: 0, away: 0 }).status, "void");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home", line: 0 }, { home: 0, away: 0 }).status, "void");
});

test("Asian handicap requires strict non-negative integer score fields", () => {
  const leg = { market: "Asian Handicap", homeTeam: "Alpha United", awayTeam: "Beta United", pick: "Home", line: -0.5 };
  const invalidScores = [
    {},
    { home: null, away: 1 },
    { home: "", away: 1 },
    { home: "0", away: 1 },
    { home: 0.5, away: 1 },
    { home: 0, away: -1 },
    { home: Number.NaN, away: 1 },
    { home: Number.POSITIVE_INFINITY, away: 1 }
  ];
  for (const score of invalidScores) {
    assert.equal(evaluateAsianHandicapLeg(leg, score).status, "unsupported_market", JSON.stringify(score));
    assert.equal(evaluateFullTimeLeg(leg, score).status, "unsupported_market", JSON.stringify(score));
  }
});

test("Asian handicap rejects split, ambiguous, compound and period-specific inputs", () => {
  const base = { market: "Asian Handicap", homeTeam: "Alpha United", awayTeam: "Beta United" };
  for (const line of [-0.25, 0.75, 0.1, 20.5]) {
    assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home", line }, { home: 2, away: 1 }).status, "unsupported_market", String(line));
  }
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home -0.5 +1.5" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home +0.5", line: -0.5 }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Draw", line: 0 }, { home: 1, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Alpha United or Beta United", line: 0 }, { home: 1, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Alpha United or Draw -0.5" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "Asian Handicap -0.5", pick: "Home" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "First Half Asian Handicap", pick: "Home", line: -0.5 }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "Asian Handicap and BTTS", pick: "Home", line: -0.5 }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "Handicap 1X2 (1:0)", pick: "2", line: 1 }, { home: 2, away: 1 }).status, "unsupported_market");
});

test("European three-way handicap settles explicit adjusted home, draw and away results", () => {
  const base = { market: "European Handicap 1X2", homeTeam: "Alpha United", awayTeam: "Beta United", homeHandicap: 0, awayHandicap: 0 };
  for (const market of ["European Handicap", "European Handicap 1X2", "European Three Way Handicap", "European 3 Way Handicap", "Three Way Handicap", "3 Way Handicap", "Handicap 1X2"]) {
    assert.equal(evaluateFullTimeLeg({ ...base, market, pick: "Home" }, { home: 2, away: 1 }).status, "won", market);
  }
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home" }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Away" }, { home: 1, away: 2 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Draw" }, { home: 1, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Draw", awayHandicap: 1 }, { home: 2, away: 1 }).status, "won");
  assert.equal(evaluateFullTimeLeg({ ...base, pick: "Home", homeHandicap: 1 }, { home: 1, away: 1 }).status, "won");
  const adjusted = evaluateEuropeanHandicapLeg({ ...base, pick: "Beta United", homeHandicap: -1, awayHandicap: 1 }, { home: 2, away: 1 });
  assert.equal(adjusted.status, "won");
  assert.equal(adjusted.adjustedResult, "away");
  assert.deepEqual(adjusted.adjustedScore, { home: 1, away: 2 });
  assert.equal(adjusted.settlementRule, "european_three_way_explicit_score_adjustment_v1");
});

test("European handicap rejects implicit, malformed, compound and non-regulation inputs", () => {
  const base = { market: "European Handicap 1X2", homeTeam: "Alpha United", awayTeam: "Beta United", pick: "Home", homeHandicap: 1, awayHandicap: 0 };
  const invalidScores = [{}, { home: null, away: 1 }, { home: "1", away: 1 }, { home: 1.5, away: 1 }, { home: -1, away: 1 }];
  for (const score of invalidScores) {
    assert.equal(evaluateEuropeanHandicapLeg(base, score).status, "unsupported_market", JSON.stringify(score));
    assert.equal(evaluateFullTimeLeg(base, score).status, "unsupported_market", JSON.stringify(score));
  }
  for (const leg of [
    { ...base, homeHandicap: undefined },
    { ...base, awayHandicap: undefined },
    { ...base, homeHandicap: "1" },
    { ...base, homeHandicap: 0.5 },
    { ...base, awayHandicap: 21 },
    { ...base, pick: "Home or Draw" },
    { ...base, pick: "Alpha United or Beta United" }
  ]) assert.equal(evaluateFullTimeLeg(leg, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ market: "Handicap 1X2 (1:0)", homeTeam: "Alpha United", awayTeam: "Beta United", pick: "Home" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "First Half European Handicap" }, { home: 2, away: 1 }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg({ ...base, market: "European Handicap and BTTS" }, { home: 2, away: 1 }).status, "unsupported_market");
  for (const market of ["European Handicap + Shots", "European Handicap / Offsides", "European Handicap and Fouls", "European Handicap: Unknown Market"]) {
    assert.equal(evaluateFullTimeLeg({ ...base, market }, { home: 2, away: 1 }).status, "unsupported_market", market);
  }
  assert.equal(evaluateFullTimeLeg({ ...base, settlementRule: "Shots" }, { home: 2, away: 1 }).status, "unsupported_market");
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

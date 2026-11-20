import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCouponOutcome,
  deriveReviewedCouponOutcome,
  evaluateAsianHandicapLeg,
  evaluateEuropeanHandicapLeg,
  evaluateFullTimeLeg,
  evaluateMatchCardTotalLeg,
  evaluateMatchCornerTotalLeg,
  evaluatePlayerGoalTotalLeg,
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

test("match-total corners settle from final regulation counts and explicit lines", () => {
  const evidence = { scope: "regulation_time", status: "final", homeCorners: 6, awayCorners: 5 };
  for (const market of ["Match Total Corners", "Total Match Corners", "Total Corners", "Corners Total"]) {
    assert.equal(evaluateMatchCornerTotalLeg({ market, pick: "Over", line: 10.5 }, evidence).status, "won", market);
  }
  assert.equal(evaluateMatchCornerTotalLeg({ market: "Total Corners", pick: "Under", line: 11.5 }, evidence).status, "won");
  assert.equal(evaluateMatchCornerTotalLeg({ market: "Total Corners", pick: "Under", line: 10.5 }, evidence).status, "lost");
  assert.equal(evaluateMatchCornerTotalLeg({ market: "Total Corners", pick: "Over", line: 11 }, evidence).status, "void");
  const settled = evaluateMatchCornerTotalLeg({ market: "Total Corners", pick: "Over", line: 10.5 }, evidence);
  assert.equal(settled.settlementRule, "match_total_corners_regulation_whole_or_half_v1");
  assert.equal(settled.totalCorners, 11);
  assert.equal(settled.selectedDirection, "over");
});

test("corner totals reconcile pick and selection fields without masking conflicts", () => {
  const base = { market: "Total Corners", line: 9.5 };
  const evidence = { scope: "regulation_time", status: "final", homeCorners: 5, awayCorners: 5 };
  assert.equal(evaluateMatchCornerTotalLeg({ ...base, pick: "Over" }, evidence).status, "won");
  assert.equal(evaluateMatchCornerTotalLeg({ ...base, selection: "Over" }, evidence).status, "won");
  assert.equal(evaluateMatchCornerTotalLeg({ ...base, pick: "Over", selection: "Over" }, evidence).status, "won");
  for (const leg of [
    { ...base, pick: "Over", selection: "Under" },
    { ...base, pick: "Over", selection: "" },
    { ...base, pick: "", selection: "Under" },
    { ...base, pick: "Over", selection: "Over 9.5" },
    { ...base, pick: "Over", selection: null },
    { ...base, pick: undefined, selection: "Over" },
    { ...base, pick: "Sideways", selection: "Sideways" },
    { ...base, selection: "" }
  ]) assert.equal(evaluateMatchCornerTotalLeg(leg, evidence).status, "unsupported_market", JSON.stringify(leg));
});

test("corner totals reject partial, malformed, split-line and derivative inputs", () => {
  const leg = { market: "Total Corners", pick: "Over", line: 9.5 };
  const valid = { scope: "regulation_time", status: "final", homeCorners: 5, awayCorners: 5 };
  for (const statistics of [
    {},
    { ...valid, scope: "full_match" },
    { ...valid, scope: "extra_time" },
    { ...valid, status: "live" },
    { ...valid, status: "pending" },
    { ...valid, homeCorners: null },
    { ...valid, homeCorners: "5" },
    { ...valid, homeCorners: 5.5 },
    { ...valid, homeCorners: -1 },
    { ...valid, homeCorners: 101 },
    { ...valid, awayCorners: undefined },
    { ...valid, awayCorners: Number.NaN },
    { ...valid, awayCorners: Number.POSITIVE_INFINITY }
  ]) assert.equal(evaluateMatchCornerTotalLeg(leg, statistics).status, "unsupported_market", JSON.stringify(statistics));
  for (const invalidLeg of [
    { ...leg, line: undefined },
    { ...leg, line: "9.5" },
    { ...leg, line: Number.NaN },
    { ...leg, line: Number.POSITIVE_INFINITY },
    { ...leg, line: -0.5 },
    { ...leg, line: 100.5 },
    { ...leg, line: 9.25 },
    { ...leg, line: 9.75 },
    { ...leg, pick: "Over 9.5" },
    { ...leg, pick: "Over or Under" },
    { ...leg, pick: "Home Over" },
    { ...leg, market: "Team Total Corners" },
    { ...leg, market: "First Half Total Corners" },
    { ...leg, market: "Total Corners + Cards" },
    { ...leg, market: "Total Corners / Shots" },
    { ...leg, settlementRule: "Unknown Corner Rule" }
  ]) assert.equal(evaluateMatchCornerTotalLeg(invalidLeg, valid).status, "unsupported_market", JSON.stringify(invalidLeg));
  assert.equal(evaluateFullTimeLeg({ market: "Total Corners", pick: "Over", line: 9.5 }, { home: 6, away: 5 }).status, "unsupported_market");
});

test("match-total cards settle from explicit final regulation counts and lines", () => {
  const evidence = {
    scope: "regulation_time",
    status: "final",
    countingRule: "explicit_final_market_card_count",
    homeCards: 3,
    awayCards: 2
  };
  for (const market of ["Match Total Cards", "Total Match Cards", "Total Cards", "Cards Total"]) {
    assert.equal(evaluateMatchCardTotalLeg({ market, pick: "Over", line: 4.5 }, evidence).status, "won", market);
  }
  assert.equal(evaluateMatchCardTotalLeg({ market: "Total Cards", pick: "Under", line: 5.5 }, evidence).status, "won");
  assert.equal(evaluateMatchCardTotalLeg({ market: "Total Cards", pick: "Under", line: 4.5 }, evidence).status, "lost");
  assert.equal(evaluateMatchCardTotalLeg({ market: "Total Cards", pick: "Over", line: 5 }, evidence).status, "void");
  const settled = evaluateMatchCardTotalLeg({ market: "Total Cards", pick: "Over", line: 4.5 }, evidence);
  assert.equal(settled.settlementRule, "match_total_cards_regulation_explicit_count_whole_or_half_v1");
  assert.equal(settled.countingRule, "explicit_final_market_card_count");
  assert.equal(settled.totalCards, 5);
  assert.equal(settled.selectedDirection, "over");
});

test("card totals reconcile pick and selection fields without masking conflicts", () => {
  const base = { market: "Total Cards", line: 4.5 };
  const evidence = {
    scope: "regulation_time",
    status: "final",
    countingRule: "explicit_final_market_card_count",
    homeCards: 3,
    awayCards: 2
  };
  assert.equal(evaluateMatchCardTotalLeg({ ...base, pick: "Over" }, evidence).status, "won");
  assert.equal(evaluateMatchCardTotalLeg({ ...base, selection: "Over" }, evidence).status, "won");
  assert.equal(evaluateMatchCardTotalLeg({ ...base, pick: "Over", selection: "Over" }, evidence).status, "won");
  for (const leg of [
    { ...base, pick: "Over", selection: "Under" },
    { ...base, pick: "Over", selection: "" },
    { ...base, pick: "", selection: "Under" },
    { ...base, pick: "Over", selection: "Over 4.5" },
    { ...base, pick: "Over", selection: null },
    { ...base, pick: undefined, selection: "Over" },
    { ...base, pick: "Sideways", selection: "Sideways" },
    { ...base, selection: "" }
  ]) assert.equal(evaluateMatchCardTotalLeg(leg, evidence).status, "unsupported_market", JSON.stringify(leg));
});

test("card totals reject inherited settlement-critical fields", () => {
  const leg = { market: "Total Cards", pick: "Over", line: 4.5 };
  const evidence = {
    scope: "regulation_time",
    status: "final",
    countingRule: "explicit_final_market_card_count",
    homeCards: 3,
    awayCards: 2
  };

  const inheritedMarket = Object.assign(Object.create({ market: "Total Cards" }), { pick: "Over", line: 4.5 });
  const inheritedLine = Object.assign(Object.create({ line: 4.5 }), { market: "Total Cards", pick: "Over" });
  const inheritedPick = Object.assign(Object.create({ pick: "Over" }), { market: "Total Cards", line: 4.5 });
  const inheritedSelection = Object.assign(Object.create({ selection: "Over" }), { market: "Total Cards", line: 4.5 });
  for (const inheritedLeg of [inheritedMarket, inheritedLine, inheritedPick, inheritedSelection]) {
    assert.equal(evaluateMatchCardTotalLeg(inheritedLeg, evidence).status, "unsupported_market");
  }

  const inheritedScope = Object.assign(Object.create({ scope: "regulation_time" }), {
    status: "final", countingRule: "explicit_final_market_card_count", homeCards: 3, awayCards: 2
  });
  const inheritedStatus = Object.assign(Object.create({ status: "final" }), {
    scope: "regulation_time", countingRule: "explicit_final_market_card_count", homeCards: 3, awayCards: 2
  });
  assert.equal(evaluateMatchCardTotalLeg(leg, inheritedScope).status, "unsupported_market");
  assert.equal(evaluateMatchCardTotalLeg(leg, inheritedStatus).status, "unsupported_market");

  const ownLeg = Object.assign(Object.create(null), leg);
  const ownEvidence = Object.assign(Object.create(null), evidence);
  assert.equal(evaluateMatchCardTotalLeg(ownLeg, ownEvidence).status, "won");
});

test("card totals reject inferred counts, malformed evidence, split lines and derivatives", () => {
  const leg = { market: "Total Cards", pick: "Over", line: 4.5 };
  const valid = {
    scope: "regulation_time",
    status: "final",
    countingRule: "explicit_final_market_card_count",
    homeCards: 3,
    awayCards: 2
  };
  for (const statistics of [
    {},
    { ...valid, scope: "full_match" },
    { ...valid, scope: "extra_time" },
    { ...valid, status: "live" },
    { ...valid, status: "pending" },
    { ...valid, countingRule: undefined },
    { ...valid, countingRule: "yellow_plus_red" },
    { ...valid, homeCards: null },
    { ...valid, homeCards: "3" },
    { ...valid, homeCards: 3.5 },
    { ...valid, homeCards: -1 },
    { ...valid, homeCards: 101 },
    { ...valid, awayCards: undefined },
    { ...valid, awayCards: Number.NaN },
    { ...valid, awayCards: Number.POSITIVE_INFINITY },
    { ...valid, homeYellowCards: 3, awayYellowCards: 2 },
    { ...valid, homeRedCards: 1 },
    { ...valid, homeSecondYellowCards: 1 },
    { ...valid, homeBookingPoints: 30, awayBookingPoints: 20 },
    { ...valid, cardEvents: [] },
    { scope: "regulation_time", status: "final", countingRule: "explicit_final_market_card_count", homeYellowCards: 3, awayYellowCards: 2 }
  ]) assert.equal(evaluateMatchCardTotalLeg(leg, statistics).status, "unsupported_market", JSON.stringify(statistics));
  const inherited = Object.create({ countingRule: "explicit_final_market_card_count", homeCards: 3, awayCards: 2 });
  inherited.scope = "regulation_time";
  inherited.status = "final";
  assert.equal(evaluateMatchCardTotalLeg(leg, inherited).status, "unsupported_market");
  for (const invalidLeg of [
    { ...leg, line: undefined },
    { ...leg, line: "4.5" },
    { ...leg, line: Number.NaN },
    { ...leg, line: Number.POSITIVE_INFINITY },
    { ...leg, line: -0.5 },
    { ...leg, line: 100.5 },
    { ...leg, line: 4.25 },
    { ...leg, line: 4.75 },
    { ...leg, pick: "Over 4.5" },
    { ...leg, pick: "Over or Under" },
    { ...leg, pick: "Home Over" },
    { ...leg, market: "Team Total Cards" },
    { ...leg, market: "Player Total Cards" },
    { ...leg, market: "First Half Total Cards" },
    { ...leg, market: "Total Cards + Corners" },
    { ...leg, market: "Total Cards / Shots" },
    { ...leg, market: "Total Booking Points" },
    { ...leg, settlementRule: "Unknown Card Rule" }
  ]) assert.equal(evaluateMatchCardTotalLeg(invalidLeg, valid).status, "unsupported_market", JSON.stringify(invalidLeg));
  assert.equal(evaluateFullTimeLeg({ market: "Total Cards", pick: "Over", line: 4.5 }, { home: 3, away: 2 }).status, "unsupported_market");
});

test("player goal totals settle exact match-bound final regulation evidence", () => {
  const leg = { market: "Player Total Goals", eventId: "event-1", playerId: "player-9", line: 0.5 };
  const evidence = {
    eventId: "event-1",
    playerId: "player-9",
    scope: "regulation_time",
    status: "final",
    participationStatus: "played",
    countingRule: "official_regulation_player_goal_count",
    goals: 1
  };
  for (const market of ["Player Total Goals", "Total Player Goals", "Player Goals Total"]) {
    assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, market, pick: "Over" }, evidence).status, "won", market);
  }
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Under", line: 1.5 }, evidence).status, "won");
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Under" }, evidence).status, "lost");
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Over", line: 1 }, evidence).status, "void");
  const settled = evaluatePlayerGoalTotalLeg({ ...leg, pick: "Over" }, evidence);
  assert.equal(settled.settlementRule, "player_total_goals_regulation_official_count_whole_or_half_v1");
  assert.equal(settled.eventId, "event-1");
  assert.equal(settled.playerId, "player-9");
  assert.equal(settled.participationStatus, "played");
  assert.equal(settled.goals, 1);
});

test("player goal totals require own fields and reconcile dual selections", () => {
  const leg = { market: "Player Total Goals", eventId: "event-1", playerId: "player-9", line: 0.5 };
  const evidence = {
    eventId: "event-1", playerId: "player-9", scope: "regulation_time", status: "final",
    participationStatus: "played", countingRule: "official_regulation_player_goal_count", goals: 1
  };
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Over" }, evidence).status, "won");
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, selection: "Over" }, evidence).status, "won");
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Over", selection: "Over" }, evidence).status, "won");
  for (const invalidLeg of [
    { ...leg, pick: "Over", selection: "Under" },
    { ...leg, pick: "Over", selection: "" },
    { ...leg, pick: undefined, selection: "Over" },
    Object.assign(Object.create({ market: "Player Total Goals" }), { eventId: "event-1", playerId: "player-9", line: 0.5, pick: "Over" }),
    Object.assign(Object.create({ line: 0.5 }), { market: "Player Total Goals", eventId: "event-1", playerId: "player-9", pick: "Over" }),
    Object.assign(Object.create({ pick: "Over" }), { market: "Player Total Goals", eventId: "event-1", playerId: "player-9", line: 0.5 }),
    Object.assign(Object.create({ eventId: "event-1" }), { market: "Player Total Goals", playerId: "player-9", line: 0.5, pick: "Over" }),
    Object.assign(Object.create({ playerId: "player-9" }), { market: "Player Total Goals", eventId: "event-1", line: 0.5, pick: "Over" })
  ]) assert.equal(evaluatePlayerGoalTotalLeg(invalidLeg, evidence).status, "unsupported_market");

  for (const inheritedField of ["eventId", "playerId", "scope", "status", "participationStatus", "countingRule", "goals"]) {
    const inheritedEvidence = Object.create({ [inheritedField]: evidence[inheritedField] });
    for (const [field, value] of Object.entries(evidence)) if (field !== inheritedField) inheritedEvidence[field] = value;
    assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, pick: "Over" }, inheritedEvidence).status, "unsupported_market", inheritedField);
  }

  const ownLeg = Object.assign(Object.create(null), { ...leg, pick: "Over" });
  const ownEvidence = Object.assign(Object.create(null), evidence);
  assert.equal(evaluatePlayerGoalTotalLeg(ownLeg, ownEvidence).status, "won");
});

test("player goal totals reject identity, participation, inference and derivative ambiguity", () => {
  const leg = { market: "Player Total Goals", eventId: "event-1", playerId: "player-9", line: 0.5, pick: "Over" };
  const valid = {
    eventId: "event-1", playerId: "player-9", scope: "regulation_time", status: "final",
    participationStatus: "played", countingRule: "official_regulation_player_goal_count", goals: 1
  };
  for (const evidence of [
    {},
    { ...valid, eventId: "event-2" },
    { ...valid, playerId: "player-10" },
    { ...valid, eventId: " event-1" },
    { ...valid, playerId: "player-9 " },
    { ...valid, playerId: "Player Nine" },
    { ...valid, scope: "full_match" },
    { ...valid, scope: "extra_time" },
    { ...valid, status: "live" },
    { ...valid, participationStatus: "did_not_play" },
    { ...valid, participationStatus: "unused_substitute" },
    { ...valid, countingRule: "provider_label" },
    { ...valid, goals: null },
    { ...valid, goals: "1" },
    { ...valid, goals: 1.5 },
    { ...valid, goals: -1 },
    { ...valid, goals: 21 },
    { ...valid, goalEvents: [] },
    { ...valid, scorerNames: ["Player Nine"] },
    { ...valid, score: { home: 2, away: 1 } },
    { ...valid, homeScore: 2, awayScore: 1 }
  ]) assert.equal(evaluatePlayerGoalTotalLeg(leg, evidence).status, "unsupported_market", JSON.stringify(evidence));

  for (const invalidLeg of [
    { ...leg, eventId: "event-2" },
    { ...leg, playerId: "player-10" },
    { ...leg, eventId: "" },
    { ...leg, playerId: "Player Nine" },
    { ...leg, line: undefined },
    { ...leg, line: "0.5" },
    { ...leg, line: -0.5 },
    { ...leg, line: 20.5 },
    { ...leg, line: 0.25 },
    { ...leg, pick: "Over 0.5" },
    { ...leg, market: "Anytime Goalscorer" },
    { ...leg, market: "Player Total Shots" },
    { ...leg, market: "Team Total Goals" },
    { ...leg, market: "First Half Player Total Goals" },
    { ...leg, market: "Player Total Goals + Shots" },
    { ...leg, settlementRule: "Unknown Player Rule" },
    { ...leg, settlementRule: "" },
    { ...leg, settlementRule: null }
  ]) assert.equal(evaluatePlayerGoalTotalLeg(invalidLeg, valid).status, "unsupported_market", JSON.stringify(invalidLeg));
  assert.equal(evaluatePlayerGoalTotalLeg({ ...leg, playerId: "Player Nine" }, { ...valid, playerId: "Player Nine" }).status, "unsupported_market");
  assert.equal(evaluateFullTimeLeg(leg, { home: 2, away: 1 }).status, "unsupported_market");
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

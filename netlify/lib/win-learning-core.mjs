const clean = (value, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const normalized = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ł/g, "l").replace(/[^a-z0-9]+/g, " ").trim();
const SUPPORTED_EUROPEAN_HANDICAP_MARKETS = new Set([
  "european handicap",
  "european handicap 1x2",
  "european three way handicap",
  "european 3 way handicap",
  "three way handicap",
  "3 way handicap",
  "handicap 1x2"
]);
const SUPPORTED_MATCH_CORNER_TOTAL_MARKETS = new Set([
  "match total corners",
  "total match corners",
  "total corners",
  "corners total"
]);
const SUPPORTED_MATCH_CARD_TOTAL_MARKETS = new Set([
  "match total cards",
  "total match cards",
  "total cards",
  "cards total"
]);

function isSupportedEuropeanHandicapMarketLabel(value) {
  return SUPPORTED_EUROPEAN_HANDICAP_MARKETS.has(normalized(value));
}

function isSupportedMatchCornerTotalMarketLabel(value) {
  return SUPPORTED_MATCH_CORNER_TOTAL_MARKETS.has(normalized(value));
}

function isSupportedMatchCardTotalMarketLabel(value) {
  return SUPPORTED_MATCH_CARD_TOTAL_MARKETS.has(normalized(value));
}

function parseExactOverUnderSelectionFields(leg) {
  const record = leg && typeof leg === "object" ? leg : {};
  const suppliedFields = ["pick", "selection"].filter(field => Object.prototype.hasOwnProperty.call(record, field));
  if (!suppliedFields.length) return null;
  const directions = [];
  for (const field of suppliedFields) {
    const value = record[field];
    if (typeof value !== "string" || !clean(value, 80)) return null;
    const direction = normalized(clean(value, 80));
    if (!["over", "under"].includes(direction)) return null;
    directions.push(direction);
  }
  return directions.every(direction => direction === directions[0]) ? directions[0] : null;
}

function sameTeam(a, b) {
  const x = normalized(a), y = normalized(b);
  return Boolean(x && y && (x === y || (x.length >= 7 && y.length >= 7 && (x.includes(y) || y.includes(x)))));
}

function parseLine(text) {
  const match = text.match(/(?:\+|over\s*|under\s*|o\s*|u\s*|[<>]\s*)?(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function selectedMatchSide(pick, leg, exactOnly = true) {
  const exactHome = ["1", "home", "gospodarze", "team 1"].includes(pick);
  const exactAway = ["2", "away", "goscie", "team 2"].includes(pick);
  const home = (exactOnly ? exactHome : /\b(1|home|gospodarze|team 1)\b/.test(pick)) || sameTeam(pick, leg?.homeTeam || "");
  const away = (exactOnly ? exactAway : /\b(2|away|goscie|team 2)\b/.test(pick)) || sameTeam(pick, leg?.awayTeam || "");
  return { home, away };
}

function parseFullTimeResultSelection(pick, leg) {
  const homeTeam = normalized(leg?.homeTeam || "");
  const awayTeam = normalized(leg?.awayTeam || "");
  const exactHomeTeam = Boolean(homeTeam && pick === homeTeam);
  const exactAwayTeam = Boolean(awayTeam && pick === awayTeam);
  if (exactHomeTeam !== exactAwayTeam) return exactHomeTeam ? "home" : "away";

  const compoundPick = /\b(or|and|lub|albo|plus|with|versus|vs)\b|[&/+]/.test(pick) ||
    /draw no bet|\bdnb\b|double chance|podwojna szansa|both teams to score|\bbtts\b|\b(over|under)\b|goals?|gole|goli|handicap|asian|spread|cards?|corners?|player|goalscorer|team total/.test(pick);
  if (compoundPick) return null;

  const selected = selectedMatchSide(pick, leg, false);
  const selectedDraw = /\b(x|draw|remis)\b/.test(pick);
  const selectionCount = Number(selected.home) + Number(selected.away) + Number(selectedDraw);
  if (selectionCount !== 1) return null;
  return selected.home ? "home" : selected.away ? "away" : "draw";
}

function parseDoubleChanceSelection(pick) {
  const compactCode = /^[12x ]+$/.test(pick) ? pick.replaceAll(" ", "") : "";
  if (["1x", "x1"].includes(compactCode) || ["home or draw", "draw or home", "home draw", "1 lub remis", "remis lub 1"].includes(pick)) return "home_or_draw";
  if (["x2", "2x"].includes(compactCode) || ["away or draw", "draw or away", "away draw", "2 lub remis", "remis lub 2"].includes(pick)) return "away_or_draw";
  if (["12", "21"].includes(compactCode) || ["home or away", "away or home", "home away", "1 lub 2", "2 lub 1"].includes(pick)) return "home_or_away";
  return null;
}

function parseSelectedSideHandicap(rawPick, explicitLine) {
  const matches = [...rawPick.matchAll(/([+\-−–])\s*(\d+(?:[.,]\d+)?)/g)];
  if (matches.length > 1) return { line: null, sidePick: "", reason: "Multiple handicap lines were supplied." };
  const parsedPickLine = matches.length === 1
    ? Number(matches[0][2].replace(",", ".")) * (matches[0][1] === "+" ? 1 : -1)
    : null;
  const declaredLine = typeof explicitLine === "number" && Number.isFinite(explicitLine) ? explicitLine : null;
  if (explicitLine !== undefined && explicitLine !== null && declaredLine === null) {
    return { line: null, sidePick: "", reason: "The explicit handicap line must be a finite number." };
  }
  if (declaredLine !== null && parsedPickLine !== null && Math.abs(declaredLine - parsedPickLine) > 1e-8) {
    return { line: null, sidePick: "", reason: "The selection and explicit handicap lines conflict." };
  }
  const line = declaredLine ?? parsedPickLine;
  if (line === null) return { line: null, sidePick: "", reason: "An explicit selected-side handicap line is required." };
  const sideText = matches.length === 1
    ? rawPick.slice(0, matches[0].index) + " " + rawPick.slice((matches[0].index || 0) + matches[0][0].length)
    : rawPick;
  return { line, sidePick: normalized(sideText), reason: null };
}

/** Pure regulation-score settlement for a selected-side Asian handicap line. */
export function evaluateAsianHandicapLeg(leg, score) {
  const home = score?.home, away = score?.away;
  if (typeof home !== "number" || typeof away !== "number" || !Number.isSafeInteger(home) || !Number.isSafeInteger(away) || home < 0 || away < 0) {
    return { status: "unsupported_market", reason: "Non-negative integer number fields are required for the regulation full-time score." };
  }
  const rawPick = clean(leg?.pick || leg?.selection, 180);
  const parsed = parseSelectedSideHandicap(rawPick, leg?.line);
  if (parsed.reason) return { status: "unsupported_market", reason: parsed.reason };
  if (Math.abs(parsed.line) > 20 || Math.abs(parsed.line * 2 - Math.round(parsed.line * 2)) > 1e-8) {
    return { status: "unsupported_market", reason: "Only bounded whole and half selected-side Asian handicap lines are supported." };
  }
  const homeTeam = normalized(leg?.homeTeam || ""), awayTeam = normalized(leg?.awayTeam || "");
  const exactNamedSide = (homeTeam && parsed.sidePick === homeTeam) || (awayTeam && parsed.sidePick === awayTeam);
  if (!exactNamedSide && (/\b(or|and|lub|albo|plus|with|versus|vs|draw|remis|x)\b|[&/+]/.test(parsed.sidePick))) {
    return { status: "unsupported_market", reason: "Compound Asian handicap selections are not supported." };
  }
  const selected = selectedMatchSide(parsed.sidePick, leg);
  if (Number(selected.home) + Number(selected.away) !== 1) {
    return { status: "unsupported_market", reason: "Asian handicap selection could not be mapped unambiguously to one match side." };
  }
  const selectedSide = selected.home ? "home" : "away";
  const selectedScore = selected.home ? home : away;
  const otherScore = selected.home ? away : home;
  const adjustedMargin = selectedScore - otherScore + parsed.line;
  const status = Math.abs(adjustedMargin) < 1e-8 ? "void" : adjustedMargin > 0 ? "won" : "lost";
  return {
    status,
    reason: "Settled from the verified regulation full-time score and explicit selected-side Asian handicap line.",
    settlementRule: "asian_handicap_whole_or_half_selected_side_v1",
    selectedSide,
    line: parsed.line,
    adjustedMargin
  };
}

/** Pure regulation-score settlement for an explicit European three-way handicap. */
export function evaluateEuropeanHandicapLeg(leg, score) {
  const home = score?.home, away = score?.away;
  if (typeof home !== "number" || typeof away !== "number" || !Number.isSafeInteger(home) || !Number.isSafeInteger(away) || home < 0 || away < 0) {
    return { status: "unsupported_market", reason: "Non-negative integer number fields are required for the regulation full-time score." };
  }
  const homeHandicap = leg?.homeHandicap, awayHandicap = leg?.awayHandicap;
  if (typeof homeHandicap !== "number" || typeof awayHandicap !== "number" ||
      !Number.isSafeInteger(homeHandicap) || !Number.isSafeInteger(awayHandicap) ||
      Math.abs(homeHandicap) > 20 || Math.abs(awayHandicap) > 20) {
    return { status: "unsupported_market", reason: "Explicit bounded integer home and away handicaps are required." };
  }
  const pick = normalized(clean(leg?.pick || leg?.selection, 180));
  const chosen = parseFullTimeResultSelection(pick, leg);
  if (!chosen) return { status: "unsupported_market", reason: "European handicap selection could not be mapped unambiguously to home/draw/away." };
  const adjustedHome = home + homeHandicap, adjustedAway = away + awayHandicap;
  const result = adjustedHome > adjustedAway ? "home" : adjustedHome < adjustedAway ? "away" : "draw";
  return {
    status: chosen === result ? "won" : "lost",
    reason: "Settled from the verified regulation full-time score and explicit European three-way handicaps.",
    settlementRule: "european_three_way_explicit_score_adjustment_v1",
    selectedResult: chosen,
    adjustedResult: result,
    homeHandicap,
    awayHandicap,
    adjustedScore: { home: adjustedHome, away: adjustedAway }
  };
}

/** Pure settlement for one final regulation-time match-total corners line. */
export function evaluateMatchCornerTotalLeg(leg, statistics) {
  const marketLabel = clean(leg?.market, 180);
  const additionalMarketLabel = clean(leg?.settlementRule, 500);
  if (!marketLabel || !isSupportedMatchCornerTotalMarketLabel(marketLabel) ||
      (additionalMarketLabel && !isSupportedMatchCornerTotalMarketLabel(additionalMarketLabel))) {
    return { status: "unsupported_market", reason: "An explicitly supported single match-total corners label is required." };
  }
  if (statistics?.scope !== "regulation_time" || statistics?.status !== "final") {
    return { status: "unsupported_market", reason: "Final regulation-time corner statistics are required." };
  }
  const homeCorners = statistics?.homeCorners, awayCorners = statistics?.awayCorners;
  if (typeof homeCorners !== "number" || typeof awayCorners !== "number" ||
      !Number.isSafeInteger(homeCorners) || !Number.isSafeInteger(awayCorners) ||
      homeCorners < 0 || awayCorners < 0 || homeCorners > 100 || awayCorners > 100) {
    return { status: "unsupported_market", reason: "Bounded non-negative integer home and away corner counts are required." };
  }
  const line = leg?.line;
  if (typeof line !== "number" || !Number.isFinite(line) || line < 0 || line > 100 ||
      Math.abs(line * 2 - Math.round(line * 2)) > 1e-8) {
    return { status: "unsupported_market", reason: "An explicit bounded whole or half match-total corners line is required." };
  }
  const direction = parseExactOverUnderSelectionFields(leg);
  if (!direction) {
    return { status: "unsupported_market", reason: "The corner-total selection must be exactly over or under." };
  }
  const totalCorners = homeCorners + awayCorners;
  const status = totalCorners === line ? "void" : direction === "over" ? (totalCorners > line ? "won" : "lost") : (totalCorners < line ? "won" : "lost");
  return {
    status,
    reason: "Settled from final regulation-time corner counts and an explicit match-total line.",
    settlementRule: "match_total_corners_regulation_whole_or_half_v1",
    selectedDirection: direction,
    line,
    scope: statistics.scope,
    homeCorners,
    awayCorners,
    totalCorners
  };
}

/** Pure settlement for one final regulation-time match-total cards line. */
export function evaluateMatchCardTotalLeg(leg, statistics) {
  const legRecord = leg && typeof leg === "object" ? leg : {};
  const statisticRecord = statistics && typeof statistics === "object" ? statistics : {};
  const hasOwnLeg = field => Object.prototype.hasOwnProperty.call(legRecord, field);
  const hasOwnStatistic = field => Object.prototype.hasOwnProperty.call(statisticRecord, field);
  const marketLabel = hasOwnLeg("market") ? clean(legRecord.market, 180) : "";
  const additionalMarketLabel = hasOwnLeg("settlementRule") ? clean(legRecord.settlementRule, 500) : "";
  if (!marketLabel || !isSupportedMatchCardTotalMarketLabel(marketLabel) ||
      (additionalMarketLabel && !isSupportedMatchCardTotalMarketLabel(additionalMarketLabel))) {
    return { status: "unsupported_market", reason: "An explicitly supported single match-total cards label is required." };
  }
  if (!hasOwnStatistic("scope") || !hasOwnStatistic("status") ||
      statisticRecord.scope !== "regulation_time" || statisticRecord.status !== "final") {
    return { status: "unsupported_market", reason: "Final regulation-time card statistics are required." };
  }
  if (!hasOwnStatistic("countingRule") || statisticRecord.countingRule !== "explicit_final_market_card_count") {
    return { status: "unsupported_market", reason: "An explicit final-market card-count basis is required." };
  }
  const unresolvedBreakdownFields = [
    "homeYellowCards", "awayYellowCards", "homeRedCards", "awayRedCards",
    "homeSecondYellowCards", "awaySecondYellowCards", "homeBookingPoints", "awayBookingPoints",
    "cardEvents"
  ].filter(hasOwnStatistic);
  if (unresolvedBreakdownFields.length) {
    return { status: "unsupported_market", reason: "Raw card-event and booking-point evidence must be reconciled into one reviewed final market count before settlement." };
  }
  const homeCards = statisticRecord.homeCards, awayCards = statisticRecord.awayCards;
  if (!hasOwnStatistic("homeCards") || !hasOwnStatistic("awayCards") ||
      typeof homeCards !== "number" || typeof awayCards !== "number" ||
      !Number.isSafeInteger(homeCards) || !Number.isSafeInteger(awayCards) ||
      homeCards < 0 || awayCards < 0 || homeCards > 100 || awayCards > 100) {
    return { status: "unsupported_market", reason: "Bounded non-negative integer home and away card counts are required." };
  }
  const line = legRecord.line;
  if (!hasOwnLeg("line") || typeof line !== "number" || !Number.isFinite(line) || line < 0 || line > 100 ||
      Math.abs(line * 2 - Math.round(line * 2)) > 1e-8) {
    return { status: "unsupported_market", reason: "An explicit bounded whole or half match-total cards line is required." };
  }
  const direction = parseExactOverUnderSelectionFields(legRecord);
  if (!direction) {
    return { status: "unsupported_market", reason: "The card-total selection must be exactly over or under." };
  }
  const totalCards = homeCards + awayCards;
  const status = totalCards === line ? "void" : direction === "over" ? (totalCards > line ? "won" : "lost") : (totalCards < line ? "won" : "lost");
  return {
    status,
    reason: "Settled from explicit final regulation-time market card counts and an explicit match-total line.",
    settlementRule: "match_total_cards_regulation_explicit_count_whole_or_half_v1",
    countingRule: statisticRecord.countingRule,
    selectedDirection: direction,
    line,
    scope: statisticRecord.scope,
    homeCards,
    awayCards,
    totalCards
  };
}

/**
 * Deterministic full-time score settlement only.
 * Period-specific, unrecognized and unparseable markets deliberately remain unsupported.
 */
export function evaluateFullTimeLeg(leg, score) {
  const marketDeclarations = [clean(leg?.market, 180), clean(leg?.settlementRule, 500)].filter(Boolean);
  const market = normalized(marketDeclarations.join(" "));
  const rawPick = clean(leg?.pick || leg?.selection, 180);
  const pick = normalized(rawPick);
  const home = Number(score?.home), away = Number(score?.away);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    return { status: "unsupported_market", reason: "A valid non-negative full-time score is required." };
  }
  const total = home + away;
  if (/first half|1st half|second half|2nd half|first period|1st period|second period|2nd period|third period|3rd period|fourth period|4th period|first quarter|1st quarter|second quarter|2nd quarter|third quarter|3rd quarter|fourth quarter|4th quarter|first set|1st set|second set|2nd set|third set|3rd set|fourth set|4th set|first inning|1st inning|second inning|2nd inning|third inning|3rd inning|half time|halftime|extra time|overtime|penalty shootout|penalties|shootout|1 polowa|2 polowa|pierwsza polowa|druga polowa/.test(market + " " + pick))
    return { status: "unsupported_market", reason: "The source provides a match-final score; this period-specific or extra-time market needs a period-specific result." };
  const drawNoBetMarket = /draw no bet|zaklad bez remisu|\bdnb\b/.test(market);
  const doubleChanceMarket = /double chance|podwojna szansa/.test(market);
  const asianHandicapMarket = /asian handicap|asian spread/.test(market);
  const europeanHandicapMention = /european handicap|three way handicap|3 way handicap|handicap 1x2/.test(market);
  const europeanHandicapMarket = europeanHandicapMention && marketDeclarations.every(isSupportedEuropeanHandicapMarketLabel);
  const resultFamily = /1x2|match winner|moneyline|full time result|wynik meczu|zwyciezca meczu/.test(market);
  const joinsResultFamilies = /\b(and|plus|with|oraz|lub)\b|[&/+]/.test(market) && resultFamily;
  const compoundOrDerivativeMarket = joinsResultFamilies || /both teams to score|btts|goals?|gole|goli|handicap|asian|spread|cards?|corners?|player|goalscorer|team total/.test(market);
  if ((drawNoBetMarket || doubleChanceMarket) && compoundOrDerivativeMarket) {
    return { status: "unsupported_market", reason: "Compound or derivative Draw No Bet and Double Chance markets require an explicit settlement rule." };
  }
  if (europeanHandicapMention && !europeanHandicapMarket) {
    return { status: "unsupported_market", reason: "European handicap settlement requires one explicitly supported single-market label." };
  }
  if (asianHandicapMarket && /both teams to score|btts|goals?|gole|goli|cards?|corners?|player|goalscorer|team total|1x2|match winner|moneyline|draw no bet|double chance/.test(market)) {
    return { status: "unsupported_market", reason: "Compound or derivative Asian handicap markets require an explicit settlement rule." };
  }
  if (asianHandicapMarket) return evaluateAsianHandicapLeg(leg, score);
  if (europeanHandicapMarket) return evaluateEuropeanHandicapLeg(leg, score);
  if (/both teams to score|btts|obie druzyny strzela|obie druzyny/.test(market)) {
    const yes = home > 0 && away > 0;
    const saysYes = /\b(yes|tak)\b/.test(" " + pick), saysNo = /\b(no|nie)\b/.test(" " + pick);
    if (!saysYes && !saysNo) return { status: "unsupported_market", reason: "BTTS pick could not be parsed safely." };
    return { status: (yes === saysYes) ? "won" : "lost", reason: "Settled from the verified full-time score." };
  }
  const fullMatchGoalTotal = !/\b(player|team|individual)\b/.test(market) && (
    /\b(total goals?|goals? total|goal total|goal line|liczba goli|gole|goli)\b/.test(market) ||
    /\b(over|under)\b.*\b(goals?|gole|goli)\b/.test(market)
  );
  if (fullMatchGoalTotal) {
    const line = parseLine(rawPick + " " + clean(leg?.market, 180));
    if (line === null) return { status: "unsupported_market", reason: "Goal-total line could not be extracted." };
    const fractionalCents = Math.round((line - Math.floor(line)) * 100);
    if (fractionalCents === 25 || fractionalCents === 75) return { status: "unsupported_market", reason: "Quarter-goal Asian totals require split-line settlement data." };
    const under = /under|ponizej|less than|poniżej/.test(pick) || /under|ponizej|less than/.test(market);
    const over = /over|powyzej|more than/.test(pick) || /over|powyzej|more than/.test(market);
    if (!under && !over) return { status: "unsupported_market", reason: "Over/under direction could not be extracted." };
    const status = total === line ? "void" : (over ? total > line : total < line) ? "won" : "lost";
    return { status, reason: "Settled from the verified full-time score and stated goal line." };
  }
  if (drawNoBetMarket) {
    const selected = selectedMatchSide(pick, leg);
    const selectedDraw = ["x", "draw", "remis"].includes(pick);
    if (selectedDraw || Number(selected.home) + Number(selected.away) !== 1) {
      return { status: "unsupported_market", reason: "Draw No Bet selection could not be mapped unambiguously to one match side." };
    }
    if (home === away) return { status: "void", reason: "Draw No Bet is void on a regulation full-time draw." };
    const winningSide = home > away ? "home" : "away";
    const chosenSide = selected.home ? "home" : "away";
    return { status: chosenSide === winningSide ? "won" : "lost", reason: "Settled from the verified regulation full-time score." };
  }
  if (doubleChanceMarket) {
    const chosen = parseDoubleChanceSelection(pick);
    if (!chosen) return { status: "unsupported_market", reason: "Double Chance selection could not be mapped safely to 1X, X2 or 12." };
    const result = home > away ? "home" : home < away ? "away" : "draw";
    const acceptedResults = {
      home_or_draw: ["home", "draw"],
      away_or_draw: ["away", "draw"],
      home_or_away: ["home", "away"]
    };
    return { status: acceptedResults[chosen].includes(result) ? "won" : "lost", reason: "Settled from the verified regulation full-time score." };
  }
  const fullTimeResultMarket = /1x2|match winner|moneyline|full time result|wynik meczu|zwyciezca meczu|zwycięzca meczu/.test(market)
    && !/handicap|asian|double chance|podwojna szansa|draw no bet|zaklad bez remisu|spread|dnb/.test(market);
  if (fullTimeResultMarket) {
    const result = home > away ? "home" : home < away ? "away" : "draw";
    const chosen = parseFullTimeResultSelection(pick, leg);
    if (!chosen) return { status: "unsupported_market", reason: "1X2 selection could not be mapped unambiguously to home/draw/away." };
    return { status: chosen === result ? "won" : "lost", reason: "Settled from the verified full-time score." };
  }
  return { status: "unsupported_market", reason: "This market is not yet supported by the deterministic result adapter." };
}

/** Whole-coupon provisional aggregation; unresolved/unsupported legs keep the coupon pending. */
export function aggregateCouponOutcome(legs) {
  if (!Array.isArray(legs) || !legs.length || legs.some(leg => !["won", "lost", "void"].includes(leg?.status))) return "pending";
  return deriveReviewedCouponOutcome(legs) || "pending";
}

/** Returns null until every leg has a supported won/lost/void status. */
export function deriveReviewedCouponOutcome(legs) {
  const results = Array.isArray(legs) ? legs.map(leg => String(leg?.status || "").toLowerCase()) : [];
  if (!results.length || results.some(status => !["won", "lost", "void"].includes(status))) return null;
  if (results.includes("lost")) return "lost";
  if (results.every(status => status === "void")) return "void";
  if (results.every(status => status === "won")) return "won";
  return "partial";
}

/** Only real, pending WIN-origin forecasts with at least one leg enter automated polling. */
export function isEligibleWinForecastCoupon(coupon) {
  return coupon?.origin === "win" && coupon?.outcome === "pending" &&
    Array.isArray(coupon?.selections) && coupon.selections.length > 0;
}

/** Shared trust predicate used by both the library and the learning observatory. */
export function isIndependentlyValidatedLesson(lesson) {
  const review = lesson?.independentReview;
  const submitterCredentialId = clean(lesson?.submitterCredentialId, 256);
  const reviewerCredentialId = clean(review?.reviewerCredentialId, 256);
  const evidence = Array.isArray(review?.evidence) ? review.evidence.slice(0, 30) : [];
  const hasHttpsEvidence = evidence.some(entry => {
    const raw = clean(typeof entry === "string" ? entry : entry?.url || entry?.reference || entry?.sourceUrl || entry?.evidenceUrl, 1500);
    try {
      const parsed = new URL(raw);
      return parsed.protocol === "https:" && Boolean(parsed.hostname);
    } catch {
      return false;
    }
  });
  const reviewedAt = Date.parse(review?.reviewedAt || "");
  return lesson?.validationStatus === "validated" &&
    review?.status === "approved" &&
    review?.reviewerAuth === "separate_reviewer_credential" &&
    Boolean(submitterCredentialId) &&
    Boolean(reviewerCredentialId) &&
    reviewerCredentialId !== submitterCredentialId &&
    Number.isFinite(reviewedAt) && reviewedAt > 0 &&
    hasHttpsEvidence;
}

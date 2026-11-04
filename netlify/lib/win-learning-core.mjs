const clean = (value, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const normalized = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

/**
 * Deterministic full-time score settlement only.
 * Period-specific, unrecognized and unparseable markets deliberately remain unsupported.
 */
export function evaluateFullTimeLeg(leg, score) {
  const market = normalized(clean(leg?.market, 180) + " " + clean(leg?.settlementRule, 500));
  const rawPick = clean(leg?.pick || leg?.selection, 180);
  const pick = normalized(rawPick);
  const home = Number(score?.home), away = Number(score?.away);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    return { status: "unsupported_market", reason: "A valid non-negative full-time score is required." };
  }
  const total = home + away;
  if (/first half|1st half|second half|2nd half|first period|1st period|second period|2nd period|third period|3rd period|fourth period|4th period|first quarter|1st quarter|second quarter|2nd quarter|third quarter|3rd quarter|fourth quarter|4th quarter|first set|1st set|second set|2nd set|third set|3rd set|fourth set|4th set|first inning|1st inning|second inning|2nd inning|third inning|3rd inning|half time|halftime|extra time|overtime|penalty shootout|penalties|shootout|1 polowa|2 polowa|pierwsza polowa|druga polowa/.test(market + " " + pick))
    return { status: "unsupported_market", reason: "The source provides a match-final score; this period-specific or extra-time market needs a period-specific result." };
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
  const fullTimeResultMarket = /1x2|match winner|moneyline|full time result|wynik meczu|zwyciezca meczu|zwycięzca meczu/.test(market)
    && !/handicap|asian|double chance|podwojna szansa|draw no bet|zaklad bez remisu|spread|dnb/.test(market);
  if (fullTimeResultMarket) {
    const selectedHome = /\b(1|home| gospodarze|team 1)\b/.test(" " + pick) || sameTeam(pick, leg?.homeTeam || "");
    const selectedAway = /\b(2|away|goście|goscie|team 2)\b/.test(" " + pick) || sameTeam(pick, leg?.awayTeam || "");
    const selectedDraw = /\b(x|draw|remis)\b/.test(" " + pick);
    const result = home > away ? "home" : home < away ? "away" : "draw";
    const chosen = selectedHome ? "home" : selectedAway ? "away" : selectedDraw ? "draw" : null;
    if (!chosen) return { status: "unsupported_market", reason: "1X2 selection could not be mapped to home/draw/away." };
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

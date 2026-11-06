import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

const clean = (value: unknown, max = 3000): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const safeArray = (value: unknown, max = 100): any[] =>
  Array.isArray(value) ? value.slice(0, max) : [];
const slug = (value: string): string =>
  value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "unknown";

export function buildWinCouponArchiveCandidate(args: {
  runId: string;
  runStatus: string;
  libraryReviewGateStatus: string | null;
  riskAssessmentGateStatus: string | null;
  candidate: any;
  index: number;
  sport?: string | null;
  country?: string | null;
  competition?: string | null;
  createdAt: string;
  archivedAt: string;
}) {
  const { runId, runStatus, libraryReviewGateStatus, riskAssessmentGateStatus,
    candidate, index, sport, country, competition, createdAt, archivedAt } = args;
  const runResearchPassed = runStatus === "completed" &&
    libraryReviewGateStatus === "passed" && riskAssessmentGateStatus === "passed";
  const candidateId = "win-candidate-" + slug(runId + "-" + (candidate?.id || index));
  const legs = safeArray(candidate?.legs, 100).map((leg: any) => ({
    event: clean(leg?.event, 250) || "Unspecified event",
    market: clean(leg?.market, 180) || "Unspecified market",
    selection: clean(leg?.selection, 180) || "Unspecified selection",
    odds: Number.isFinite(leg?.odds) && leg.odds > 1 ? leg.odds : null,
    estimatedWinProbabilityPercent: Number.isFinite(leg?.estimatedWinProbabilityPercent) &&
      leg.estimatedWinProbabilityPercent >= 0 && leg.estimatedWinProbabilityPercent <= 100
      ? leg.estimatedWinProbabilityPercent : null,
    probabilityType: clean(leg?.probabilityType, 80) || "unavailable",
    probabilityConfidence: clean(leg?.probabilityConfidence, 20) || "unrated",
    probabilityRationale: clean(leg?.probabilityRationale, 600) || null,
    probabilityEvidenceRefs: safeArray(leg?.probabilityEvidenceRefs || leg?.evidenceRefs, 10)
      .map((value: any) => clean(value, 1500)).filter(Boolean),
    probabilityCalibrated: false,
    sourceUrl: clean(leg?.sourceUrl, 1500) || null,
    observedAt: clean(leg?.observedAt, 100) || null,
    eventStart: clean(leg?.startTime || leg?.eventStart || leg?.kickoff || leg?.matchDateTimeUTC, 100) || null,
    eventId: clean(leg?.eventId, 180) || null,
    leagueShortcut: clean(leg?.leagueShortcut, 40) || null,
    leagueSeason: Number.isInteger(leg?.leagueSeason) ? leg.leagueSeason : null,
    homeTeam: clean(leg?.homeTeam, 160) || null,
    awayTeam: clean(leg?.awayTeam, 160) || null,
    settlementRule: clean(leg?.settlementRule, 500) || null,
    blockers: safeArray(leg?.blockers, 20)
  }));
  const evidenceBlockers = safeArray(candidate?.blockers, 200).map((item: any) => clean(item, 300)).filter(Boolean);
  for (const [legIndex, leg] of legs.entries()) {
    const prefix = "Leg " + (legIndex + 1) + ": ";
    if (leg.event === "Unspecified event") evidenceBlockers.push(prefix + "event identity missing");
    if (!leg.eventId) evidenceBlockers.push(prefix + "stable event ID missing");
    if (leg.market === "Unspecified market") evidenceBlockers.push(prefix + "market missing");
    if (leg.selection === "Unspecified selection") evidenceBlockers.push(prefix + "selection missing");
    if (leg.odds === null) evidenceBlockers.push(prefix + "verified decimal odds missing");
    if (!leg.sourceUrl || !leg.sourceUrl.startsWith("https://")) evidenceBlockers.push(prefix + "HTTPS odds source missing");
    if (!isStrictIsoTimestamp(leg.observedAt)) evidenceBlockers.push(prefix + "strict odds observation timestamp missing");
    if (!isStrictIsoTimestamp(leg.eventStart) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(leg.eventStart || ""))
      evidenceBlockers.push(prefix + "timezone-qualified kickoff timestamp missing");
    if (!leg.settlementRule) evidenceBlockers.push(prefix + "settlement rule missing");
    for (const blocker of leg.blockers) evidenceBlockers.push(prefix + clean(blocker, 250));
  }
  const blockers = [...new Set(evidenceBlockers)];
  if (!runResearchPassed) blockers.push("Full research, independent review or risk-assessment gate did not complete; retain as draft-only.");
  const fullyQualified = runResearchPassed && candidate?.status === "QUALIFIED" &&
    legs.length === 1 && blockers.length === 0;
  const record = {
    id: candidateId, recordType: "win_coupon_candidate", origin: "win",
    runId, label: clean(candidate?.label, 250) || "WIN coupon candidate " + (index + 1),
    sport: clean(sport, 100) || null,
    country: clean(country, 100) || null,
    competition: clean(competition, 200) || null,
    status: fullyQualified ? "QUALIFIED" : legs.length > 0 ? "DRAFTABLE" : "BLOCKED",
    couponDraftAllowed: legs.length > 0,
    dataQualityStatus: evidenceBlockers.length === 0 ? "complete" : "incomplete",
    researchGateStatus: runResearchPassed ? "passed" : "pending",
    combinedOdds: fullyQualified && Number.isFinite(candidate?.combinedOdds) ? candidate.combinedOdds : null,
    theoreticalOddsProduct: Number.isFinite(candidate?.theoreticalOddsProduct) ? candidate.theoreticalOddsProduct : null,
    wholeCouponWinProbabilityPercent: legs.length === 1 ? legs[0].estimatedWinProbabilityPercent : null,
    wholeCouponProbabilityMethod: legs.length === 1
      ? "single_leg_probability_equals_leg_probability" : "unvalidated_joint_probability_not_estimated",
    jointProbabilityAvailable: legs.length === 1 && legs[0].estimatedWinProbabilityPercent !== null,
    probabilityStatus: legs.length === 1
      ? (legs[0].estimatedWinProbabilityPercent === null ? "single_leg_probability_unavailable" : "single_leg_agent_estimate_unverified")
      : "marginal_only_joint_unavailable",
    probabilityWarnings: safeArray(candidate?.probabilityWarnings, 50),
    riskPercent: Number.isFinite(candidate?.riskPercent) && candidate.riskPercent >= 0 && candidate.riskPercent <= 100
      ? candidate.riskPercent : null,
    riskMethod: clean(candidate?.riskMethod, 300) || "unverified_agent_risk_estimate",
    riskCalibrated: false,
    blockers,
    riskFactors: safeArray(candidate?.riskFactors, 30),
    correlationNotes: safeArray(candidate?.correlationNotes, 30),
    placementStatus: "not_placed_by_WIN",
    executionDisclosure: "Research candidate only. WIN did not place a bet or verify a bookmaker ticket.",
    createdAt, archivedAt
  };
  return { candidateId, legs, fullyQualified, runResearchPassed, record };
}

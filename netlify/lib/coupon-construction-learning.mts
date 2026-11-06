import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export const WIN_COUPON_CONSTRUCTION_EVALUATION_VERSION = "win.coupon.construction-evaluation.v1" as const;
const MINIMUM_SETTLED_TICKETS = 100;

export type CouponConstructionObservation = {
  ticketId: string;
  sport: string;
  format: "single" | "multiple" | "system" | "bet_builder" | "other";
  marketMix: string;
  legCount: number;
  predictedWinProbability: number;
  settlement: "won" | "lost" | "push" | "void";
  predictionCutoff: string;
  evaluatedAt: string;
  settlementRuleVersion: string;
  chronologicalHoldout: boolean;
  evidenceSha256: string;
  jointProbabilityMethod: string;
  jointModelValidationSha256?: string;
};

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function wilsonInterval(wins: number, count: number) {
  const z = 1.959963984540054;
  const p = wins / count;
  const denominator = 1 + z * z / count;
  const centre = (p + z * z / (2 * count)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count) / denominator;
  return { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin), confidenceLevel: 0.95 };
}

/**
 * Compares coupon formats only from frozen, chronological, independently
 * settled ticket predictions. This is an advisory research diagnostic, not
 * a ticket generator, bet gate, stake instruction, or proof of profitability.
 */
export function evaluateCouponConstructionCohorts(
  input: CouponConstructionObservation[],
  minimumSettledTickets = MINIMUM_SETTLED_TICKETS
) {
  if (!Array.isArray(input) || !Number.isSafeInteger(minimumSettledTickets) || minimumSettledTickets < MINIMUM_SETTLED_TICKETS) {
    throw new Error("coupon_construction_input_invalid");
  }
  const seen = new Set<string>();
  const groups = new Map<string, CouponConstructionObservation[]>();
  const exclusions = {
    duplicate_ticket_id: 0,
    invalid_record: 0,
    non_holdout_record: 0,
    invalid_joint_probability_evidence: 0
  };

  for (const row of input) {
    if (!row || typeof row.ticketId !== "string" || !row.ticketId.trim() ||
        seen.has(row.ticketId) || typeof row.sport !== "string" || !row.sport.trim() ||
        !["single", "multiple", "system", "bet_builder", "other"].includes(row.format) ||
        typeof row.marketMix !== "string" || !row.marketMix.trim() ||
        !Number.isSafeInteger(row.legCount) || row.legCount < 1 ||
        typeof row.predictedWinProbability !== "number" || !Number.isFinite(row.predictedWinProbability) ||
        row.predictedWinProbability <= 0 || row.predictedWinProbability >= 1 ||
        !["won", "lost", "push", "void"].includes(row.settlement) ||
        !isStrictIsoTimestamp(row.predictionCutoff) || !isStrictIsoTimestamp(row.evaluatedAt) ||
        Date.parse(row.predictionCutoff) >= Date.parse(row.evaluatedAt) ||
        typeof row.settlementRuleVersion !== "string" || !row.settlementRuleVersion.trim() ||
        !validHash(row.evidenceSha256) || typeof row.jointProbabilityMethod !== "string" ||
        !row.jointProbabilityMethod.trim()) {
      exclusions.invalid_record++;
      continue;
    }
    if (seen.has(row.ticketId)) {
      exclusions.duplicate_ticket_id++;
      continue;
    }
    seen.add(row.ticketId);
    if (row.chronologicalHoldout !== true) {
      exclusions.non_holdout_record++;
      continue;
    }
    if (row.legCount > 1 && (!row.jointModelValidationSha256 ||
        !validHash(row.jointModelValidationSha256) ||
        row.jointProbabilityMethod === "independence_product" ||
        row.jointProbabilityMethod === "unvalidated")) {
      exclusions.invalid_joint_probability_evidence++;
      continue;
    }
    const key = [row.sport, row.format, row.marketMix, row.legCount].join("|");
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const cohorts = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
    const settled = rows.filter(row => row.settlement === "won" || row.settlement === "lost");
    const wins = settled.filter(row => row.settlement === "won").length;
    const count = settled.length;
    const cohort = {
      cohortId: key,
      sport: rows[0].sport,
      format: rows[0].format,
      marketMix: rows[0].marketMix,
      legCount: rows[0].legCount,
      observedTickets: rows.length,
      settledTickets: count,
      excludedPushOrVoid: rows.length - count,
      status: count >= minimumSettledTickets ? "evaluated" as const : "insufficient_sample" as const,
      minimumSettledTickets: minimumSettledTickets,
      winRate: count ? wins / count : null,
      winRateWilson95: count ? wilsonInterval(wins, count) : null,
      brierScore: null as number | null,
      logLoss: null as number | null,
      calibrationGap: null as number | null,
      jointProbabilityMethod: rows[0].jointProbabilityMethod,
      validationEvidenceSha256: rows[0].jointModelValidationSha256 || null,
      recommendationEligible: false as boolean,
      limitations: [] as string[]
    };
    if (count < minimumSettledTickets) {
      cohort.limitations.push("Insufficient independently settled chronological holdout tickets for a format comparison.");
      return cohort;
    }
    const predictions = settled.map(row => ({ p: row.predictedWinProbability, y: row.settlement === "won" ? 1 : 0 }));
    cohort.brierScore = predictions.reduce((sum, item) => sum + (item.p - item.y) ** 2, 0) / count;
    cohort.logLoss = predictions.reduce((sum, item) => sum - (item.y ? Math.log(item.p) : Math.log(1 - item.p)), 0) / count;
    cohort.calibrationGap = cohort.winRate! - predictions.reduce((sum, item) => sum + item.p, 0) / count;
    cohort.recommendationEligible = true;
    cohort.limitations.push("This cohort is eligible for comparative research only; it does not prove future profitability or universal superiority.");
    return cohort;
  });

  const eligible = cohorts.filter(cohort => cohort.recommendationEligible);
  const ranked = [...eligible].sort((a, b) =>
    (a.brierScore! - b.brierScore!) ||
    (Math.abs(a.calibrationGap!) - Math.abs(b.calibrationGap!)) ||
    (b.settledTickets - a.settledTickets) ||
    a.cohortId.localeCompare(b.cohortId)
  ).map((cohort, index) => ({ ...cohort, researchRank: index + 1 }));

  return {
    version: WIN_COUPON_CONSTRUCTION_EVALUATION_VERSION,
    status: ranked.length ? "comparative_research_available" : "waiting_for_validated_ticket_history",
    minimumSettledTickets,
    cohortCount: cohorts.length,
    eligibleCohortCount: ranked.length,
    exclusions,
    ranked,
    ineligible: cohorts.filter(cohort => !cohort.recommendationEligible),
    interpretation: "Ranks comparable coupon-format cohorts by chronological holdout Brier score, then calibration gap. This is not a recommendation to place a bet and does not establish expected value or profitability.",
    automaticBettingAllowed: false,
    userDecisionRequired: true
  };
}

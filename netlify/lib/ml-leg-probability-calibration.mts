import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export const WIN_LEG_PROBABILITY_CALIBRATION_VERSION = "win.leg-probability-calibration.v1" as const;
const MINIMUM_SETTLED_OBSERVATIONS = 100;

export type WinLegProbabilityObservation = {
  observationId: string;
  sport: string;
  market: string;
  probabilityBasis: "agent_heuristic_unverified" | "unverified_market_claim" | "registered_model";
  confidence: "high" | "medium" | "low" | "unrated";
  estimatedWinProbabilityPercent: number;
  outcome: "won" | "lost" | "push" | "void";
  predictionCutoff: string;
  kickoffAt: string;
  settledAt: string;
  evaluatedAt: string;
  chronologicalHoldout: boolean;
  forecastEvidenceSha256: string;
  settlementEvidenceSha256: string;
  modelValidationSha256?: string;
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
 * Evaluates frozen leg-level probability estimates on chronological holdout
 * outcomes. It reports calibration; it never modifies estimates or grants
 * model/training/production approval.
 */
export function evaluateWinLegProbabilityCalibration(
  input: WinLegProbabilityObservation[],
  minimumSettledObservations = MINIMUM_SETTLED_OBSERVATIONS
) {
  if (!Array.isArray(input) || !Number.isSafeInteger(minimumSettledObservations) ||
      minimumSettledObservations < MINIMUM_SETTLED_OBSERVATIONS) {
    throw new Error("leg_probability_calibration_input_invalid");
  }
  const seen = new Set<string>();
  const groups = new Map<string, WinLegProbabilityObservation[]>();
  const exclusions = {
    duplicate_observation_id: 0,
    invalid_record: 0,
    non_holdout_record: 0,
    push_or_void: 0
  };
  for (const row of input) {
    if (!row || typeof row.observationId !== "string" || !row.observationId.trim()) {
      exclusions.invalid_record++;
      continue;
    }
    if (seen.has(row.observationId)) {
      exclusions.duplicate_observation_id++;
      continue;
    }
    seen.add(row.observationId);
    if (typeof row.sport !== "string" || !row.sport.trim() ||
        typeof row.market !== "string" || !row.market.trim() ||
        !["agent_heuristic_unverified", "unverified_market_claim", "registered_model"].includes(row.probabilityBasis) ||
        !["high", "medium", "low", "unrated"].includes(row.confidence) ||
        typeof row.estimatedWinProbabilityPercent !== "number" ||
        !Number.isFinite(row.estimatedWinProbabilityPercent) ||
        row.estimatedWinProbabilityPercent <= 0 || row.estimatedWinProbabilityPercent >= 100 ||
        !["won", "lost", "push", "void"].includes(row.outcome) ||
        ![row.predictionCutoff, row.kickoffAt, row.settledAt, row.evaluatedAt].every(isStrictIsoTimestamp) ||
        !(Date.parse(row.predictionCutoff) < Date.parse(row.kickoffAt) &&
          Date.parse(row.kickoffAt) <= Date.parse(row.settledAt) &&
          Date.parse(row.settledAt) <= Date.parse(row.evaluatedAt)) ||
        !validHash(row.forecastEvidenceSha256) || !validHash(row.settlementEvidenceSha256) ||
        (row.probabilityBasis === "registered_model" && !validHash(row.modelValidationSha256))) {
      exclusions.invalid_record++;
      continue;
    }
    if (row.chronologicalHoldout !== true) {
      exclusions.non_holdout_record++;
      continue;
    }
    if (row.outcome === "push" || row.outcome === "void") {
      exclusions.push_or_void++;
      continue;
    }
    const key = JSON.stringify([row.sport, row.market, row.probabilityBasis, row.confidence]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const cohorts = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => {
    const wins = rows.filter(row => row.outcome === "won").length;
    const count = rows.length;
    const observedRate = wins / count;
    const meanProbability = rows.reduce((sum, row) => sum + row.estimatedWinProbabilityPercent / 100, 0) / count;
    const cohort = {
      cohortId: key,
      sport: rows[0].sport,
      market: rows[0].market,
      probabilityBasis: rows[0].probabilityBasis,
      confidence: rows[0].confidence,
      settledObservations: count,
      wins,
      losses: count - wins,
      status: count >= minimumSettledObservations ? "evaluated" as const : "insufficient_sample" as const,
      minimumSettledObservations,
      observedWinRate: observedRate,
      observedWinRateWilson95: wilsonInterval(wins, count),
      meanPredictedProbability: meanProbability,
      calibrationGap: observedRate - meanProbability,
      brierScore: rows.reduce((sum, row) => {
        const p = row.estimatedWinProbabilityPercent / 100;
        const y = row.outcome === "won" ? 1 : 0;
        return sum + (p - y) ** 2;
      }, 0) / count,
      logLoss: rows.reduce((sum, row) => {
        const p = row.estimatedWinProbabilityPercent / 100;
        return sum - (row.outcome === "won" ? Math.log(p) : Math.log(1 - p));
      }, 0) / count,
      expectedCalibrationError: null as number | null,
      reliabilityBins: [] as Array<{ lower: number; upper: number; count: number; meanPredicted: number | null; observedRate: number | null }>,
      researchEligible: count >= minimumSettledObservations,
      probabilityCalibrationGranted: false as const,
      productionApprovalGranted: false as const
    };
    const bins = Array.from({ length: 10 }, (_, index) => ({
      lower: index / 10, upper: (index + 1) / 10, count: 0, predicted: 0, wins: 0
    }));
    for (const row of rows) {
      const p = row.estimatedWinProbabilityPercent / 100;
      const bin = bins[Math.min(9, Math.floor(p * 10))];
      bin.count++;
      bin.predicted += p;
      if (row.outcome === "won") bin.wins++;
    }
    cohort.reliabilityBins = bins.map(bin => ({
      lower: bin.lower, upper: bin.upper, count: bin.count,
      meanPredicted: bin.count ? bin.predicted / bin.count : null,
      observedRate: bin.count ? bin.wins / bin.count : null
    }));
    cohort.expectedCalibrationError = bins.reduce((sum, bin) => sum + (bin.count / count) *
      (bin.count ? Math.abs(bin.wins / bin.count - bin.predicted / bin.count) : 0), 0);
    return cohort;
  });

  const eligible = cohorts.filter(row => row.researchEligible);
  return {
    version: WIN_LEG_PROBABILITY_CALIBRATION_VERSION,
    status: eligible.length ? "calibration_research_available" : "waiting_for_chronological_holdout",
    minimumSettledObservations,
    cohortCount: cohorts.length,
    researchEligibleCohortCount: eligible.length,
    exclusions,
    cohorts,
    interpretation: "Brier score, log loss, calibration gap, reliability bins and Wilson intervals describe historical holdout performance only. They do not prove future accuracy or profitability.",
    probabilityCalibrationGranted: false,
    productionApprovalGranted: false,
    automaticBettingAllowed: false
  };
}

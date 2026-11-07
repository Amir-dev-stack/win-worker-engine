/**
 * Offline quota planner for The Odds API v4.
 *
 * This is a preflight estimator only. It never performs requests, reads keys,
 * reserves credits with the provider, or enables a provider.
 */
export type OddsApiQuotaRequestV1 = {
  id: string;
  marketCount: number;
  regionCount: number;
  callsPerMonth: number;
  historical?: boolean;
};

export type OddsApiQuotaPlanV1 = {
  version: "win.odds-api.quota-plan.v1";
  monthlyLimitCredits: number;
  reserveCredits: number;
  usableCredits: number;
  estimatedMonthlyCredits: number;
  remainingAfterPlan: number;
  utilizationPercent: number;
  alert: "none" | "warning_80_percent" | "critical_95_percent" | "over_budget";
  allowedByBudget: boolean;
  requests: Array<{
    id: string;
    creditsPerCall: number;
    callsPerMonth: number;
    estimatedMonthlyCredits: number;
    historical: boolean;
  }>;
  providerActivationAllowed: false;
};

export class OddsApiQuotaPlanError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "OddsApiQuotaPlanError";
    this.code = code;
  }
}

const positiveInteger = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) > 0;
const nonNegativeInteger = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;

export function planOddsApiMonthlyQuota(input: {
  monthlyLimitCredits: number;
  reserveCredits: number;
  requests: OddsApiQuotaRequestV1[];
}): OddsApiQuotaPlanV1 {
  if (!input || !positiveInteger(input.monthlyLimitCredits) ||
      !nonNegativeInteger(input.reserveCredits) ||
      input.reserveCredits >= input.monthlyLimitCredits ||
      !Array.isArray(input.requests) || input.requests.length === 0) {
    throw new OddsApiQuotaPlanError("quota_plan_input_invalid");
  }

  const ids = new Set<string>();
  const requests = input.requests.map((r) => {
    if (!r || typeof r.id !== "string" || !r.id.trim() || ids.has(r.id) ||
        !positiveInteger(r.marketCount) || !positiveInteger(r.regionCount) ||
        !positiveInteger(r.callsPerMonth) ||
        (r.historical !== undefined && typeof r.historical !== "boolean")) {
      throw new OddsApiQuotaPlanError("quota_request_invalid_or_duplicate");
    }
    ids.add(r.id);
    const historical = r.historical === true;
    const creditsPerCall = r.marketCount * r.regionCount * (historical ? 10 : 1);
    const estimatedMonthlyCredits = creditsPerCall * r.callsPerMonth;
    if (!Number.isSafeInteger(estimatedMonthlyCredits)) {
      throw new OddsApiQuotaPlanError("quota_estimate_overflow");
    }
    return { id: r.id, creditsPerCall, callsPerMonth: r.callsPerMonth,
      estimatedMonthlyCredits, historical };
  });

  const estimatedMonthlyCredits = requests.reduce((sum, r) => sum + r.estimatedMonthlyCredits, 0);
  if (!Number.isSafeInteger(estimatedMonthlyCredits)) {
    throw new OddsApiQuotaPlanError("quota_estimate_overflow");
  }
  const usableCredits = input.monthlyLimitCredits - input.reserveCredits;
  const remainingAfterPlan = usableCredits - estimatedMonthlyCredits;
  const utilizationPercent = estimatedMonthlyCredits / input.monthlyLimitCredits * 100;
  const alert = remainingAfterPlan < 0 ? "over_budget" :
    utilizationPercent >= 95 ? "critical_95_percent" :
    utilizationPercent >= 80 ? "warning_80_percent" : "none";

  return {
    version: "win.odds-api.quota-plan.v1",
    monthlyLimitCredits: input.monthlyLimitCredits,
    reserveCredits: input.reserveCredits,
    usableCredits,
    estimatedMonthlyCredits,
    remainingAfterPlan,
    utilizationPercent,
    alert,
    allowedByBudget: remainingAfterPlan >= 0,
    requests,
    providerActivationAllowed: false
  };
}

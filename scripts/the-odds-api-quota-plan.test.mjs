import test from "node:test";
import assert from "node:assert/strict";
import { planOddsApiMonthlyQuota, OddsApiQuotaPlanError } from "../netlify/lib/the-odds-api-quota-plan.mts";

test("estimates current odds quota using markets x regions x monthly calls", () => {
  const plan = planOddsApiMonthlyQuota({
    monthlyLimitCredits: 500, reserveCredits: 50,
    requests: [{ id: "epl-h2h-us", marketCount: 1, regionCount: 1, callsPerMonth: 300 }]
  });
  assert.equal(plan.estimatedMonthlyCredits, 300);
  assert.equal(plan.remainingAfterPlan, 150);
  assert.equal(plan.allowedByBudget, true);
  assert.equal(plan.providerActivationAllowed, false);
});

test("charges historical odds at ten times current-odds market-region cost", () => {
  const plan = planOddsApiMonthlyQuota({
    monthlyLimitCredits: 500, reserveCredits: 0,
    requests: [{ id: "historical", marketCount: 2, regionCount: 1, callsPerMonth: 3, historical: true }]
  });
  assert.equal(plan.estimatedMonthlyCredits, 60);
  assert.equal(plan.requests[0].creditsPerCall, 20);
});

test("keeps a reserve and blocks plans that would consume it", () => {
  const plan = planOddsApiMonthlyQuota({
    monthlyLimitCredits: 500, reserveCredits: 50,
    requests: [{ id: "too-many", marketCount: 1, regionCount: 1, callsPerMonth: 451 }]
  });
  assert.equal(plan.allowedByBudget, false);
  assert.equal(plan.alert, "over_budget");
  assert.equal(plan.remainingAfterPlan, -1);
});

test("reports 80 and 95 percent budget warnings", () => {
  const warning = planOddsApiMonthlyQuota({ monthlyLimitCredits: 500, reserveCredits: 0,
    requests: [{ id: "warning", marketCount: 1, regionCount: 1, callsPerMonth: 400 }] });
  const critical = planOddsApiMonthlyQuota({ monthlyLimitCredits: 500, reserveCredits: 0,
    requests: [{ id: "critical", marketCount: 1, regionCount: 1, callsPerMonth: 475 }] });
  assert.equal(warning.alert, "warning_80_percent");
  assert.equal(critical.alert, "critical_95_percent");
});

test("rejects empty, duplicate, fractional, negative and overflowing plans", () => {
  for (const input of [
    { monthlyLimitCredits: 500, reserveCredits: 0, requests: [] },
    { monthlyLimitCredits: 500, reserveCredits: 0, requests: [
      { id: "x", marketCount: 1, regionCount: 1, callsPerMonth: 1 },
      { id: "x", marketCount: 1, regionCount: 1, callsPerMonth: 1 }
    ] },
    { monthlyLimitCredits: 500, reserveCredits: 0, requests: [{ id: "x", marketCount: 1.5, regionCount: 1, callsPerMonth: 1 }] },
    { monthlyLimitCredits: 500, reserveCredits: 0, requests: [{ id: "x", marketCount: 2, regionCount: 1, callsPerMonth: Number.MAX_SAFE_INTEGER }] }
  ]) {
    assert.throws(() => planOddsApiMonthlyQuota(input), e => e instanceof OddsApiQuotaPlanError);
  }
});

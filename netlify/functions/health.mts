import { getAIbudgetStatus } from "../lib/ai-budget.mts";

export default async () => {
  const budget = await getAIbudgetStatus();
  return Response.json({
  service: "WIN Worker Engine",
  status: "online",
  version: "0.2.0",
  time: new Date().toISOString(),
  integrations: {
    openaiResponses: Netlify.env.get("OPENAI_API_KEY") && Netlify.env.get("OPENAI_MODEL")
      ? "configured_not_yet_validated"
      : "needs_configuration",
    mcp: "oauth_enabled",
    persistence: "netlify_blobs",
    execution: "scheduled_hourly",
    scheduling: { monitor: "hourly", publicScouting: "every_12_hours_when_budget_allows", aiMonthlyLimitUsd: 5 },
    sts: "no_official_sts_api_connection"
  },
  aiBudget: {
    month: budget.month, monthlyLimitUsd: budget.monthlyLimitUsd,
    spentUsd: budget.spentUsd, reservedUsd: budget.reservedUsd,
    remainingUsd: budget.remainingUsd, calls: budget.calls,
    blockedCalls: budget.blockedCalls
  },
  note: "This endpoint reports service configuration and budget status only; it does not run AI research. Research API requires authorization."
  });
};
export const config = {path:"/api/health"};

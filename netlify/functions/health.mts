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
      ? (Netlify.env.get("WIN_AI_BUDGET_APPROVED") === "true" ? "enabled_not_yet_validated" : "configured_but_disabled_pending_budget_approval")
      : "needs_configuration",
    aiExecutionApproved: Netlify.env.get("WIN_AI_BUDGET_APPROVED") === "true",
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
  note: "This endpoint reports service configuration and budget status only; it does not run AI research. AI calls fail closed until WIN_AI_BUDGET_APPROVED=true after provider-side spending controls and API-key rotation are verified."
  });
};
export const config = {path:"/api/health"};

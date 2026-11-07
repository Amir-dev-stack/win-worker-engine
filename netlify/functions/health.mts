import { requireAuth } from "../lib/auth.mts";
import { getAIbudgetStatus } from "../lib/ai-budget.mts";
import { get, list } from "../lib/store.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) {
    denied.headers.set("cache-control", "no-store");
    return denied;
  }

  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { "cache-control": "no-store" } });

  const budget = await getAIbudgetStatus();
  const [schedulerState, postMatchState, cycles, runs] = await Promise.all([
    get<any>("scheduler-state", "balanced-hourly"),
    get<any>("scheduler-state", "post-match-followup"),
    list<any>("library/learning-cycles", 20),
    list<any>("runs", 30)
  ]);
  const recentCycles = cycles.sort((a: any, b: any) => Date.parse(b.completedAt || b.startedAt || "") - Date.parse(a.completedAt || a.startedAt || "")).slice(0, 8);
  const recentLearningRuns = runs.filter((run: any) => run.origin === "scheduled_intensive_learning").sort((a: any, b: any) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")).slice(0, 8);
  const cycleCounts = { total: cycles.length, completed: cycles.filter((x: any) => x.status === "completed").length, failed: cycles.filter((x: any) => x.status === "failed").length, candidates: cycles.reduce((n: number, x: any) => n + Number(x.strategies?.candidatesCreated || 0), 0) };
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
    execution: "scheduled_four_hour_learning_monitor",
    scheduling: { learningMonitor: "every_4_hours", learningCycles: "one_bounded_research_cycle_every_4_hours_when_budget_approved", aiMonthlyEstimateLimitUsd: 3 },
    sts: "no_official_sts_api_connection"
  },
  learningSystem: {
    schedulerHeartbeat: schedulerState?.lastCheck || null,
    postMatchFollowup: postMatchState ? {
      status: postMatchState.status || "unknown",
      lastAttemptAt: postMatchState.lastAttemptAt || null,
      lastCompletedAt: postMatchState.lastCompletedAt || null,
      lastCheck: postMatchState.lastCheck || null,
      lastError: postMatchState.lastError || null,
      aiCalls: 0
    } : null,
    cycleCounts,
    recentCycles: recentCycles.map((x: any) => ({ id: x.id, status: x.status, cycleType: x.cycleType, sport: x.sport, startedAt: x.startedAt, completedAt: x.completedAt, candidatesCreated: x.strategies?.candidatesCreated || 0, validationStatus: x.learningStatus || x.strategies?.validationStatus || null, error: x.execution?.error || null })),
    recentLearningRuns: recentLearningRuns.map((x: any) => ({ id: x.id, status: x.status, createdAt: x.createdAt, completedAt: x.completedAt, error: x.error || x.scoutSummary?.error || null }))
  },
  aiBudget: {
    month: budget.month, monthlyLimitUsd: budget.monthlyLimitUsd,
    limitEnabled: budget.limitEnabled, limitMode: budget.limitMode,
    spentUsd: budget.spentUsd, reservedUsd: budget.reservedUsd,
    remainingUsd: budget.remainingUsd, calls: budget.calls,
    blockedCalls: budget.blockedCalls
  },
  note: "This endpoint reports service configuration and budget status only; it does not run AI research. AI calls fail closed until WIN_AI_BUDGET_APPROVED=true after provider-side spending controls and API-key rotation are verified."
  }, { headers: { "cache-control": "no-store" } });
};
export const config = {path:"/api/health"};

import type { Config, Context } from "@netlify/functions";
import { get, list, put } from "../lib/store.mts";
import { getAIbudgetStatus } from "../lib/ai-budget.mts";

export default async (_req: Request, context: Context) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const state = await get<any>("scheduler-state", "balanced-hourly") || {};
  const runs = await list<any>("runs", 50);
  const activeRuns = runs.filter(run => ["queued", "scouting", "debating", "synthesizing"].includes(run.status));
  const staleRuns = activeRuns.filter(run => {
    const updated = Date.parse(run.updatedAt || run.createdAt || "");
    return Number.isFinite(updated) && now.getTime() - updated > 30 * 60 * 1000;
  });
  const budget = await getAIbudgetStatus();
  const lastLearningAt = Date.parse(state.lastLearningQueuedAt || "");
  const learningDue = !Number.isFinite(lastLearningAt) || now.getTime() - lastLearningAt >= 4 * 60 * 60 * 1000;
  const aiBudgetApproved = Netlify.env.get("WIN_AI_BUDGET_APPROVED") === "true";
  const learningTasks = [
    { cycleType: "coverage_mapping", focus: "Map major competitions, governing context, public data coverage and priority gaps for this sport." },
    { cycleType: "market_settlement_research", focus: "Document sport-specific betting market definitions, settlement edge cases and source-backed rules; do not assume STS availability." },
    { cycleType: "strategy_hypothesis", focus: "Develop falsifiable, low-variance market strategy hypotheses with exact eligibility rules, exclusions and required pre-event data. Do not claim historical success." },
    { cycleType: "historical_data_audit", focus: "Find public historical results and odds datasets for this sport; assess provenance, timestamp quality, coverage, survivorship and look-ahead risks." },
    { cycleType: "coupon_failure_analysis", focus: "Review relevant verified winning and losing coupon examples in the supplied WIN library pack. Identify failure modes; if evidence is absent, say so." },
    { cycleType: "validation_readiness", focus: "Assess candidate strategies and evidence gaps. Specify chronological holdout and prospective paper-testing requirements. Never promote a candidate to validated." }
  ];
  const learningSports = ["football", "basketball", "tennis", "ice hockey", "volleyball", "handball", "baseball", "cricket", "rugby", "motorsport", "combat sports", "esports"];
  const cycleIndex = Math.max(0, Number(state.learningCycleIndex || 0));
  const learningTrack = {
    ...learningTasks[cycleIndex % learningTasks.length],
    sport: learningSports[Math.floor(cycleIndex / learningTasks.length) % learningSports.length],
    cycleIndex,
    status: "research_only_candidate_evidence"
  };
  let scoutStatus = "not_due";
  let scoutRunId: string | null = state.lastLearningRunId || null;

  if (learningDue && aiBudgetApproved && !budget.spendingLocked && budget.remainingUsd >= 0.03 && Netlify.env.get("OPENAI_API_KEY")) {
    const runId = crypto.randomUUID();
    const brief = {
      taskType: "scheduled_learning",
      event: "WIN intensive learning cycle " + cycleIndex + ": " + learningTrack.cycleType,
      sport: learningTrack.sport,
      timeWindow: "current research snapshot",
      learningTrack,
      objective: "Contribute verified knowledge, falsifiable strategy hypotheses or documented evidence gaps towards WIN's high-probability coupon intelligence mission. This is not a coupon recommendation."
    };
    const createdAt = nowIso;
    await put("runs", runId, {
      id: runId, status: "queued", createdAt, updatedAt: createdAt,
      brief, workers: [], debate: [], workerNetwork: null, master: null,
      origin: "scheduled_intensive_learning"
    });
    const token = Netlify.env.get("WIN_INTERNAL_TOKEN");
    if (!token) {
      await put("runs", runId, { id: runId, status: "failed", createdAt, updatedAt: nowIso, brief, error: "WIN_INTERNAL_TOKEN is not configured." });
      scoutStatus = "blocked_missing_internal_token";
    } else {
      const response = await fetch(new URL("/.netlify/functions/scheduled-scout-runner", context.site.url), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ runId })
      });
      if (response.status === 202 || response.ok) {
        scoutStatus = "queued";
        scoutRunId = runId;
        state.lastLearningQueuedAt = nowIso;
        state.lastLearningRunId = runId;
        state.learningCycleIndex = cycleIndex + 1;
      } else {
        scoutStatus = "queue_failed_http_" + response.status;
        await put("runs", runId, { id: runId, status: "failed", createdAt, updatedAt: nowIso, brief, error: "Scheduled scout queue returned HTTP " + response.status });
      }
    }
  } else if (learningDue && !aiBudgetApproved) {
    scoutStatus = "blocked_budget_approval_required";
  } else if (learningDue && budget.spendingLocked) {
    scoutStatus = "blocked_internal_budget_lock";
  } else if (learningDue && budget.remainingUsd < 0.03) {
    scoutStatus = "skipped_budget_guard";
  } else if (learningDue && !Netlify.env.get("OPENAI_API_KEY")) {
    scoutStatus = "skipped_missing_openai_key";
  }

  const heartbeat = {
    id: nowIso.slice(0, 13),
    checkedAt: nowIso,
    intervalMinutes: 240,
    mode: "intensive_learning",
    status: "online",
    scheduledAI: "one bounded learning research cycle every four hours, subject to explicit budget approval and the monthly application estimate",
    activeRunCount: activeRuns.length,
    staleRunCount: staleRuns.length,
    staleRunIds: staleRuns.map(run => run.id),
    scoutStatus,
    scoutRunId,
    learningTrack,
    learningCycleIndex: cycleIndex,
    aiBudgetRemainingUsd: budget.remainingUsd,
    nextLearningDueAt: state.lastLearningQueuedAt
      ? new Date(Date.parse(state.lastLearningQueuedAt) + 4 * 60 * 60 * 1000).toISOString()
      : nowIso
  };
  state.lastCheckedAt = nowIso;
  state.lastCheck = heartbeat;
  await put("scheduler-state", "balanced-hourly", state);
  await put("library/scheduled-monitoring", heartbeat.id, heartbeat);
  return Response.json(heartbeat);
};

export const config: Config = { schedule: "0 */4 * * *" };

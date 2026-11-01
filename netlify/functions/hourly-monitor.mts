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
  const lastScoutAt = Date.parse(state.lastScoutQueuedAt || "");
  const scoutDue = !Number.isFinite(lastScoutAt) || now.getTime() - lastScoutAt >= 12 * 60 * 60 * 1000;
  let scoutStatus = "not_due";
  let scoutRunId: string | null = state.lastScoutRunId || null;

  const aiBudgetApproved = Netlify.env.get("WIN_AI_BUDGET_APPROVED") === "true";

  if (scoutDue && aiBudgetApproved && budget.remainingUsd >= 0.03 && Netlify.env.get("OPENAI_API_KEY")) {
    const runId = crypto.randomUUID();
    const brief = {
      taskType: "scheduled_scout",
      event: "Upcoming public sporting fixtures and pre-match offers in the next 24 hours",
      sport: "all sports",
      timeWindow: "next 24 hours",
      objective: "Discover a small, source-backed list of upcoming events and publicly visible pre-match offers. This is scouting only, not a coupon recommendation."
    };
    const createdAt = nowIso;
    await put("runs", runId, {
      id: runId, status: "queued", createdAt, updatedAt: createdAt,
      brief, workers: [], debate: [], workerNetwork: null, master: null,
      origin: "scheduled_balanced_scout"
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
        state.lastScoutQueuedAt = nowIso;
        state.lastScoutRunId = runId;
      } else {
        scoutStatus = "queue_failed_http_" + response.status;
        await put("runs", runId, { id: runId, status: "failed", createdAt, updatedAt: nowIso, brief, error: "Scheduled scout queue returned HTTP " + response.status });
      }
    }
  } else if (scoutDue && !aiBudgetApproved) {
    scoutStatus = "blocked_budget_approval_required";
  } else if (scoutDue && budget.remainingUsd < 0.03) {
    scoutStatus = "skipped_budget_guard";
  } else if (scoutDue && !Netlify.env.get("OPENAI_API_KEY")) {
    scoutStatus = "skipped_missing_openai_key";
  }

  const heartbeat = {
    id: nowIso.slice(0, 13),
    checkedAt: nowIso,
    intervalMinutes: 60,
    mode: "balanced",
    status: "online",
    scheduledAI: "one low-cost scouting pass every 12 hours, subject to the monthly $5 budget",
    activeRunCount: activeRuns.length,
    staleRunCount: staleRuns.length,
    staleRunIds: staleRuns.map(run => run.id),
    scoutStatus,
    scoutRunId,
    aiBudgetRemainingUsd: budget.remainingUsd,
    nextScoutDueAt: state.lastScoutQueuedAt
      ? new Date(Date.parse(state.lastScoutQueuedAt) + 12 * 60 * 60 * 1000).toISOString()
      : nowIso
  };
  state.lastCheckedAt = nowIso;
  state.lastCheck = heartbeat;
  await put("scheduler-state", "balanced-hourly", state);
  await put("library/scheduled-monitoring", heartbeat.id, heartbeat);
  return Response.json(heartbeat);
};

export const config: Config = { schedule: "0 * * * *" };

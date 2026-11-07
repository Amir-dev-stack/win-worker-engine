export type WinSchedulerEnv = {
  WIN_ORIGIN: string;
  WIN_INTERNAL_TOKEN: string;
};

export type WinCronJob = {
  id: "health" | "post_match_failover";
  path: string;
  method: "GET" | "POST";
};

export type WinFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function resolveWinCronJob(cron: string): WinCronJob | null {
  if (cron === "*/15 * * * *") {
    return { id: "health", path: "/api/health", method: "GET" };
  }
  if (cron === "53 */4 * * *") {
    // Failover check runs 30 minutes after Netlify's existing :23 four-hour job.
    return { id: "post_match_failover", path: "/.netlify/functions/post-match-runner", method: "POST" };
  }
  return null;
}

function resolveOrigin(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("WIN_ORIGIN must be a valid HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("WIN_ORIGIN must be a credential-free HTTPS origin without a path, query or fragment.");
  }
  return url;
}

export async function dispatchWinCronJob(
  cron: string,
  env: WinSchedulerEnv,
  fetcher: WinFetch = fetch,
  nowMs = Date.now()
): Promise<{ job: string; status: number; ok: true } | { job: string; skipped: true; reason?: string }> {
  const job = resolveWinCronJob(cron);
  if (!job) return { job: "unrecognized", skipped: true };
  if (!env?.WIN_INTERNAL_TOKEN?.trim()) throw new Error("WIN_INTERNAL_TOKEN is not configured.");
  const origin = resolveOrigin(env.WIN_ORIGIN);
  const headers = {
    authorization: "Bearer " + env.WIN_INTERNAL_TOKEN.trim(),
    "cache-control": "no-store"
  };
  if (job.id === "post_match_failover") {
    const health = await fetcher(new URL("/api/health", origin), {
      method: "GET", headers, signal: AbortSignal.timeout(10_000)
    });
    if (!health.ok) throw new Error("WIN failover health probe returned HTTP " + health.status + ".");
    let healthData: any = null;
    try { healthData = await health.json(); } catch { /* Missing heartbeat means failover is required. */ }
    const lastCompletedAt = Date.parse(healthData?.learningSystem?.postMatchFollowup?.lastCompletedAt || "");
    const recentPrimaryRun = Number.isFinite(lastCompletedAt) && lastCompletedAt <= nowMs &&
      nowMs - lastCompletedAt < 3.5 * 60 * 60 * 1000;
    if (recentPrimaryRun) return { job: job.id, skipped: true, reason: "recent_primary_completion" };
  }
  const response = await fetcher(new URL(job.path, origin), {
    method: job.method,
    headers,
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("WIN scheduled job " + job.id + " returned HTTP " + response.status + ".");
  return { job: job.id, status: response.status, ok: true };
}

export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  },

  async scheduled(
    controller: ScheduledController,
    env: WinSchedulerEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      dispatchWinCronJob(controller.cron, env)
        .then(result => console.log(JSON.stringify({ component: "win-scheduler", ...result })))
        .catch(error => console.error(JSON.stringify({
          component: "win-scheduler",
          job: resolveWinCronJob(controller.cron)?.id || "unrecognized",
          error: error instanceof Error ? error.message : "scheduled_dispatch_failed"
        })))
    );
  }
};

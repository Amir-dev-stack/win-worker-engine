import { authorized } from "../lib/auth.mts";
import { get, put, getWithMetadata, putIfMatch, putIfNew } from "../lib/store.mts";
import { runPostMatchFollowups } from "../lib/post-match-followup.mts";

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const lockKey = "active";
  const priorState = await get<any>("scheduler-state", "post-match-followup") || {};
  const prior = await getWithMetadata<any>("library/post-match-runner-lock", lockKey);
  if (prior?.value?.status === "running" && Date.parse(prior.value.leaseExpiresAt || "") > nowMs) {
    return Response.json({ accepted: false, status: "already_running", startedAt: prior.value.startedAt });
  }
  const lock = {
    id: lockKey, status: "running", startedAt: now,
    leaseExpiresAt: new Date(nowMs + 16 * 60 * 1000).toISOString(),
    runner: "post-match-background", aiCalls: 0
  };
  const claimed = prior
    ? await putIfMatch("library/post-match-runner-lock", lockKey, lock, prior.etag)
    : await putIfNew("library/post-match-runner-lock", lockKey, lock);
  if (!claimed.modified || !claimed.etag) {
    return Response.json({ accepted: false, status: "already_running" }, { status: 409 });
  }
  const lockEtag = claimed.etag;
  await put("scheduler-state", "post-match-followup", {
    ...priorState, status: "running", startedAt: now, lastAttemptAt: now,
    runner: "post-match-background", aiCalls: 0
  });
  try {
    const summary = await runPostMatchFollowups();
    const completedAt = new Date().toISOString();
    const completedLock = await putIfMatch("library/post-match-runner-lock", lockKey, {
      ...lock, status: "completed", completedAt, leaseExpiresAt: null
    }, lockEtag);
    if (!completedLock?.modified) throw new Error("Post-match runner lease was lost before completion could be recorded.");
    await put("scheduler-state", "post-match-followup", {
      ...priorState, status: "completed", startedAt: now, lastCheck: completedAt,
      lastCompletedAt: completedAt, resultStatus: summary.status, aiCalls: 0
    });
    return Response.json({ accepted: true, status: summary.status, summary, completedAt, aiCalls: 0 });
  } catch (error) {
    await put("scheduler-state", "post-match-followup", {
      ...priorState, status: "failed", startedAt: now, lastCheck: new Date().toISOString(),
      lastError: String(error).slice(0, 400), aiCalls: 0
    });
    await putIfMatch("library/post-match-runner-lock", lockKey, {
      ...lock, status: "failed", failedAt: new Date().toISOString(), leaseExpiresAt: null,
      error: String(error).slice(0, 300)
    }, lockEtag);
    throw error;
  }
};
export const config = { background: true };

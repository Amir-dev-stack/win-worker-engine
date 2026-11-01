import { requireAuth } from "../lib/auth.mts";
import { list, put } from "../lib/store.mts";

const TASK_TYPES = new Set(["research_event", "build_latest_coupon", "audit_existing_coupon", "compare_coupons"]);

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") return Response.json(await list("runs", 100));
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let brief: any;
  try { brief = await req.json(); }
  catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }

  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return Response.json({ error: "Expected a research brief object" }, { status: 400 });
  }

  const taskType = typeof brief.taskType === "string" && TASK_TYPES.has(brief.taskType)
    ? brief.taskType : "research_event";
  const defaultEvents: Record<string, string> = {
    build_latest_coupon: "LATEST PUBLIC STS PRE-MATCH COUPON",
    audit_existing_coupon: "USER-SUPPLIED COUPON AUDIT",
    compare_coupons: "COUPON COMPARISON"
  };
  const event = typeof brief.event === "string" ? brief.event.trim() : "";
  const normalizedEvent = event || defaultEvents[taskType] || "";

  if (normalizedEvent.length < 3 || normalizedEvent.length > 300) {
    return Response.json({ error: "event is required (3–300 characters) for this research type" }, { status: 400 });
  }
  if ((taskType === "audit_existing_coupon" || taskType === "compare_coupons") &&
      (typeof brief.existingCoupon !== "string" || brief.existingCoupon.trim().length < 3)) {
    return Response.json({ error: "existingCoupon is required for coupon audit/comparison" }, { status: 400 });
  }

  const targetOdds = Number(brief.targetCombinedOdds);
  const maxLegs = Number(brief.maxLegs);
  const normalized = {
    ...brief,
    event: normalizedEvent,
    taskType,
    existingCoupon: typeof brief.existingCoupon === "string" ? brief.existingCoupon.slice(0, 12000) : undefined,
    context: typeof brief.context === "string" ? brief.context.slice(0, 16000) : "",
    targetCombinedOdds: Number.isFinite(targetOdds) && targetOdds > 1 ? targetOdds : undefined,
    maxLegs: Number.isInteger(maxLegs) && maxLegs >= 1 && maxLegs <= 20 ? maxLegs : undefined
  };

  if (!Array.isArray(normalized.humanTips) || normalized.humanTips.length === 0) {
    normalized.humanTips = await list("tips", 100);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const run = {
    id, status: "queued", createdAt, updatedAt: createdAt,
    brief: normalized, workers: [], debate: [], workerNetwork: null, master: null
  };
  await put("runs", id, run);
  await put("library/research-runs", id, { ...run, libraryArchive: { status: "queued" } });

  const base = new URL(req.url);
  const trigger = await fetch(new URL("/.netlify/functions/worker-runner", base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": req.headers.get("authorization") ?? ""
    },
    body: JSON.stringify({ runId: id })
  });

  if (!trigger.ok && trigger.status !== 202) {
    await put("runs", id, {
      ...run, status: "failed",
      error: "Could not queue background research workers: HTTP " + trigger.status,
      updatedAt: new Date().toISOString()
    });
    return Response.json({ error: "Could not queue WIN workers", runId: id }, { status: 502 });
  }

  return Response.json({
    runId: id, status: "queued", taskType,
    message: "WIN Executive Coordination created the run. The worker network and eight department passes are queued."
  }, { status: 202 });
};

export const config = { path: "/api/runs" };

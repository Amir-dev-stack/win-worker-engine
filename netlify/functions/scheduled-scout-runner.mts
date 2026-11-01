import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";
import { runScheduledLearning } from "../lib/ai.mts";

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const run = await get<any>("runs", body.runId);
  if (!run) return new Response("Run not found", { status: 404 });

  const startedAt = new Date().toISOString();
  await put("runs", run.id, { ...run, status: "scouting", startedAt, updatedAt: startedAt });
  try {
    const libraryReview = await getMandatoryLearningPack(run.brief);
    const brief = { ...run.brief, runId: run.id, libraryReview };
    const scout = await runScheduledLearning(brief);
    const completedAt = new Date().toISOString();
    const completed = {
      ...run, brief, status: scout.status === "completed" && scout.report.trim() ? "completed" : "failed",
      workers: [scout], debate: [], master: null,
      decision: "SCOUTING ONLY — no betting recommendation or coupon decision was made.",
      updatedAt: completedAt, completedAt,
      scoutSummary: {
        status: scout.status,
        report: scout.report,
        citations: scout.citations,
        error: scout.error || null
      }
    };
    await put("runs", run.id, completed);
    await put("library/learning-cycles", run.id, {
      id: run.id, runId: run.id, status: completed.status,
      cycleType: run.brief?.learningTrack?.cycleType || "unspecified",
      sport: run.brief?.learningTrack?.sport || null,
      focus: run.brief?.learningTrack?.focus || null,
      cycleIndex: run.brief?.learningTrack?.cycleIndex ?? null,
      report: scout.report, citations: scout.citations, error: scout.error || null,
      learningStatus: "candidate_research_not_validated",
      createdAt: run.createdAt, completedAt
    });
    await put("library/agent-notes", "scheduled-learning-" + run.id, {
      id: "scheduled-learning-" + run.id, runId: run.id,
      noteType: "scheduled_learning_research",
      cycleType: run.brief?.learningTrack?.cycleType || "unspecified",
      sport: run.brief?.learningTrack?.sport || null,
      report: scout.report, citations: scout.citations,
      validationStatus: "candidate_for_validation",
      createdAt: completedAt
    });
    const libraryArchive = await archiveRunToLibrary(completed);
    await put("runs", run.id, { ...completed, libraryArchive });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failed = { ...run, status: "failed", error: String(error), updatedAt: failedAt, completedAt: failedAt };
    await put("runs", run.id, failed);
    try { await archiveRunToLibrary(failed); } catch { /* primary failure remains visible on the run */ }
  }
  return new Response(null, { status: 202 });
};

export const config: Config = { background: true };

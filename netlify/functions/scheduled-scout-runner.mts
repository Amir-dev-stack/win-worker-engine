import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";
import { runScheduledLearning } from "../lib/ai.mts";

function extractLearningCycle(report: string): any | null {
  const open = "<WIN_LEARNING_CYCLE_JSON>";
  const close = "</WIN_LEARNING_CYCLE_JSON>";
  const start = report.indexOf(open);
  const end = report.indexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(report.slice(start + open.length, end).trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
      decision: "SCHEDULED LEARNING ONLY — no strategy was validated and no betting recommendation or coupon decision was made.",
      updatedAt: completedAt, completedAt,
      scoutSummary: {
        status: scout.status,
        report: scout.report,
        citations: scout.citations,
        error: scout.error || null
      }
    };
    await put("runs", run.id, completed);
    const learningData = extractLearningCycle(scout.report);
    const strategyCandidates = Array.isArray(learningData?.candidateStrategies) ? learningData.candidateStrategies.slice(0, 20) : [];
    for (let index = 0; index < strategyCandidates.length; index++) {
      const candidate = strategyCandidates[index];
      const candidateId = run.id + ":strategy:" + index;
      await put("library/strategy-candidates", candidateId, {
        id: candidateId, runId: run.id,
        name: String(candidate?.name || "Unnamed candidate").slice(0, 200),
        sport: run.brief?.learningTrack?.sport || null,
        market: String(candidate?.market || "").slice(0, 180),
        hypothesis: String(candidate?.hypothesis || "").slice(0, 3000),
        eligibilityRules: Array.isArray(candidate?.eligibilityRules) ? candidate.eligibilityRules.slice(0, 30) : [],
        exclusions: Array.isArray(candidate?.exclusions) ? candidate.exclusions.slice(0, 30) : [],
        requiredData: Array.isArray(candidate?.requiredData) ? candidate.requiredData.slice(0, 30) : [],
        sourceRefs: Array.isArray(learningData?.sourceRefs) ? learningData.sourceRefs.slice(0, 30) : [],
        validationStatus: "candidate_for_validation",
        validated: false,
        createdAt: completedAt
      });
    }
    await put("library/learning-cycles", run.id, {
      id: run.id, runId: run.id, status: completed.status,
      cycleType: run.brief?.learningTrack?.cycleType || "unspecified",
      sport: run.brief?.learningTrack?.sport || null,
      focus: run.brief?.learningTrack?.focus || null,
      cycleIndex: run.brief?.learningTrack?.cycleIndex ?? null,
      strategyCandidateCount: strategyCandidates.length,
      coverageGaps: Array.isArray(learningData?.coverageGaps) ? learningData.coverageGaps.slice(0, 50) : [],
      validationBlockers: Array.isArray(learningData?.validationBlockers) ? learningData.validationBlockers.slice(0, 50) : [],
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

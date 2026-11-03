import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";
import { runScheduledLearning } from "../lib/ai.mts";
import { getModelLabResearchPack } from "../lib/model-lab.mts";
import { registerAgentProposals } from "../lib/agent-evolution.mts";

function extractLearningCycle(report: string): any | null {
  const open = "<WIN_LEARNING_CYCLE_JSON>";
  const close = "</WIN_LEARNING_CYCLE_JSON>";
  const start = report.indexOf(open);
  const end = report.indexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(report.slice(start + open.length, end).trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}


function extractAgentProposals(report: string): any | null {
  const open = "<WIN_AGENT_PROPOSALS_JSON>", close = "</WIN_AGENT_PROPOSALS_JSON>";
  const start = report.indexOf(open), end = report.indexOf(close);
  if (start < 0 || end <= start) return null;
  try { const value = JSON.parse(report.slice(start + open.length, end).trim()); return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  catch { return null; }
}

function extractEntityAgent(report: string): any | null {
  const open = "<WIN_ENTITY_AGENT_JSON>", close = "</WIN_ENTITY_AGENT_JSON>";
  const start = report.indexOf(open), end = report.indexOf(close);
  if (start < 0 || end <= start) return null;
  try { const value = JSON.parse(report.slice(start + open.length, end).trim()); return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  catch { return null; }
}

function stage(name: string, status: string, startedAt: string, extra: Record<string, unknown> = {}) {
  return { name, status, startedAt, finishedAt: new Date().toISOString(), ...extra };
}

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const run = await get<any>("runs", body.runId);
  if (!run) return new Response("Run not found", { status: 404 });
  if (run.status === "completed" && run.learningReportVersion >= 2) {
    return new Response(null, { status: 202 });
  }

  const startedAt = new Date().toISOString();
  const stages: any[] = [];
  let agentTask: any = null;
  await put("runs", run.id, { ...run, status: "scouting", startedAt, updatedAt: startedAt, learningReportVersion: 2 });

  try {
    const reviewStarted = new Date().toISOString();
    const libraryReview = await getMandatoryLearningPack(run.brief);
    const modelLabResearchPack = await getModelLabResearchPack();
    const allAgentTasks = await list<any>("library/agent-task-queue", 1000);
    const staleBefore = Date.now() - 30 * 60 * 1000;
    for (const stale of allAgentTasks.filter(task => task.status === "running" && Date.parse(task.lastAttemptAt || "") < staleBefore)) {
      await put("library/agent-task-queue", stale.id, { ...stale, status: Number(stale.attempts || 0) >= 3 ? "failed" : "queued", updatedAt: new Date().toISOString(), error: "Recovered stale running task after worker timeout." });
    }
    const pendingAgentTasks = allAgentTasks
      .filter(task => task.status === "queued" || (task.status === "running" && Number(task.attempts || 0) < 3 && Date.parse(task.lastAttemptAt || "") < staleBefore))
      .sort((a,b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
    agentTask = pendingAgentTasks[0] || null;
    if (agentTask) {
      agentTask = { ...agentTask, status: "running", attempts: Number(agentTask.attempts || 0) + 1, lastAttemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await put("library/agent-task-queue", agentTask.id, agentTask);
    }
    stages.push(stage("review_existing_WIN_knowledge", "completed", reviewStarted, {
      counts: libraryReview.counts, areasReviewed: libraryReview.areasReviewed
    }));

    const aiStarted = new Date().toISOString();
    const brief = { ...run.brief, runId: run.id, libraryReview, modelLabResearchPack, ...(agentTask ? { agentTask } : {}) };
    const scout = await runScheduledLearning(brief);
    const completedAt = new Date().toISOString();
    const aiCompleted = scout.status === "completed" && Boolean(scout.report?.trim());
    stages.push(stage("AI_research_execution", aiCompleted ? "completed" : "failed", aiStarted, {
      agentId: scout.workerId || null, agentName: scout.name || null,
      model: scout.model || null, responseId: scout.responseId || null,
      citationCount: Array.isArray(scout.citations) ? scout.citations.length : 0,
      reportCharacters: scout.report?.length || 0,
      error: scout.error || null
    }));

    const learningData = extractLearningCycle(scout.report || "");
    const agentProposalData = extractAgentProposals(scout.report || "");
    let agentEvolutionSummary:any=null;
    if(agentProposalData){try{agentEvolutionSummary=await registerAgentProposals(agentProposalData,run.id,modelLabResearchPack);}catch(e){agentEvolutionSummary={status:"proposal_processing_failed",error:String(e).slice(0,300)};}}
    const entityAgentData = agentTask ? extractEntityAgent(scout.report || "") : null;
    const entityAgentValid = !agentTask || Boolean(entityAgentData && entityAgentData.agentId === agentTask.agentId && entityAgentData.scope && Object.entries(agentTask.scope || {}).every(([key,value]) => entityAgentData.scope[key] === value) && typeof entityAgentData.profileSummary === "string" && Array.isArray(entityAgentData.facts) && Array.isArray(entityAgentData.unknowns) && Array.isArray(entityAgentData.nextResearch));
    const structuredLearningValid = Boolean(learningData && typeof learningData.cycleType === "string" && Array.isArray(learningData.candidateStrategies) && Array.isArray(learningData.coverageGaps) && Array.isArray(learningData.sourceRefs) && Array.isArray(learningData.validationBlockers));
    const cycleCompleted = aiCompleted && structuredLearningValid && entityAgentValid;
    if (stages[1]) { stages[1].status = cycleCompleted ? "completed" : "failed"; if (!structuredLearningValid && !stages[1].error) stages[1].error = "Required WIN_LEARNING_CYCLE_JSON block is missing or invalid."; if (agentTask && !entityAgentValid) stages[1].error = "Required WIN_ENTITY_AGENT_JSON block is missing or invalid."; }
    const strategyCandidates = Array.isArray(learningData?.candidateStrategies)
      ? learningData.candidateStrategies.slice(0, 20) : [];
    if (agentTask) {
      const taskStatus = cycleCompleted ? "completed" : agentTask.attempts >= 3 ? "failed" : "queued";
      await put("library/agent-task-queue", agentTask.id, { ...agentTask, status: taskStatus, updatedAt: completedAt, completedAt: cycleCompleted ? completedAt : null, error: cycleCompleted ? null : (scout.error || (entityAgentValid ? "learning_cycle_json_invalid" : "entity_agent_json_invalid")), reportRunId: run.id });
      if (cycleCompleted && entityAgentData) {
        const prior = await get<any>("library/persistent-agent-profiles", agentTask.agentId) || {};
        const facts = entityAgentData.facts.filter((x:any) => typeof x?.claim === "string" && typeof x?.sourceUrl === "string" && x.sourceUrl.startsWith("https://") && typeof x?.retrievedAt === "string" && ["high","medium","low"].includes(x?.confidence)).slice(0, 50);
        const profile = { ...prior, id: agentTask.agentId, name: agentTask.name, tier: agentTask.tier, scope: agentTask.scope,
          profileSummary: entityAgentData.profileSummary.slice(0, 5000), facts, unknowns: Array.isArray(entityAgentData.unknowns)?entityAgentData.unknowns.slice(0,50):[],
          nextResearch: Array.isArray(entityAgentData.nextResearch)?entityAgentData.nextResearch.slice(0,30):[],
          lastRunId: run.id, lastTaskId: agentTask.id, updatedAt: completedAt, validationStatus: "research_only_unvalidated", promoted: false };
        await put("library/persistent-agent-profiles", agentTask.agentId, profile);
        await put("library/agent-observations", agentTask.id, { id: agentTask.id, agentId: agentTask.agentId, runId: run.id, tier: agentTask.tier, scope: agentTask.scope, facts, unknowns: profile.unknowns, sourceRefs: facts.map((x:any)=>x.sourceUrl), createdAt: completedAt, origin: "independent_entity_agent", validated: false, lab: "research" });
      }
    }
    const completed = {
      ...run, brief, status: cycleCompleted ? "completed" : "failed",
      workers: [scout], debate: [], master: null,
      decision: "SCHEDULED LEARNING ONLY — no strategy was validated and no betting recommendation or coupon decision was made.",
      updatedAt: completedAt, completedAt, learningReportVersion: 2, agentEvolution:agentEvolutionSummary,
      learningStages: stages,
      scoutSummary: { status: scout.status, report: scout.report, citations: scout.citations, error: scout.error || null },
    };
    await put("runs", run.id, completed);

    const storageStarted = new Date().toISOString();
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
        validationStatus: "candidate_for_validation", validated: false, createdAt: completedAt
      });
    }

    const report = {
      id: run.id, runId: run.id, reportVersion: 1,
      title: "WIN Research & Learning Report — " + (run.brief?.event || run.id),
      status: completed.status,
      cycleType: learningData?.cycleType || run.brief?.learningTrack?.cycleType || "unspecified",
      sport: agentTask?.scope?.sport || run.brief?.learningTrack?.sport || null,
      focus: agentTask ? "Independent persistent agent: " + agentTask.name : run.brief?.learningTrack?.focus || null,
      cycleIndex: run.brief?.learningTrack?.cycleIndex ?? null,
      startedAt, completedAt,
      workPerformed: {
        agentsRun: scout.workerId ? [{ id: scout.workerId, name: scout.name || null, model: scout.model || null }] : [],
        departmentsRun: [agentTask ? "independent_persistent_entity_agent" : "scheduled_learning_research"],
        agentTask: agentTask ? { id: agentTask.id, agentId: agentTask.agentId, name: agentTask.name, tier: agentTask.tier, status: cycleCompleted ? "completed" : "failed_or_requeued" } : null,
        libraryAreasReviewed: libraryReview.areasReviewed,
        libraryReviewCounts: libraryReview.counts
      },
      findings: {
        summary: learningData?.summary || null,
        keyFindings: Array.isArray(learningData?.keyFindings) ? learningData.keyFindings.slice(0, 50) : [],
        discoveries: Array.isArray(learningData?.discoveries) ? learningData.discoveries.slice(0, 50) : [],
        coverageGaps: Array.isArray(learningData?.coverageGaps) ? learningData.coverageGaps.slice(0, 50) : [],
        validationBlockers: Array.isArray(learningData?.validationBlockers) ? learningData.validationBlockers.slice(0, 50) : [],
        sourceRefs: Array.isArray(learningData?.sourceRefs) ? learningData.sourceRefs.slice(0, 50) : []
      },
      strategies: {
        candidatesCreated: strategyCandidates.length,
        candidates: strategyCandidates,
        validationStatus: "candidate_research_not_validated"
      },
      execution: {
        stages,
        agentStatus: scout.status,
        citationCount: Array.isArray(scout.citations) ? scout.citations.length : 0,
        reportCharacters: scout.report?.length || 0,
        error: scout.error || null
      },
      rawReport: scout.report || "",
      citations: Array.isArray(scout.citations) ? scout.citations : [],
      learningStatus: completed.status === "completed" ? (agentTask ? "entity_profile_updated_unvalidated" : "candidate_research_not_validated") : "failed_no_learning_claimed",
      warning: "A completed research report is not proof that a strategy is profitable or validated. Verify sources and test strategies prospectively."
    };
    await put("library/learning-cycles", run.id, report);
    await put("library/agent-notes", "scheduled-learning-" + run.id, {
      id: "scheduled-learning-" + run.id, runId: run.id,
      noteType: "scheduled_learning_research", title: report.title,
      cycleType: report.cycleType, sport: report.sport,
      report: scout.report, citations: scout.citations,
      validationStatus: "candidate_for_validation", createdAt: completedAt
    });
    stages.push(stage("persist_report_and_learning_to_library", "completed", storageStarted, {
      learningCycleSaved: true, strategyCandidatesSaved: strategyCandidates.length
    }));
    const libraryArchive = await archiveRunToLibrary({ ...completed, learningStages: stages });
    const finalRun = { ...completed, learningStages: stages, libraryArchive };
    await put("runs", run.id, finalRun);
    await put("library/learning-cycles", run.id, { ...report, execution: { ...report.execution, stages } });
  } catch (error) {
    const failedAt = new Date().toISOString();
    if (agentTask) await put("library/agent-task-queue", agentTask.id, { ...agentTask, status: agentTask.attempts >= 3 ? "failed" : "queued", updatedAt: failedAt, error: String(error).slice(0, 500) });
    stages.push({ name: "research_cycle", status: "failed", finishedAt: failedAt, error: String(error) });
    const failed = { ...run, status: "failed", error: String(error), learningStages: stages,
      learningReportVersion: 2, updatedAt: failedAt, completedAt: failedAt };
    await put("runs", run.id, failed);
    await put("library/learning-cycles", run.id, {
      id: run.id, runId: run.id, reportVersion: 1,
      title: "WIN Research & Learning Report — FAILED — " + (run.brief?.event || run.id),
      status: "failed", cycleType: run.brief?.learningTrack?.cycleType || "unspecified",
      sport: run.brief?.learningTrack?.sport || null, focus: run.brief?.learningTrack?.focus || null,
      startedAt, completedAt: failedAt, workPerformed: { departmentsRun: ["scheduled_learning_research"] },
      findings: { summary: null, keyFindings: [], discoveries: [], coverageGaps: [], validationBlockers: [], sourceRefs: [] },
      strategies: { candidatesCreated: 0, candidates: [], validationStatus: "not_run" },
      execution: { stages, error: String(error) }, rawReport: "",
      learningStatus: "failed_no_learning_claimed"
    });
    try { await archiveRunToLibrary(failed); } catch { /* failure remains recorded */ }
  }
  return new Response(null, { status: 202 });
};

export const config: Config = { background: true };

import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";
import { runDebate, runGlobalMaster, runIndependentWorkers } from "../lib/ai.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";

function hasLibraryReviewReceipt(report: string): boolean {
  const open = "<WIN_LIBRARY_REVIEW_JSON>";
  const close = "</WIN_LIBRARY_REVIEW_JSON>";
  const start = report.indexOf(open);
  const end = report.indexOf(close);
  if (start < 0 || end <= start) return false;
  try {
    const receipt = JSON.parse(report.slice(start + open.length, end).trim());
    return receipt?.reviewed === true &&
      Array.isArray(receipt.winningRecordIds) &&
      Array.isArray(receipt.losingRecordIds) &&
      Array.isArray(receipt.validatedLessonIds) &&
      Array.isArray(receipt.emptyCollections);
  } catch { return false; }
}

function updateNetworkStatuses(network: any, reports: any[], debate: any[]) {
  const departmentById = new Map(reports.map(report => [report.departmentId, report]));
  const updatedNodes = (network?.nodes ?? []).map((node: any) => {
    if (node.tier !== "MAIN_DEPARTMENT") {
      if (node.executionMode === "covered_by_department_checklist" && node.assignedDepartment) {
        const report: any = departmentById.get(node.assignedDepartment);
        return {
          ...node,
          status: !report ? "not_run" : report.status === "completed" && report.report?.trim()
            ? "covered_by_department_pass" : "blocked_by_department_pass"
        };
      }
      return node;
    }
    const report: any = departmentById.get(node.assignedDepartment);
    return {
      ...node,
      status: !report ? "not_run" : report.status === "completed" && report.report?.trim()
        ? "completed" : "failed",
      workerId: report?.workerId,
      responseId: report?.responseId
    };
  });

  return {
    ...network,
    nodes: updatedNodes,
    executionSummary: {
      departmentApiRequests: reports.length,
      completedDepartmentReports: reports.filter(r => r.status === "completed" && r.report?.trim()).length,
      failedDepartmentReports: reports.filter(r => r.status !== "completed" || !r.report?.trim()).length,
      debateApiRequests: debate.length,
      completedDebateReports: debate.filter(r => r.status === "completed" && r.report?.trim()).length,
      actualApiSessions: reports.length + debate.length,
      subroleAssignmentsAreSeparateApiSessions: false
    },
    handoffs: reports.map(report => ({
      from: report.departmentId || report.role,
      to: report.departmentId ? (network.departments.find((d: any) => d.id === report.departmentId)?.handoffTo || ["GLOBAL_MASTER"]) : ["GLOBAL_MASTER"],
      status: report.status === "completed" && report.report?.trim() ? "accepted_for_consolidation" : "blocked",
      workerId: report.workerId
    }))
  };
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
    // Attach a small, relevant slice of prior frozen records for Department 7.
    const priorPredictions = (await list<any>("predictions", 200)).slice(0, 20).map(p => ({
      id: p.id, runId: p.runId, recordedAt: p.recordedAt,
      brief: p.brief, decision: p.decision
    }));
    const priorResults = (await list<any>("results", 200)).slice(0, 20).map(r => ({
      predictionId: r.predictionId, outcome: r.outcome,
      settlementSource: r.settlementSource, recordedAt: r.recordedAt
    }));
    const brief = {
      ...run.brief,
      runId: run.id,
      priorLearning: { priorPredictions, priorResults },
      libraryReview
    };

    // D1 scouts first. The result creates the dynamic sport/country/competition/event graph.
    const firstPass = await runIndependentWorkers(brief, run.id);
    const { reports, workerNetwork } = firstPass;
    const withDepartments = {
      ...run, brief, status: "debating", workers: reports,
      workerNetwork: updateNetworkStatuses(workerNetwork, reports, []),
      updatedAt: new Date().toISOString()
    };
    await put("runs", run.id, withDepartments);

    const debate = await runDebate(brief, reports);
    const networkAfterDebate = updateNetworkStatuses(workerNetwork, reports, debate);
    const withDebate = {
      ...withDepartments, status: "synthesizing", debate,
      workerNetwork: { ...networkAfterDebate, libraryReviewGate: { status: missingLibraryReceipts.length ? "failed" : "passed", failures: missingLibraryReceipts, reviewedAt: libraryReview.reviewedAt } }, updatedAt: new Date().toISOString()
    };
    await put("runs", run.id, withDebate);

    const missingLibraryReceipts = reports.filter(x => ["D6", "D7"].includes(x.departmentId) && !hasLibraryReviewReceipt(x.report || "")).map(x => x.departmentId + " mandatory library review receipt missing or invalid");
    const failed = [...reports, ...debate].filter(x => x.status !== "completed" || !x.report?.trim());
    const gateFailures = [...failed.map(x => (x.departmentId ? x.departmentId + " — " : "") + x.role + ": " + (x.error || "empty report")), ...missingLibraryReceipts];
    const master = failed.length || missingLibraryReceipts.length
      ? {
          workerId: crypto.randomUUID(),
          role: "WIN Global Master — deterministic Low-Risk Gate",
          phase: "final", status: "completed",
          report: "FINAL DECISION: NO BET\n\nThe WIN Low-Risk Gate rejected this run because one or more required department or adversarial reports failed or returned an empty report. Failed checks: " +
            gateFailures.join("; ") +
            ". Do not place a bet. Re-run after the service or evidence blocker is resolved.",
          citations: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
        }
      : await runGlobalMaster(brief, reports, debate, networkAfterDebate);

    const masterValid = master.status === "completed" && Boolean(master.report?.trim());
    const completed = {
      ...withDebate,
      status: "completed",
      master: masterValid ? master : {
        workerId: crypto.randomUUID(), role: "WIN Global Master — deterministic Low-Risk Gate",
        phase: "final", status: "completed",
        report: "FINAL DECISION: NO BET\n\nThe Global Master did not return a usable final report. The Low-Risk Gate therefore blocks coupon publication.",
        citations: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
      },
      decision: masterValid ? master.report :
        "FINAL DECISION: NO BET — a required worker or Global Master report was missing or empty.",
      workerNetwork: networkAfterDebate,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    await put("runs", run.id, completed);

    const predictionId = crypto.randomUUID();
    const prediction = {
      id: predictionId, runId: run.id, recordedAt: new Date().toISOString(),
      frozen: true, brief, decision: completed.decision,
      workerResponseIds: [...reports, ...debate, master].map(x => x.responseId).filter(Boolean),
      workerNetworkSummary: networkAfterDebate.executionSummary
    };
    await put("predictions", predictionId, prediction);
    await put("library/frozen-predictions", predictionId, prediction);
    const libraryArchive = await archiveRunToLibrary({ ...completed, libraryArchive: undefined });
    await put("runs", run.id, { ...completed, libraryArchive });
  } catch (error) {
    const latest = await get<any>("runs", run.id) ?? run;
    const failedRun = {
      ...latest, status: "failed", error: String(error),
      updatedAt: new Date().toISOString(),
      libraryArchive: { status: "archive_attempted_after_failure" }
    };
    await put("runs", run.id, failedRun);
    try {
      const libraryArchive = await archiveRunToLibrary(failedRun);
      await put("runs", run.id, { ...failedRun, libraryArchive });
    } catch (archiveError) {
      await put("library/archive-failures", run.id, {
        id: run.id, runId: run.id, error: String(archiveError),
        originalError: String(error), recordedAt: new Date().toISOString()
      });
    }
  }
  return new Response(null, { status: 202 });
};
export const config: Config = { background: true };

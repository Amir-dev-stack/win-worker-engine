import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";
import { runDebate, runGlobalMaster, runIndependentWorkers } from "../lib/ai.mts";

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
      priorLearning: { priorPredictions, priorResults }
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
      workerNetwork: networkAfterDebate, updatedAt: new Date().toISOString()
    };
    await put("runs", run.id, withDebate);

    const failed = [...reports, ...debate].filter(x => x.status !== "completed" || !x.report?.trim());
    const master = failed.length
      ? {
          workerId: crypto.randomUUID(),
          role: "WIN Global Master — deterministic Low-Risk Gate",
          phase: "final", status: "completed",
          report: "FINAL DECISION: NO BET\n\nThe WIN Low-Risk Gate rejected this run because one or more required department or adversarial reports failed or returned an empty report. Failed checks: " +
            failed.map(x => (x.departmentId ? x.departmentId + " — " : "") + x.role + ": " + (x.error || "empty report")).join("; ") +
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
    await put("predictions", predictionId, {
      id: predictionId, runId: run.id, recordedAt: new Date().toISOString(),
      frozen: true, brief, decision: completed.decision,
      workerResponseIds: [...reports, ...debate, master].map(x => x.responseId).filter(Boolean),
      workerNetworkSummary: networkAfterDebate.executionSummary
    });
  } catch (error) {
    await put("runs", run.id, {
      ...run, status: "failed", error: String(error),
      updatedAt: new Date().toISOString()
    });
  }
  return new Response(null, { status: 202 });
};
export const config: Config = { background: true };

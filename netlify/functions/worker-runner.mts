import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";
import { runDebate, runGlobalMaster, runIndependentWorkers } from "../lib/ai.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";
import { importTipsterCoupon } from "../lib/source-intelligence.mts";

function extractJsonBlock(report: string, tag: string): any | null {
  const open = "<" + tag + ">";
  const close = "</" + tag + ">";
  const start = report.indexOf(open);
  const end = report.indexOf(close);
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(report.slice(start + open.length, end).trim()); }
  catch { return null; }
}


async function archiveHumanCouponResearch(reports: any[]) {
  const d5 = reports.find(x => x.departmentId === "D5");
  const parsed = d5 ? extractJsonBlock(d5.report || "", "WIN_HUMAN_COUPONS_JSON") : null;
  const coupons = Array.isArray(parsed?.coupons) ? parsed.coupons.slice(0, 100) : [];
  const imports: any[] = [];
  const allowed = new Set(["betbuddyrank", "olbg", "supersocial", "tipsto", "1x2-social", "betslip-social", "reddit", "x-public", "youtube-public", "sts-strefa-inspiracji", "tippium", "blogabet", "tipstrr", "oddra"]);
  for (const item of coupons) {
    const sourceId = typeof item?.sourceId === "string" ? item.sourceId.trim().toLowerCase() : "";
    if (!allowed.has(sourceId)) { imports.push({ status: "skipped", reason: "unregistered_source" }); continue; }
    const sourceUrl = typeof item?.sourceUrl === "string" ? item.sourceUrl : "";
    const couponText = typeof item?.couponText === "string" ? item.couponText : "";
    if (!/^https:\/\//i.test(sourceUrl) || couponText.trim().length < 3) {
      imports.push({ status: "skipped", reason: "missing_public_source_url_or_coupon_text" }); continue;
    }
    try {
      const record = await importTipsterCoupon({
        sourceId, sourceUrl, couponText,
        tipsterName: item?.tipsterName || "",
        publishedAt: item?.publishedAt || "",
        sport: item?.sport || "",
        combinedOdds: item?.combinedOdds,
        selections: Array.isArray(item?.selections) ? item.selections : [],
        label: item?.couponType ? "Public human " + item.couponType : "Public human coupon",
        bookmaker: item?.bookmaker || "Source odds (unverified bookmaker attribution)",
        sourceSnapshot: JSON.stringify({
          retrievedAt: item?.retrievedAt || new Date().toISOString(),
          contentClass: item?.contentClass || "unclassified",
          couponType: item?.couponType || "unknown",
          settlementStatus: item?.settlementStatus || "pending",
          evidenceRefs: Array.isArray(item?.evidenceRefs) ? item.evidenceRefs : [],
          limitations: Array.isArray(item?.limitations) ? item.limitations : []
        }),
        importMethod: "public_page_manual_capture",
        authorizedToStore: true
      });
      imports.push({ status: record.duplicate ? "duplicate" : "imported", id: record.id, sourceId });
    } catch (error) {
      imports.push({ status: "rejected", sourceId, reason: String(error) });
    }
  }
  return { discovered: coupons.length, imported: imports.filter(x => x.status === "imported").length,
    duplicates: imports.filter(x => x.status === "duplicate").length,
    skipped: imports.filter(x => x.status === "skipped").length,
    rejected: imports.filter(x => x.status === "rejected").length, records: imports };
}

function collectCouponCandidates(reports: any[]) {
  const source = reports.find(x => x.departmentId === "D6");
  const parsed = source ? extractJsonBlock(source.report || "", "WIN_COUPONS_JSON") : null;
  const coupons = Array.isArray(parsed?.coupons) ? parsed.coupons : [];
  return coupons.map((coupon: any) => {
    const legs = Array.isArray(coupon?.legs) ? coupon.legs : [];
    const legChecks = legs.map((leg: any) => ({
      event: typeof leg?.event === "string" ? leg.event : "Unspecified event",
      market: typeof leg?.market === "string" ? leg.market : "Unspecified market",
      selection: typeof leg?.selection === "string" ? leg.selection : "Unspecified selection",
      odds: typeof leg?.odds === "number" && Number.isFinite(leg.odds) && leg.odds > 1 ? leg.odds : null,
      sourceUrl: typeof leg?.sourceUrl === "string" && /^https?:\\/\\//i.test(leg.sourceUrl) ? leg.sourceUrl : null,
      observedAt: typeof leg?.observedAt === "string" ? leg.observedAt : null,
      settlementRule: typeof leg?.settlementRule === "string" ? leg.settlementRule : null,
      blockers: Array.isArray(leg?.blockers) ? leg.blockers : []
    }));
    const missing = legChecks.flatMap((leg: any, i: number) => {
      const absent = [];
      if (!leg.event || leg.event === "Unspecified event") absent.push("event identity");
      if (!leg.market || leg.market === "Unspecified market") absent.push("exact market");
      if (!leg.selection || leg.selection === "Unspecified selection") absent.push("selection");
      if (leg.odds === null) absent.push("verified decimal odds");
      if (!leg.sourceUrl) absent.push("source URL");
      if (!leg.observedAt) absent.push("price observation timestamp");
      if (!leg.settlementRule) absent.push("settlement rule");
      if (leg.blockers.length) absent.push(...leg.blockers);
      return absent.map((item: string) => "Leg " + (i + 1) + ": " + item);
    });
    const blockers = [...(Array.isArray(coupon?.blockers) ? coupon.blockers : []), ...missing];
    const status = coupon?.status === "QUALIFIED" && legs.length > 0 && blockers.length === 0 ? "QUALIFIED" : "BLOCKED";
    const combined = legChecks.length && legChecks.every((x: any) => x.odds !== null)
      ? Number(legChecks.reduce((n: number, x: any) => n * x.odds, 1).toFixed(4)) : null;
    return {
      id: typeof coupon?.id === "string" ? coupon.id : crypto.randomUUID(),
      label: typeof coupon?.label === "string" ? coupon.label : "WIN coupon candidate",
      status, legs: legChecks,
      combinedOdds: status === "QUALIFIED" ? (typeof coupon?.combinedOdds === "number" ? coupon.combinedOdds : combined) : null,
      riskFactors: Array.isArray(coupon?.riskFactors) ? coupon.riskFactors : [],
      correlationNotes: Array.isArray(coupon?.correlationNotes) ? coupon.correlationNotes : [],
      blockers
    };
  });
}

function hasLibraryReviewReceipt(report: string, expectedLibraryReview: any): boolean {
  const open = "<WIN_LIBRARY_REVIEW_JSON>";
  const close = "</WIN_LIBRARY_REVIEW_JSON>";
  const start = report.indexOf(open);
  const end = report.indexOf(close);
  if (start < 0 || end <= start) return false;

  try {
    const receipt = JSON.parse(report.slice(start + open.length, end).trim());
    const ids = (items: any[]) => items.map((item) => item?.id).filter((id) => typeof id === "string");
    const includesAll = (actual: unknown, expected: string[]) =>
      Array.isArray(actual) && actual.every((id) => typeof id === "string") &&
      expected.every((id) => actual.includes(id));

    return receipt?.reviewed === true &&
      Array.isArray(receipt.winningRecordIds) &&
      Array.isArray(receipt.losingRecordIds) &&
      Array.isArray(receipt.validatedLessonIds) &&
      Array.isArray(receipt.emptyCollections) &&
      Array.isArray(receipt.keyLearning) &&
      includesAll(receipt.winningRecordIds, ids(expectedLibraryReview?.winningCoupons ?? [])) &&
      includesAll(receipt.losingRecordIds, ids(expectedLibraryReview?.losingCoupons ?? [])) &&
      includesAll(receipt.validatedLessonIds, ids(expectedLibraryReview?.validatedLessons ?? []));
  } catch {
    return false;
  }
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

    // D1 scouts first. The result creates the dynamic sport/country/competition/club/player/event graph.
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

    // Calculate the receipt gate BEFORE building objects that use it. Keep the same
    // gated network in the intermediate and final run so the gate cannot be lost.
    const missingLibraryReceipts = [
      ...reports.filter(x => !hasLibraryReviewReceipt(x.report || "", libraryReview))
        .map(x => (x.departmentId || x.role) + " mandatory library review receipt missing, incomplete or invalid"),
      ...debate.filter(x => !hasLibraryReviewReceipt(x.report || "", libraryReview))
        .map(x => (x.role || "adversarial reviewer") + " mandatory library review receipt missing, incomplete or invalid")
    ];

    const gatedWorkerNetwork = {
      ...networkAfterDebate,
      libraryReviewGate: {
        status: missingLibraryReceipts.length ? "failed" : "passed",
        failures: missingLibraryReceipts,
        reviewedAt: libraryReview.reviewedAt,
        matchedWinningCoupons: libraryReview.counts?.winningCouponsMatched ?? 0,
        matchedLosingCoupons: libraryReview.counts?.losingCouponsMatched ?? 0,
        matchedValidatedLessons: libraryReview.counts?.validatedLessonsMatched ?? 0
      }
    };

    const withDebate = {
      ...withDepartments, status: "synthesizing", debate,
      workerNetwork: gatedWorkerNetwork,
      updatedAt: new Date().toISOString()
    };
    await put("runs", run.id, withDebate);

    const failed = [...reports, ...debate].filter(x => x.status !== "completed" || !x.report?.trim());
    const gateFailures = [...failed.map(x => (x.departmentId ? x.departmentId + " — " : "") + x.role + ": " + (x.error || "empty report")), ...missingLibraryReceipts];
    const coupons = collectCouponCandidates(reports);
    const master = failed.length || missingLibraryReceipts.length
      ? {
          workerId: crypto.randomUUID(),
          role: "WIN Global Master — risk assessment unavailable",
          phase: "final", status: "completed",
          report: "Risk percentage unavailable because required research or library-review checks did not complete. The following blockers remain: " + gateFailures.join("; "),
          citations: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
        }
      : await runGlobalMaster(brief, reports, debate, gatedWorkerNetwork);

    const masterReceiptValid = hasLibraryReviewReceipt(master.report || "", libraryReview);
    if (!masterReceiptValid) {
      missingLibraryReceipts.push("Global Master mandatory library review receipt missing, incomplete or invalid");
      gatedWorkerNetwork.libraryReviewGate = {
        ...gatedWorkerNetwork.libraryReviewGate,
        status: "failed",
        failures: missingLibraryReceipts
      };
    }
    const masterValid = master.status === "completed" && Boolean(master.report?.trim()) &&
      missingLibraryReceipts.length === 0;
    const riskAssessment = masterValid ? extractJsonBlock(master.report || "", "WIN_RISK_ASSESSMENT_JSON") : null;
    const completed = {
      ...withDebate,
      status: "completed",
      coupons,
      master: masterValid ? master : {
        workerId: crypto.randomUUID(), role: "WIN Global Master — risk assessment unavailable",
        phase: "final", status: "failed",
        report: "Risk percentage unavailable because the Global Master risk assessment or required library receipt was incomplete.",
        citations: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
      },
      riskAssessment: riskAssessment && typeof riskAssessment.overallRiskPercent === "number"
        ? riskAssessment : null,
      decision: undefined,
      workerNetwork: gatedWorkerNetwork,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    await put("runs", run.id, completed);

    const predictionId = crypto.randomUUID();
    const prediction = {
      id: predictionId, runId: run.id, recordedAt: new Date().toISOString(),
      frozen: true, brief, coupons: completed.coupons, riskAssessment: completed.riskAssessment,
      workerResponseIds: [...reports, ...debate, master].map(x => x.responseId).filter(Boolean),
      workerNetworkSummary: gatedWorkerNetwork.executionSummary,
      libraryReviewGate: gatedWorkerNetwork.libraryReviewGate
    };
    await put("predictions", predictionId, prediction);
    await put("library/frozen-predictions", predictionId, prediction);
    const humanCouponArchive = await archiveHumanCouponResearch(reports);
    const completedWithHumanResearch = { ...completed, humanCouponArchive };
    const libraryArchive = await archiveRunToLibrary({ ...completedWithHumanResearch, libraryArchive: undefined });
    await put("runs", run.id, { ...completedWithHumanResearch, libraryArchive });
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

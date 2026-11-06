import type { Config } from "@netlify/functions";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { authorized } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";
import { runDebate, runGlobalMaster, runIndependentWorkers } from "../lib/ai.mts";
import { WIN_DEPARTMENTS } from "../lib/worker-org.mts";
import { getMandatoryLearningPack, archiveRunToLibrary } from "../lib/library.mts";
import { importTipsterCoupon } from "../lib/source-intelligence.mts";
import { getModelLabResearchPack } from "../lib/model-lab.mts";
import { getAIbudgetStatus } from "../lib/ai-budget.mts";
import { evaluateCouponCorrelation } from "../lib/coupon-correlation-gate.mts";


const REQUIRED_DEBATE_ROLES = [
  "Independent FOR-side challenger / Small Chef A review",
  "Independent AGAINST-side challenger / Small Chef B review",
  "Markets, price and settlement red-team auditor",
  "Quantitative evidence and correlation challenger"
];

async function enqueuePersistentAgentTasks(workerNetwork: any, runId: string) {
  const nodes = (workerNetwork?.nodes || []).filter((node: any) =>
    node.executionMode === "queued_independent_api_request" && ["T1","T2","T3","T4","T5","T6"].includes(node.tier)
  ).slice(0, 100);
  const queued = await list<any>("library/agent-task-queue", 1000);
  const now = new Date();
  const cooldownDays: Record<string, number> = { T1: 30, T2: 21, T3: 14, T4: 7, T5: 3, T6: 1 };
  let created = 0, alreadyActive = 0, freshProfile = 0;
  for (const node of nodes) {
    const active = queued.some(task => task.agentId === node.id && ["queued","running"].includes(task.status));
    if (active) { alreadyActive++; continue; }
    const profile = await get<any>("library/persistent-agent-profiles", node.id);
    const updated = Date.parse(profile?.updatedAt || "");
    const cooldown = (cooldownDays[node.tier] || 7) * 24 * 60 * 60 * 1000;
    if (Number.isFinite(updated) && now.getTime() - updated < cooldown) { freshProfile++; continue; }
    const taskId = runId + ":" + node.id;
    await put("library/agent-task-queue", taskId, {
      id: taskId, agentId: node.id, name: node.name, tier: node.tier,
      department: node.assignedDepartment || null, scope: node.scope || {},
      sourceRunId: runId, status: "queued", attempts: 0,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
      validationStatus: "research_only_unvalidated"
    });
    created++;
  }
  return { eligibleNodes: nodes.length, queued: created, alreadyActive, freshProfile, executionMode: "one_budget_gated_entity_agent_per_learning_cycle" };
}

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
    const contentClass = typeof item?.contentClass === "string"
      ? item.contentClass.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() : "";
    if (!["original human coupon", "single human pick"].includes(contentClass)) {
      imports.push({ status: "skipped", reason: "missing_or_ineligible_content_class", sourceId, contentClass: contentClass || null }); continue;
    }
    if (!/^https:\/\//i.test(sourceUrl) || couponText.trim().length < 3) {
      imports.push({ status: "skipped", reason: "missing_public_source_url_or_coupon_text" }); continue;
    }
    try {
      const record = await importTipsterCoupon({
        sourceId, sourceUrl, couponText, contentClass,
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

export function collectCouponCandidates(reports: any[]) {
  const source = reports.find(x => x.departmentId === "D6");
  const parsed = source ? extractJsonBlock(source.report || "", "WIN_COUPONS_JSON") : null;
  const coupons = Array.isArray(parsed?.coupons) ? parsed.coupons : [];
  return coupons.map((coupon: any) => {
    const legs = Array.isArray(coupon?.legs) ? coupon.legs : [];
    const legChecks = legs.map((leg: any) => {
      const suppliedStart = typeof leg?.startTime === "string" ? leg.startTime.trim()
        : typeof leg?.eventStart === "string" ? leg.eventStart.trim()
        : typeof leg?.kickoff === "string" ? leg.kickoff.trim() : "";
      const exactKickoff = suppliedStart && Number.isFinite(Date.parse(suppliedStart)) &&
        /(?:Z|[+-]\d{2}:\d{2})$/i.test(suppliedStart) ? suppliedStart : null;
      return {
        event: typeof leg?.event === "string" ? leg.event : "Unspecified event",
        market: typeof leg?.market === "string" ? leg.market : "Unspecified market",
        selection: typeof leg?.selection === "string" ? leg.selection : "Unspecified selection",
        odds: typeof leg?.odds === "number" && Number.isFinite(leg.odds) && leg.odds > 1 ? leg.odds : null,
        sourceUrl: typeof leg?.sourceUrl === "string" && (leg.sourceUrl.startsWith("https://") || leg.sourceUrl.startsWith("http://")) ? leg.sourceUrl : null,
        observedAt: typeof leg?.observedAt === "string" ? leg.observedAt : null,
        startTime: exactKickoff,
        eventStart: exactKickoff,
        eventId: typeof leg?.eventId === "string" ? leg.eventId.trim().slice(0, 180) : null,
        homeTeam: typeof leg?.homeTeam === "string" ? leg.homeTeam.trim().slice(0, 160) : null,
        awayTeam: typeof leg?.awayTeam === "string" ? leg.awayTeam.trim().slice(0, 160) : null,
        leagueShortcut: typeof leg?.leagueShortcut === "string" ? leg.leagueShortcut.trim().slice(0, 40) : null,
        leagueSeason: Number.isInteger(leg?.leagueSeason) ? leg.leagueSeason : null,
        settlementRule: typeof leg?.settlementRule === "string" ? leg.settlementRule : null,
        blockers: Array.isArray(leg?.blockers) ? leg.blockers : []
      };
    });
    const missing = legChecks.flatMap((leg: any, i: number) => {
      const absent = [];
      if (!leg.event || leg.event === "Unspecified event") absent.push("event identity");
      if (!leg.market || leg.market === "Unspecified market") absent.push("exact market");
      if (!leg.selection || leg.selection === "Unspecified selection") absent.push("selection");
      if (leg.odds === null) absent.push("verified decimal odds");
      if (!leg.sourceUrl) absent.push("source URL");
      if (!leg.observedAt || !Number.isFinite(Date.parse(leg.observedAt))) absent.push("valid price observation timestamp");
      if (!leg.settlementRule) absent.push("settlement rule");
      if (!leg.startTime) absent.push("exact kickoff timestamp with timezone");
      if (leg.blockers.length) absent.push(...leg.blockers);
      return absent.map((item: string) => "Leg " + (i + 1) + ": " + item);
    });
    const correlationAssessment = evaluateCouponCorrelation(legChecks);
    const blockers = [...(Array.isArray(coupon?.blockers) ? coupon.blockers : []), ...missing];
    const allOddsAvailable = legChecks.length > 0 && legChecks.every((x: any) => x.odds !== null);
    const eventIds = legChecks.map((x: any) => x.eventId).filter((x: any) => typeof x === "string" && x.length > 0);
    const distinctEvents = eventIds.length === legChecks.length && new Set(eventIds).size === legChecks.length;
    const theoreticalOddsProduct = legChecks.length > 1 && allOddsAvailable && distinctEvents
      ? Number(legChecks.reduce((n: number, x: any) => n * x.odds, 1).toFixed(4)) : null;
    const singleLeg = legChecks.length === 1;
    const status = legs.length === 0 ? "BLOCKED"
      : singleLeg && coupon?.status === "QUALIFIED" && blockers.length === 0 && correlationAssessment.approved
        ? "QUALIFIED" : "DRAFTABLE";
    return {
      id: typeof coupon?.id === "string" ? coupon.id : crypto.randomUUID(),
      label: typeof coupon?.label === "string" ? coupon.label : "WIN coupon candidate",
      status, legs: legChecks,
      couponDraftAllowed: legs.length > 0,
      dataQualityStatus: blockers.length === 0 ? "complete" : "incomplete",
      combinedOdds: singleLeg && status === "QUALIFIED"
        ? (typeof coupon?.combinedOdds === "number" ? coupon.combinedOdds : legChecks[0].odds) : null,
      theoreticalOddsProduct,
      theoreticalOddsProductWarning: theoreticalOddsProduct === null ? null
        : "Mathematical product of individual decimal prices only; not a bookmaker-quoted accumulator price or a joint win probability.",
      jointProbabilityAvailable: singleLeg && correlationAssessment.approved,
      probabilityStatus: singleLeg && correlationAssessment.approved
        ? "single_leg_marginal" : "marginal_only_joint_unavailable",
      riskFactors: Array.isArray(coupon?.riskFactors) ? coupon.riskFactors : [],
      correlationNotes: Array.isArray(coupon?.correlationNotes) ? coupon.correlationNotes : [],
      correlationAssessment,
      probabilityWarnings: correlationAssessment.warnings,
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
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (Netlify.env.get("WIN_AI_BUDGET_APPROVED") !== "true") {
    return Response.json({ error: "WIN research execution is disabled; worker run blocked before research." }, { status: 423 });
  }
  const budgetStatus = await getAIbudgetStatus();
  if (budgetStatus.spendingLocked) {
    return Response.json({ error: "WIN's persistent spending lock is active; worker run blocked before research." }, { status: 423 });
  }
  const parsedRequest = await readBoundedJsonObject(req, 16 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId || runId.length > 180) {
    return Response.json({ error: "valid_run_id_required" }, { status: 400 });
  }
  const run = await get<any>("runs", runId);
  if (!run || run.id !== runId) return new Response("Run not found", { status: 404 });
  if (run.status === "completed") {
    return Response.json({ error: "run_already_completed" }, { status: 409 });
  }
  const lease = await claimWinScheduledRunLease(run.id);
  if (!lease.claimed) {
    return Response.json({
      error: lease.reason === "already_running" ? "run_already_in_progress" : "run_execution_lease_unavailable",
      reason: lease.reason
    }, { status: 409 });
  }

  const startedAt = new Date().toISOString();
  try {
    await put("runs", run.id, { ...run, status: "scouting", startedAt, updatedAt: startedAt });
    const libraryReview = await getMandatoryLearningPack(run.brief);
    const modelLabResearchPack = await getModelLabResearchPack(run.brief);
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
      libraryReview,
      modelLabResearchPack
    };

    // D1 scouts first. The result creates the dynamic sport/country/competition/club/player/event graph.
    const firstPass = await runIndependentWorkers(brief, run.id);
    const { reports, workerNetwork } = firstPass;
    const agentQueue = await enqueuePersistentAgentTasks(workerNetwork, run.id);
    const networkWithQueue = { ...workerNetwork, agentQueue };
    const withDepartments = {
      ...run, brief, status: "debating", workers: reports,
      workerNetwork: updateNetworkStatuses(networkWithQueue, reports, []),
      updatedAt: new Date().toISOString()
    };
    await put("runs", run.id, withDepartments);

    const debate = await runDebate(brief, reports);
    const networkAfterDebate = updateNetworkStatuses(networkWithQueue, reports, debate);
    const departmentReportsComplete = reports.length === WIN_DEPARTMENTS.length &&
      WIN_DEPARTMENTS.every(department =>
        reports.filter(report => report.departmentId === department.id &&
          report.status === "completed" && Boolean(report.report?.trim())).length === 1
      );
    const debateReportsComplete = debate.length === REQUIRED_DEBATE_ROLES.length &&
      REQUIRED_DEBATE_ROLES.every(role =>
        debate.filter(report => report.role === role &&
          report.status === "completed" && Boolean(report.report?.trim())).length === 1
      );

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
    const gateFailures = [...failed.map(x => (x.departmentId ? x.departmentId + " — " : "") + x.role + ": " + (x.error || "empty report")), ...(!departmentReportsComplete ? ["Expected exactly one completed report for every registered department."] : []), ...(!debateReportsComplete ? ["Expected exactly one completed report from each required adversarial reviewer."] : []), ...missingLibraryReceipts];
    const coupons = collectCouponCandidates(reports);
    const master = !departmentReportsComplete || !debateReportsComplete || failed.length || missingLibraryReceipts.length
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
    const masterExecutionValid = departmentReportsComplete && debateReportsComplete &&
      master.status === "completed" && Boolean(master.report?.trim()) &&
      missingLibraryReceipts.length === 0;
    const riskAssessment = masterExecutionValid
      ? extractJsonBlock(master.report || "", "WIN_RISK_ASSESSMENT_JSON") : null;
    const riskAssessmentValid = Boolean(
      riskAssessment &&
      Number.isFinite(riskAssessment.overallRiskPercent) &&
      riskAssessment.overallRiskPercent >= 0 &&
      riskAssessment.overallRiskPercent <= 100 &&
      riskAssessment.riskScale === "heuristic_0_to_100_higher_is_riskier" &&
      riskAssessment.isCalibratedLossProbability === false &&
      Array.isArray(riskAssessment.components) &&
      Array.isArray(riskAssessment.topRiskDrivers) &&
      Array.isArray(riskAssessment.uncertainties) &&
      Array.isArray(riskAssessment.couponRisks)
    );
    const freezeEligible = departmentReportsComplete && debateReportsComplete && masterExecutionValid && riskAssessmentValid;

    gatedWorkerNetwork.riskAssessmentGate = {
      status: freezeEligible ? "passed" : "failed",
      failures: freezeEligible ? [] : [
        ...(!departmentReportsComplete ? ["The full registered department report set is incomplete or contains duplicates."] : []),
        ...(!debateReportsComplete ? ["The four required adversarial reviewer reports are incomplete or duplicated."] : []),
        ...(!masterExecutionValid ? ["Required department/challenge reports, Global Master response or library review failed."] : []),
        ...(!riskAssessmentValid ? ["Global Master risk-assessment JSON is missing or invalid."] : [])
      ]
    };

    const completed = {
      ...withDebate,
      status: freezeEligible ? "completed" : "failed",
      coupons,
      master: masterExecutionValid ? master : {
        workerId: crypto.randomUUID(), role: "WIN Global Master — risk assessment unavailable",
        phase: "final", status: "failed",
        report: "Risk assessment unavailable because required research, challenge or library-review checks did not complete.",
        citations: [], startedAt: new Date().toISOString(), completedAt: new Date().toISOString()
      },
      riskAssessment: riskAssessmentValid ? riskAssessment : null,
      decision: undefined,
      workerNetwork: gatedWorkerNetwork,
      ...(!freezeEligible ? {
        error: "No frozen forecast created: the complete research, challenge, library-review and Global Master risk-assessment gates did not all pass."
      } : {}),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    await put("runs", run.id, completed);

    // A frozen prediction is a completed evidence record, not a placeholder.
    // Failed or incomplete investigations remain archived as runs only.
    if (freezeEligible) {
      const predictionId = crypto.randomUUID();
      const prediction = {
        id: predictionId, runId: run.id, recordedAt: new Date().toISOString(),
        frozen: true, brief, coupons: completed.coupons, riskAssessment: completed.riskAssessment,
        workerResponseIds: [...reports, ...debate, master].map(x => x.responseId).filter(Boolean),
        workerNetworkSummary: gatedWorkerNetwork.executionSummary,
        libraryReviewGate: gatedWorkerNetwork.libraryReviewGate,
        riskAssessmentGate: gatedWorkerNetwork.riskAssessmentGate
      };
      await put("predictions", predictionId, prediction);
      await put("library/frozen-predictions", predictionId, prediction);
    }

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
  } finally {
    // Only this invocation can release its own lease; stale workers cannot release a newer claim.
    await releaseWinScheduledRunLease(run.id, lease.leaseId).catch(() => false);
  }
  return new Response(null, { status: 202 });
};
export const config: Config = { background: true };

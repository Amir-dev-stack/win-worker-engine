import { get, list, put, remove } from "./store.mts";

export type LibraryOutcome = "pending" | "won" | "lost" | "void" | "partial" | "cancelled" | "unknown";
export type EntityKind = "sport" | "country" | "league" | "club" | "player" | "event";

const OUTCOMES = new Set<LibraryOutcome>(["pending", "won", "lost", "void", "partial", "cancelled", "unknown"]);
const ENTITY_KINDS = new Set<EntityKind>(["sport", "country", "league", "club", "player", "event"]);
const MAX_TEXT = 30000;

function clean(value: unknown, max = 3000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "unknown";
}
function safeArray(value: unknown, max = 100): any[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}
function searchText(value: unknown): string {
  try { return JSON.stringify(value).toLowerCase(); } catch { return ""; }
}
function relevant<T>(items: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length > 2);
  if (!terms.length) return items;
  return items.map((item: any) => ({
    item,
    score: terms.reduce((sum, term) => sum + (searchText(item).includes(term) ? 1 : 0), 0)
  })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.item as T);
}

export async function searchWinLibrary(options: {
  category?: string; query?: string; outcome?: string; sport?: string; entityType?: string; limit?: number;
} = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const category = clean(options.category || "all", 40).toLowerCase();
  const [coupons, winning, losing, pending, lessons, entities, profiles, observations, runs] = await Promise.all([
    list<any>("library/coupons", 500),
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/pending-coupons", 500),
    list<any>("library/lessons", 500),
    list<any>("library/entity-profiles", 500),
    list<any>("library/agent-profiles", 500),
    list<any>("library/agent-observations", 500),
    list<any>("library/research-runs", 200)
  ]);
  const byId = new Map<string, any>();
  for (const record of coupons) if (record?.id) byId.set(record.id, record);
  const q = clean(options.query, 1000);
  let items: any[] = [];
  if (category === "winning") items = winning;
  else if (category === "losing") items = losing;
  else if (category === "pending") items = pending;
  else if (category === "coupons") items = coupons;
  else if (category === "lessons") items = lessons;
  else if (category === "entities") items = entities;
  else if (category === "agents") items = profiles;
  else if (category === "observations") items = observations;
  else if (category === "runs") items = runs;
  else items = [...coupons, ...lessons, ...entities, ...profiles, ...observations, ...runs];

  let filtered = relevant(items, q);
  if (options.outcome) filtered = filtered.filter((x: any) => x.outcome === options.outcome);
  if (options.sport) filtered = filtered.filter((x: any) => !x.sport || x.sport.toLowerCase() === options.sport!.toLowerCase());
  if (options.entityType) filtered = filtered.filter((x: any) => x.entityType === options.entityType || x.scope?.entityType === options.entityType);
  return {
    category, query: q || null, count: filtered.length, items: filtered.slice(0, limit),
    reviewedAt: new Date().toISOString(),
    libraryAreas: ["winning-coupons", "losing-coupons", "pending-coupons", "lessons", "entity-profiles", "agent-profiles", "agent-observations", "research-runs"]
  };
}

export async function getMandatoryLearningPack(brief: any) {
  const query = [
    brief?.event, brief?.sport, brief?.country, brief?.competition, brief?.context,
    brief?.existingCoupon, ...(Array.isArray(brief?.teams) ? brief.teams : []),
    ...(Array.isArray(brief?.clubs) ? brief.clubs : []), ...(Array.isArray(brief?.players) ? brief.players : [])
  ].filter(Boolean).join(" ");
  const [winning, losing, lessons, profiles] = await Promise.all([
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/lessons", 500),
    list<any>("library/entity-profiles", 500)
  ]);
  const winners = relevant(winning, query).slice(0, 12);
  const losers = relevant(losing, query).slice(0, 12);
  const validatedLessons = relevant(lessons.filter(x => x.validationStatus === "validated"), query).slice(0, 12);
  const candidateLessons = relevant(lessons.filter(x => x.validationStatus !== "validated"), query).slice(0, 5);
  const entityProfiles = relevant(profiles, query).slice(0, 12);
  return {
    mandatory: true,
    readBeforeCouponConstruction: true,
    reviewedAt: new Date().toISOString(),
    query,
    reviewStatus: "COMPLETED",
    areasReviewed: ["winning-coupons", "losing-coupons", "validated-lessons", "candidate-lessons", "entity-profiles"],
    counts: {
      winningCouponsAvailable: winning.length, winningCouponsMatched: winners.length,
      losingCouponsAvailable: losing.length, losingCouponsMatched: losers.length,
      validatedLessonsAvailable: lessons.filter(x => x.validationStatus === "validated").length,
      validatedLessonsMatched: validatedLessons.length,
      candidateLessonsMatched: candidateLessons.length, entityProfilesMatched: entityProfiles.length
    },
    winningCoupons: winners,
    losingCoupons: losers,
    validatedLessons,
    candidateLessons,
    entityProfiles,
    instruction: "Every coupon-writing agent must read both winning and losing examples, study relevant profiles and lessons, and include a WIN_LIBRARY_REVIEW_JSON receipt in its report. Empty libraries must be acknowledged honestly; do not invent examples."
  };
}

export async function saveCouponRecord(input: any) {
  const couponText = clean(input?.couponText || input?.text, MAX_TEXT);
  if (couponText.length < 3) throw new Error("couponText must contain at least 3 characters");
  const outcome = (clean(input?.outcome || "pending", 20).toLowerCase() as LibraryOutcome);
  if (!OUTCOMES.has(outcome)) throw new Error("outcome must be pending, won, lost, void, partial, cancelled or unknown");
  const id = clean(input?.id, 100) || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const record = {
    id, recordType: "coupon", origin: input?.origin === "win" ? "win" : "human",
    label: clean(input?.label, 250) || "Imported coupon",
    couponText, selections: safeArray(input?.selections, 100),
    sport: clean(input?.sport, 100) || null, country: clean(input?.country, 100) || null,
    competition: clean(input?.competition, 200) || null,
    combinedOdds: input?.combinedOdds ?? null,
    bookmaker: clean(input?.bookmaker, 100) || "STS (user supplied)",
    outcome, settlementSource: clean(input?.settlementSource, 1000) || null,
    settlementEvidence: safeArray(input?.settlementEvidence, 30),
    source: clean(input?.source, 1000) || "User-provided",
    notes: clean(input?.notes, 5000) || null,
    tags: safeArray(input?.tags, 50),
    createdAt, updatedAt: createdAt,
    runId: clean(input?.runId, 100) || null,
    learningStatus: outcome === "pending" ? "awaiting_settlement" : "available_for_review"
  };
  await put("library/coupons", id, record);
  if (outcome === "won") await put("library/winning-coupons", id, record);
  else if (outcome === "lost") await put("library/losing-coupons", id, record);
  else await put("library/pending-coupons", id, record);
  const historyId = crypto.randomUUID();
  await put("library/coupon-history", historyId, {
    id: historyId, couponId: id, action: "created", outcome,
    at: createdAt, source: record.origin
  });
  return record;
}

export async function settleCouponRecord(input: any) {
  const id = clean(input?.couponId, 100);
  if (!id) throw new Error("couponId is required");
  const current = await get<any>("library/coupons", id);
  if (!current) throw new Error("Coupon not found");
  const outcome = clean(input?.outcome, 20).toLowerCase() as LibraryOutcome;
  if (!OUTCOMES.has(outcome) || outcome === "pending" || outcome === "unknown") {
    throw new Error("settlement outcome must be won, lost, void, partial or cancelled");
  }
  const settlementSource = clean(input?.settlementSource, 1000);
  if (!settlementSource) throw new Error("settlementSource is required");
  const updated = {
    ...current, outcome, settlementSource,
    settlementEvidence: safeArray(input?.evidence, 30),
    settledAt: clean(input?.settledAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    learningStatus: "available_for_review"
  };
  await put("library/coupons", id, updated);
  await remove("library/winning-coupons", id);
  await remove("library/losing-coupons", id);
  await remove("library/pending-coupons", id);
  if (outcome === "won") await put("library/winning-coupons", id, updated);
  else if (outcome === "lost") await put("library/losing-coupons", id, updated);
  else await put("library/pending-coupons", id, updated);
  const historyId = crypto.randomUUID();
  await put("library/coupon-history", historyId, {
    id: historyId, couponId: id, action: "settled", outcome,
    settlementSource, evidence: updated.settlementEvidence, at: updated.settledAt
  });
  return updated;
}

export async function saveEntityProfile(input: any) {
  const entityType = clean(input?.entityType, 30).toLowerCase() as EntityKind;
  const name = clean(input?.name, 200);
  if (!ENTITY_KINDS.has(entityType) || !name) throw new Error("entityType and name are required");
  const scope = {
    sport: clean(input?.sport, 100) || null,
    country: clean(input?.country, 100) || null,
    competition: clean(input?.competition, 200) || null,
    club: clean(input?.club, 200) || null
  };
  const id = clean(input?.id, 180) || [entityType, scope.sport, scope.country, scope.competition, name].filter(Boolean).map(slug).join(":");
  const profile = {
    id, agentId: "WIN-" + entityType.toUpperCase() + "-" + slug(id),
    entityType, name, scope,
    profile: input?.profile && typeof input.profile === "object" ? input.profile : {},
    sources: safeArray(input?.sources, 40),
    agentMission: clean(input?.agentMission, 3000) || entityMission(entityType),
    activationMode: "on_demand",
    persistentIdentity: true,
    createdAt: clean(input?.createdAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await put("library/entity-profiles", id, profile);
  return profile;
}

function entityMission(type: EntityKind): string {
  const missions: Record<EntityKind, string> = {
    sport: "Maintain the sport-specific methodology, rules, performance metrics, schedule and evidence standards.",
    country: "Maintain country-specific sporting context, governing bodies, event coverage and competition structure.",
    league: "Maintain competition format, standings, schedule, incentives, form trends and settlement context.",
    club: "Maintain team history, squad, tactics, management, results, home/away splits, roster availability and performance.",
    player: "Maintain individual match logs, minutes, goals/assists or sport-specific output, discipline, injuries, availability and performance trends.",
    event: "Maintain event identity, schedule, participants, conditions, market context and verified outcome."
  };
  return missions[type];
}

export async function saveLearningNote(input: any) {
  const note = clean(input?.note, 12000);
  if (note.length < 3) throw new Error("note must contain at least 3 characters");
  const id = crypto.randomUUID();
  const record = {
    id, recordType: "learning_note",
    title: clean(input?.title, 250) || "WIN agent learning note",
    note, agentId: clean(input?.agentId, 200) || null,
    runId: clean(input?.runId, 100) || null,
    entityType: clean(input?.entityType, 30) || null,
    entityId: clean(input?.entityId, 180) || null,
    validationStatus: input?.validationStatus === "validated" ? "validated" : "candidate_for_validation",
    evidence: safeArray(input?.evidence, 30),
    sampleSize: Number.isInteger(input?.sampleSize) ? input.sampleSize : null,
    createdAt: new Date().toISOString()
  };
  await put("library/lessons", id, record);
  return record;
}

function lessonsFromReport(report: string): any[] {
  const startTag = "<WIN_LESSONS_JSON>";
  const endTag = "</WIN_LESSONS_JSON>";
  const start = report.indexOf(startTag);
  const end = report.indexOf(endTag);
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(report.slice(start + startTag.length, end).trim());
    return safeArray(parsed?.lessons, 100);
  } catch { return []; }
}

export async function archiveRunToLibrary(run: any) {
  const savedAt = new Date().toISOString();
  const network = run?.workerNetwork;
  await put("library/research-runs", run.id, {
    id: run.id, taskType: run.brief?.taskType, event: run.brief?.event,
    status: run.status, decision: run.decision || run.master?.report || null,
    brief: run.brief, workerNetwork: network,
    workers: run.workers || [], debate: run.debate || [], master: run.master || null,
    createdAt: run.createdAt, completedAt: run.completedAt || null, savedAt
  });

  const reports = [...(run.workers || []), ...(run.debate || []), ...(run.master ? [run.master] : [])];
  for (const report of reports) {
    const noteId = crypto.randomUUID();
    await put("library/agent-notes", noteId, {
      id: noteId, runId: run.id, recordType: "agent_report",
      agentId: report.workerId, agentRole: report.role, departmentId: report.departmentId || null,
      phase: report.phase, status: report.status, report: clean(report.report, MAX_TEXT),
      citations: safeArray(report.citations, 100), createdAt: report.completedAt || savedAt
    });
  }

  const nodeType: Record<string, EntityKind> = {
    T1: "sport", T2: "country", T3: "league", T4: "club", T5: "player", T6: "event"
  };
  for (const node of network?.nodes || []) {
    const entityType = nodeType[node.tier];
    if (!entityType) continue;
    const entityId = clean(node.id, 180);
    if (!entityId) continue;
    const existingProfile = await get<any>("library/entity-profiles", entityId);
    const profile = existingProfile || await saveEntityProfile({
      entityType, id: entityId, name: node.name,
      sport: node.scope?.sport, country: node.scope?.country,
      competition: node.scope?.competition, club: node.scope?.club,
      profile: { ...node.scope, workerStatus: node.status, runId: run.id },
      agentMission: entityMission(entityType)
    });
    const departmentId = entityType === "sport" || entityType === "club" || entityType === "player" || entityType === "event" ? "D2" : "D1";
    const sourceReport = (run.workers || []).find((x: any) => x.departmentId === departmentId);
    const observationId = crypto.randomUUID();
    await put("library/agent-observations", observationId, {
      id: observationId, agentId: profile.agentId, entityId, entityType,
      runId: run.id, sourceReportId: sourceReport?.workerId || null,
      observation: clean(sourceReport?.report, 5000),
      status: sourceReport?.status === "completed" ? "case_specific_review" : "not_verified",
      observedAt: savedAt
    });
  }

  const learningReport = (run.workers || []).find((x: any) => x.departmentId === "D7");
  if (learningReport?.report) {
    await saveLearningNote({
      title: "D7 learning review — " + (run.brief?.event || run.id),
      note: learningReport.report, agentId: learningReport.workerId, runId: run.id,
      validationStatus: "candidate_for_validation",
      evidence: learningReport.citations || []
    });
    for (const lesson of lessonsFromReport(learningReport.report)) {
      if (typeof lesson?.lesson !== "string" || lesson.lesson.trim().length < 8) continue;
      await saveLearningNote({
        title: clean(lesson.title, 250) || "D7 proposed lesson",
        note: lesson.lesson, runId: run.id,
        entityType: clean(lesson.scopeType, 30), entityId: clean(lesson.scopeId, 180),
        sampleSize: Number.isInteger(lesson.sampleSize) ? lesson.sampleSize : null,
        evidence: safeArray(lesson.evidenceRecordIds, 30),
        validationStatus: "candidate_for_validation"
      });
    }
  }

  if (run.brief?.taskType === "build_latest_coupon" || run.brief?.taskType === "compare_coupons" || run.brief?.taskType === "audit_existing_coupon") {
    await put("library/coupon-research-cases", run.id, {
      id: run.id, recordType: "coupon_research_case",
      origin: "win", status: run.master?.report?.match(/FINAL DECISION:\s*([A-Z ]+)/i)?.[1]?.trim() || "reviewed",
      event: run.brief?.event, originalCoupon: run.brief?.existingCoupon || null,
      finalAnalysis: clean(run.master?.report, MAX_TEXT),
      winningExamplesRead: run.brief?.priorLearning?.counts?.winningCouponsMatched ?? 0,
      losingExamplesRead: run.brief?.priorLearning?.counts?.losingCouponsMatched ?? 0,
      createdAt: run.createdAt, savedAt
    });
  }
  return { savedAt, reportsArchived: reports.length, entityProfilesUpdated: (network?.nodes || []).filter((n: any) => Boolean(nodeType[n.tier])).length };
}

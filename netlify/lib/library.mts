import { get, list, put, remove } from "./store.mts";

export type LibraryOutcome = "pending" | "won" | "lost" | "void" | "partial" | "cancelled" | "unknown";
export type EntityKind = "sport" | "country" | "league" | "club" | "player" | "event" | "specialist";

const OUTCOMES = new Set<LibraryOutcome>(["pending", "won", "lost", "void", "partial", "cancelled", "unknown"]);
const ENTITY_KINDS = new Set<EntityKind>(["sport", "country", "league", "club", "player", "event", "specialist"]);
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

export async function ensureLegacyLibraryImport() {
  const existing = await get<any>("library/meta", "legacy-import-v1");
  if (existing?.completedAt) return existing;

  const [legacyTips, legacyRuns, legacyPredictions, legacyResults] = await Promise.all([
    list<any>("tips", 500),
    list<any>("runs", 500),
    list<any>("predictions", 500),
    list<any>("results", 500)
  ]);

  let importedTips = 0;
  let importedRuns = 0;
  let importedPredictions = 0;
  let importedResults = 0;

  for (const item of legacyTips) {
    const id = clean(item?.id, 180);
    if (!id) continue;
    await put("library/human-tips", id, item);
    importedTips++;
  }
  for (const item of legacyRuns) {
    const id = clean(item?.id, 180);
    if (!id) continue;
    await put("library/research-runs", id, {
      ...item, legacyImported: true,
      savedAt: new Date().toISOString()
    });
    importedRuns++;
  }
  for (const item of legacyPredictions) {
    const id = clean(item?.id, 180);
    if (!id) continue;
    await put("library/frozen-predictions", id, item);
    importedPredictions++;
  }
  for (const item of legacyResults) {
    const id = clean(item?.id, 180);
    if (!id) continue;
    await put("library/settled-results", id, item);
    importedResults++;
  }

  const marker = {
    id: "legacy-import-v1", status: "completed",
    importedTips, importedRuns, importedPredictions, importedResults,
    completedAt: new Date().toISOString(),
    sourceCollections: ["tips", "runs", "predictions", "results"],
    method: "non_destructive_copy"
  };
  await put("library/meta", "legacy-import-v1", marker);
  return marker;
}

export async function searchWinLibrary(options: {
  category?: string; query?: string; outcome?: string; sport?: string; entityType?: string; limit?: number;
} = {}) {
  await ensureLegacyLibraryImport();
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 30));
  const category = clean(options.category || "all", 40).toLowerCase();
  const [coupons, winning, losing, pending, lessons, entities, profiles, observations, runs,
    humanTips, agentNotes, couponHistory, couponCases, frozenPredictions, settledResults, otherSettlements, learningCycles, strategyCandidates, backtestRuns] = await Promise.all([
    list<any>("library/coupons", 500),
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/pending-coupons", 500),
    list<any>("library/lessons", 500),
    list<any>("library/entity-profiles", 500),
    list<any>("library/agent-profiles", 500),
    list<any>("library/agent-observations", 500),
    list<any>("library/research-runs", 200),
    list<any>("library/human-tips", 300),
    list<any>("library/agent-notes", 500),
    list<any>("library/coupon-history", 500),
    list<any>("library/coupon-research-cases", 200),
    list<any>("library/frozen-predictions", 500),
    list<any>("library/settled-results", 500),
    list<any>("library/other-settlements", 500),
    list<any>("library/learning-cycles", 500),
    list<any>("library/strategy-candidates", 1000),
    list<any>("library/backtest-runs", 500)
  ]);
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
  else if (category === "tips") items = humanTips;
  else if (category === "notes") items = agentNotes;
  else if (category === "coupon-history") items = couponHistory;
  else if (category === "coupon-cases") items = couponCases;
  else if (category === "predictions") items = frozenPredictions;
  else if (category === "results") items = settledResults;
  else if (category === "other-settlements") items = otherSettlements;
  else if (category === "learning-cycles") items = learningCycles;
  else if (category === "strategies") items = strategyCandidates;
  else if (category === "backtests") items = backtestRuns;
  else items = [...coupons, ...lessons, ...entities, ...profiles, ...observations, ...runs,
    ...humanTips, ...agentNotes, ...couponHistory, ...couponCases, ...frozenPredictions, ...settledResults, ...otherSettlements, ...learningCycles, ...strategyCandidates, ...backtestRuns];

  let filtered = relevant(items, clean(options.query, 1000));
  if (options.outcome) filtered = filtered.filter((x: any) => x.outcome === options.outcome);
  if (options.sport) filtered = filtered.filter((x: any) => !x.sport || x.sport.toLowerCase() === options.sport!.toLowerCase());
  if (options.entityType) filtered = filtered.filter((x: any) => x.entityType === options.entityType || x.scope?.entityType === options.entityType);
  return {
    category, query: clean(options.query, 1000) || null, count: filtered.length,
    items: filtered.slice(0, limit), reviewedAt: new Date().toISOString(),
    libraryAreas: ["winning-coupons", "losing-coupons", "pending-coupons", "coupons", "coupon-history",
      "human-tips", "lessons", "entity-profiles", "agent-profiles", "agent-observations",
      "agent-notes", "research-runs", "frozen-predictions", "settled-results", "other-settlements", "coupon-research-cases", "learning-cycles", "strategy-candidates", "backtest-runs"]
  };
}

export async function getMandatoryLearningPack(brief: any) {
  await ensureLegacyLibraryImport();
  const query = [
    brief?.event, brief?.sport, brief?.country, brief?.competition, brief?.context,
    brief?.existingCoupon, ...(Array.isArray(brief?.teams) ? brief.teams : []),
    ...(Array.isArray(brief?.clubs) ? brief.clubs : []), ...(Array.isArray(brief?.players) ? brief.players : [])
  ].filter(Boolean).join(" ");
  const [winning, losing, lessons, profiles, agentProfiles, humanTips, couponHistory, learningCycles, strategyCandidates, backtestRuns] = await Promise.all([
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/lessons", 500),
    list<any>("library/entity-profiles", 500),
    list<any>("library/agent-profiles", 500),
    list<any>("library/human-tips", 300),
    list<any>("library/coupon-history", 300),
    list<any>("library/learning-cycles", 100),
    list<any>("library/strategy-candidates", 500),
    list<any>("library/backtest-runs", 200)
  ]);
  const winners = relevant(winning, query).slice(0, 12);
  const losers = relevant(losing, query).slice(0, 12);
  const validatedLessons = relevant(lessons.filter(x => x.validationStatus === "validated"), query).slice(0, 12);
  const candidateLessons = relevant(lessons.filter(x => x.validationStatus !== "validated"), query).slice(0, 5);
  const entityProfiles = relevant(profiles, query).slice(0, 12);
  const relevantAgentProfiles = relevant(agentProfiles, query).slice(0, 12);
  const relevantHumanTips = relevant(humanTips, query).slice(0, 10);
  const relevantCouponHistory = relevant(couponHistory, query).slice(0, 10);
  const relevantLearningCycles = relevant(learningCycles, query).slice(0, 8);
  const relevantStrategyCandidates = relevant(strategyCandidates, query).slice(0, 12);
  const relevantBacktests = relevant(backtestRuns, query).slice(0, 6);
  return {
    mandatory: true, readBeforeCouponConstruction: true,
    reviewedAt: new Date().toISOString(), query, reviewStatus: "COMPLETED",
    areasReviewed: ["winning-coupons", "losing-coupons", "validated-lessons", "candidate-lessons", "entity-profiles", "human-tips", "coupon-history", "learning-cycles", "strategy-candidates", "backtest-runs"],
    counts: {
      winningCouponsAvailable: winning.length, winningCouponsMatched: winners.length,
      losingCouponsAvailable: losing.length, losingCouponsMatched: losers.length,
      validatedLessonsAvailable: lessons.filter(x => x.validationStatus === "validated").length,
      validatedLessonsMatched: validatedLessons.length, candidateLessonsMatched: candidateLessons.length,
      entityProfilesMatched: entityProfiles.length, agentProfilesMatched: relevantAgentProfiles.length, humanTipsMatched: relevantHumanTips.length,
      couponHistoryMatched: relevantCouponHistory.length,
      learningCyclesMatched: relevantLearningCycles.length,
      strategyCandidatesMatched: relevantStrategyCandidates.length,
      backtestsMatched: relevantBacktests.length
    },
    winningCoupons: winners, losingCoupons: losers, validatedLessons, candidateLessons,
    entityProfiles, agentProfiles: relevantAgentProfiles, humanTips: relevantHumanTips, couponHistory: relevantCouponHistory,
    learningCycles: relevantLearningCycles,
    strategyCandidates: relevantStrategyCandidates,
    backtestRuns: relevantBacktests,
    instruction: "Every coupon-writing agent must read both winning and losing examples, relevant human tips, entity profiles, validated lessons and recent scheduled learning-cycle research, candidate strategies and chronological backtest summaries. Candidate research and retrospective backtests are not validated knowledge. Empty libraries must be acknowledged honestly; do not invent examples."
  };
}

export async function saveCouponRecord(input: any) {
  const couponText = clean(input?.couponText || input?.text, MAX_TEXT);
  if (couponText.length < 3) throw new Error("couponText must contain at least 3 characters");
  const outcome = (clean(input?.outcome || "pending", 20).toLowerCase() as LibraryOutcome);
  if (!OUTCOMES.has(outcome)) throw new Error("outcome must be pending, won, lost, void, partial, cancelled or unknown");
  if ((outcome === "won" || outcome === "lost") && (!clean(input?.settlementSource, 1000) || !safeArray(input?.settlementEvidence, 30).length)) throw new Error("Winning or losing status requires a settlement source and at least one evidence reference");
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
    sourceType: clean(input?.sourceType, 40) || "user_supplied",
    tipsterName: clean(input?.tipsterName, 200) || null,
    publishedAt: clean(input?.publishedAt, 100) || null,
    sourceSnapshot: clean(input?.sourceSnapshot, 12000) || null,
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
  const settlementEvidence = safeArray(input?.evidence, 30);
  if (!settlementEvidence.length) throw new Error("At least one settlement evidence reference is required");
  const updated = {
    ...current, outcome, settlementSource,
    settlementEvidence,
    settledAt: clean(input?.settledAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    learningStatus: "available_for_review"
  };
  await put("library/coupons", id, updated);
  await remove("library/winning-coupons", id);
  await remove("library/losing-coupons", id);
  await remove("library/pending-coupons", id);
  await remove("library/other-settlements", id);
  if (outcome === "won") await put("library/winning-coupons", id, updated);
  else if (outcome === "lost") await put("library/losing-coupons", id, updated);
  else await put("library/other-settlements", id, updated);
  const historyId = crypto.randomUUID();
  await put("library/coupon-history", historyId, {
    id: historyId, couponId: id, action: "settled", outcome,
    settlementSource, evidence: updated.settlementEvidence, at: updated.settledAt
  });

  // Every settlement creates an idempotent, evidence-linked learning case.
  // It records what happened, not an unsupported claim about why it happened.
  const learningId = "settlement-" + id;
  const selectionSummary = safeArray(updated.selections, 100).map((selection: any, index: number) => ({
    index: index + 1,
    event: clean(selection?.event || selection?.match || selection?.fixture, 250) || null,
    market: clean(selection?.market || selection?.selectionType, 180) || null,
    pick: clean(selection?.pick || selection?.selection || selection?.outcome, 180) || null,
    odds: selection?.odds ?? selection?.price ?? null,
    result: clean(selection?.result || selection?.settlement, 120) || null
  }));
  const learningRecord = {
    id: learningId, recordType: "settlement_learning_case",
    couponId: id, outcome, sport: updated.sport, country: updated.country,
    competition: updated.competition, combinedOdds: updated.combinedOdds ?? null,
    selections: selectionSummary, settlementSource,
    evidence: updated.settlementEvidence,
    observation: "Verified coupon settlement recorded. This is an outcome observation, not proof that any individual selection or strategy caused the result.",
    validationStatus: "candidate_for_validation",
    createdAt: updated.settledAt, updatedAt: new Date().toISOString()
  };
  await put("library/lessons", learningId, learningRecord);
  await put("library/settlement-learning", learningId, learningRecord);

  // Transfer the result to persistent entity agents whose scopes match this coupon.
  const profiles = await list<any>("library/entity-profiles", 1000);
  const matchingProfiles = profiles.filter((profile: any) => {
    const scope = profile.scope || {};
    const sameSport = !updated.sport || !scope.sport || clean(scope.sport, 100).toLowerCase() === clean(updated.sport, 100).toLowerCase();
    const sameCountry = !updated.country || !scope.country || clean(scope.country, 100).toLowerCase() === clean(updated.country, 100).toLowerCase();
    const sameCompetition = !updated.competition || !scope.competition || clean(scope.competition, 200).toLowerCase() === clean(updated.competition, 200).toLowerCase();
    const text = searchText({ name: profile.name, scope, aliases: profile.aliases }).toLowerCase();
    const selectionTerms = selectionSummary.flatMap((item: any) => [item.event, item.pick]).filter(Boolean);
    const entityMentioned = selectionTerms.some((term: string) => text.includes(term.toLowerCase()));
    const hierarchyMatch = ["sport", "country", "league", "specialist"].includes(profile.entityType);
    return sameSport && sameCountry && sameCompetition && (hierarchyMatch || entityMentioned);
  });
  for (const profile of matchingProfiles) {
    const observationId = learningId + ":" + clean(profile.id, 180);
    await put("library/agent-observations", observationId, {
      id: observationId, agentId: profile.agentId, entityId: profile.id,
      entityType: profile.entityType, couponId: id, outcome,
      recordType: "settlement_outcome_observation",
      observation: learningRecord.observation,
      settlementLearningId: learningId,
      evidence: updated.settlementEvidence,
      status: "verified_coupon_outcome_unattributed",
      observedAt: updated.settledAt
    });
    await put("library/agent-profiles", profile.agentId, {
      ...(await get<any>("library/agent-profiles", profile.agentId) || {}),
      agentId: profile.agentId, entityId: profile.id, entityType: profile.entityType,
      name: profile.name, scope: profile.scope,
      lastSettlementLearningId: learningId, lastSettlementOutcome: outcome,
      lastLearningAt: updated.settledAt
    });
  }
  await put("library/coupons", id, { ...updated, learningStatus: "recorded", settlementLearningId: learningId, learningAgentsUpdated: matchingProfiles.length });
  return { ...updated, learningStatus: "recorded", settlementLearningId: learningId, learningAgentsUpdated: matchingProfiles.length };
}

export async function saveEntityProfile(input: any) {
  const entityType = clean(input?.entityType, 30).toLowerCase() as EntityKind;
  const name = clean(input?.name, 200);
  if (!ENTITY_KINDS.has(entityType) || !name) throw new Error("entityType and name are required");
  const scope = {
    sport: clean(input?.sport, 100) || null,
    country: clean(input?.country, 100) || null,
    sports: clean(input?.sports, 1000) || null,
    competition: clean(input?.competition, 200) || null,
    club: clean(input?.club, 200) || null,
    providerId: clean(input?.providerId, 250) || null,
    aliases: safeArray(input?.aliases, 50).map((x) => clean(x, 200)).filter(Boolean)
  };
  const id = clean(input?.id, 180) || [entityType, scope.sport, scope.country, scope.competition, name].filter(Boolean).map(slug).join(":");
  const profile = {
    id, agentId: "WIN-" + entityType.toUpperCase() + "-" + slug(id),
    entityType, name, scope,
    providerId: scope.providerId,
    aliases: scope.aliases,
    profile: input?.profile && typeof input.profile === "object" ? input.profile : {},
    sources: safeArray(input?.sources, 40),
    agentMission: clean(input?.agentMission, 3000) || entityMission(entityType),
    activationMode: "on_demand",
    persistentIdentity: true,
    createdAt: clean(input?.createdAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await put("library/entity-profiles", id, profile);
  await put("library/agent-profiles", profile.agentId, {
    agentId: profile.agentId, entityId: id, entityType, name,
    mission: profile.agentMission, scope, activationMode: "on_demand",
    persistentIdentity: true, createdAt: profile.createdAt, updatedAt: profile.updatedAt
  });
  return profile;
}

function entityMission(type: EntityKind): string {
  const missions: Record<EntityKind, string> = {
    sport: "Maintain the sport-specific methodology, rules, performance metrics, schedule and evidence standards.",
    country: "Maintain country-specific sporting context, governing bodies, event coverage and competition structure.",
    league: "Maintain competition format, standings, schedule, incentives, form trends and settlement context.",
    club: "Maintain team history, squad, tactics, management, results, home/away splits, roster availability and performance.",
    player: "Maintain individual match logs, minutes, goals/assists or sport-specific output, discipline, injuries, availability and performance trends.",
    event: "Maintain event identity, schedule, participants, conditions, market context and verified outcome.",
    specialist: "Maintain specialist methodology, market-specific evidence standards, recurring failure modes and validated lessons relevant to the assigned discipline."
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
    validationStatus: "candidate_for_validation",
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

function entityDossiersFromReport(report: string): { clubs: any[]; players: any[] } {
  const startTag = "<WIN_ENTITY_DOSSIERS_JSON>";
  const endTag = "</WIN_ENTITY_DOSSIERS_JSON>";
  const start = report.indexOf(startTag);
  const end = report.indexOf(endTag);
  if (start < 0 || end <= start) return { clubs: [], players: [] };
  try {
    const parsed = JSON.parse(report.slice(start + startTag.length, end).trim());
    return {
      clubs: safeArray(parsed?.clubs, 100),
      players: safeArray(parsed?.players, 300)
    };
  } catch {
    return { clubs: [], players: [] };
  }
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
    T1: "sport", T2: "country", T3: "league", T4: "club", T5: "player", T6: "event", T7: "specialist"
  };
  for (const node of network?.nodes || []) {
    const entityType = nodeType[node.tier];
    if (!entityType) continue;
    const entityId = clean(node.id, 180);
    if (!entityId) continue;
    const existingProfile = await get<any>("library/entity-profiles", entityId);
    const entityName = entityType === "sport" ? node.scope?.sport
      : entityType === "country" ? node.scope?.country
      : entityType === "league" ? node.scope?.competition
      : entityType === "club" ? node.scope?.club
      : entityType === "player" ? node.scope?.player
      : entityType === "event" ? node.scope?.event : "";
    const profile = await saveEntityProfile({
      entityType, id: entityId, name: entityName || node.name,
      sport: node.scope?.sport, country: node.scope?.country, sports: node.scope?.sports,
      competition: node.scope?.competition, club: node.scope?.club,
      providerId: node.scope?.providerId,
      aliases: typeof node.scope?.aliases === "string" ? node.scope.aliases.split("|").filter(Boolean) : node.scope?.aliases,
      profile: { ...(existingProfile?.profile || {}), ...node.scope, workerStatus: node.status, runId: run.id },
      sources: safeArray(existingProfile?.sources, 40),
      createdAt: existingProfile?.createdAt,
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

  const sportReport = (run.workers || []).find((x: any) => x.departmentId === "D2");
  if (sportReport?.report) {
    const dossiers = entityDossiersFromReport(sportReport.report);
    for (const dossier of dossiers.clubs) {
      const name = clean(dossier?.name, 200);
      if (!name) continue;
      const scope = {
        sport: clean(dossier?.sport || run.brief?.sport, 100),
        country: clean(dossier?.country || run.brief?.country, 100),
        competition: clean(dossier?.competition || run.brief?.competition, 200)
      };
      const node = (network?.nodes || []).find((n: any) => n.tier === "T4" &&
        clean(n.scope?.club || n.name.replace(/ Club Agent$/, ""), 200).toLowerCase() === name.toLowerCase());
      const id = clean(node?.id, 180) || "club-" + slug([scope.sport, scope.country, name].filter(Boolean).join(" × "));
      const previous = await get<any>("library/entity-profiles", id);
      const evidence = safeArray(dossier?.evidence, 50);
      const profile = await saveEntityProfile({
        entityType: "club", id, name, ...scope,
        providerId: clean(dossier?.providerId || dossier?.externalId, 250),
        aliases: safeArray(dossier?.aliases, 50),
        profile: { ...(previous?.profile || {}), dossier: dossier.profile || dossier,
          lastReviewedAt: savedAt, lastRunId: run.id, dossierEvidenceStatus: evidence.length ? "references_supplied_needs_validation" : "evidence_missing" },
        sources: [...safeArray(previous?.sources, 40), ...evidence].slice(-40),
        agentMission: entityMission("club")
      });
      const observationId = crypto.randomUUID();
      await put("library/agent-observations", observationId, {
        id: observationId, agentId: profile.agentId, entityId: id, entityType: "club",
        runId: run.id, sourceReportId: sportReport.workerId,
        observation: { dossier, evidence, verificationStatus: "requires_source_validation" },
        status: "dossier_requires_evidence_validation", observedAt: savedAt
      });
    }
    for (const dossier of dossiers.players) {
      const name = clean(dossier?.name, 200);
      if (!name) continue;
      const scope = {
        sport: clean(dossier?.sport || run.brief?.sport, 100),
        country: clean(dossier?.country || run.brief?.country, 100),
        competition: clean(dossier?.competition || run.brief?.competition, 200),
        club: clean(dossier?.club, 200)
      };
      const node = (network?.nodes || []).find((n: any) => n.tier === "T5" &&
        clean(n.scope?.player || n.name.replace(/ Player Agent$/, ""), 200).toLowerCase() === name.toLowerCase());
      const id = clean(node?.id, 180) || "player-" + slug([scope.sport, scope.country, name].filter(Boolean).join(" × "));
      const previous = await get<any>("library/entity-profiles", id);
      const evidence = safeArray(dossier?.evidence, 50);
      const matchLog = safeArray(dossier?.matchLog, 200).map((match: any) => ({
        date: clean(match?.date, 40) || null, opponent: clean(match?.opponent, 200) || null,
        competition: clean(match?.competition, 200) || null,
        minutes: Number.isFinite(match?.minutes) ? match.minutes : null,
        starter: typeof match?.starter === "boolean" ? match.starter : null,
        position: clean(match?.position, 100) || null,
        goals: Number.isFinite(match?.goals) ? match.goals : null,
        assists: Number.isFinite(match?.assists) ? match.assists : null,
        cards: clean(match?.cards, 100) || null, injuryStatus: clean(match?.injuryStatus, 500) || null,
        sportSpecificMetrics: match?.sportSpecificMetrics && typeof match.sportSpecificMetrics === "object" ? match.sportSpecificMetrics : {},
        evidenceRefs: safeArray(match?.evidenceRefs, 20)
      }));
      const profile = await saveEntityProfile({
        entityType: "player", id, name, ...scope,
        providerId: clean(dossier?.providerId || dossier?.externalId, 250),
        aliases: safeArray(dossier?.aliases, 50),
        profile: { ...(previous?.profile || {}), dossier: dossier.profile || {},
          matchLog, lastReviewedAt: savedAt, lastRunId: run.id,
          dossierEvidenceStatus: evidence.length && matchLog.every((m: any) => m.evidenceRefs.length) ? "references_supplied_needs_validation" : "evidence_missing_or_incomplete" },
        sources: [...safeArray(previous?.sources, 40), ...evidence].slice(-40),
        agentMission: entityMission("player")
      });
      const observationId = crypto.randomUUID();
      await put("library/agent-observations", observationId, {
        id: observationId, agentId: profile.agentId, entityId: id, entityType: "player",
        runId: run.id, sourceReportId: sportReport.workerId,
        observation: { dossier: { ...dossier, matchLog }, evidence, verificationStatus: "requires_source_validation" },
        status: "dossier_requires_evidence_validation", observedAt: savedAt
      });
    }
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
      winningExamplesRead: run.brief?.libraryReview?.counts?.winningCouponsMatched ?? 0,
      losingExamplesRead: run.brief?.libraryReview?.counts?.losingCouponsMatched ?? 0,
      createdAt: run.createdAt, savedAt
    });

    if ((run.brief?.taskType === "build_latest_coupon" || run.brief?.taskType === "compare_coupons") &&
      /^\s*FINAL DECISION:\s*BET\b/im.test(run.master?.report || "")) {
      await saveCouponRecord({
        id: "win-" + run.id,
        origin: "win",
        label: "WIN proposed coupon — " + clean(run.brief?.event, 180),
        couponText: clean(run.master?.report, MAX_TEXT),
        sport: run.brief?.sport, country: run.brief?.country, competition: run.brief?.competition,
        source: "WIN Global Master report; proposed only, not proof of placement",
        notes: "Stored as pending until the user confirms placement and supplies a settlement source and evidence.",
        outcome: "pending", runId: run.id
      });
    }
  }
  return { savedAt, reportsArchived: reports.length, entityProfilesUpdated: (network?.nodes || []).filter((n: any) => Boolean(nodeType[n.tier])).length };
}

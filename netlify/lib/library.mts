import { get, list, put, putIfNew, remove } from "./store.mts";

export type LibraryOutcome = "pending" | "won" | "lost" | "void" | "partial" | "cancelled" | "unknown";
export type EntityKind = "sport" | "country" | "league" | "club" | "player" | "manager" | "event" | "specialist";

const OUTCOMES = new Set<LibraryOutcome>(["pending", "won", "lost", "void", "partial", "cancelled", "unknown"]);
const ENTITY_KINDS = new Set<EntityKind>(["sport", "country", "league", "club", "player", "manager", "event", "specialist"]);
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
function isHttpsUrl(value: unknown): boolean {
  const raw = clean(value, 1500);
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
function evidenceHasHttpsUrl(entry: any): boolean {
  return isHttpsUrl(typeof entry === "string" ? entry : entry?.url || entry?.reference || entry?.sourceUrl || entry?.evidenceUrl);
}

/**
 * A lesson is trusted only after approval through the separate reviewer credential.
 * This proves credential separation, not the holder's real-world identity.
 */
function isIndependentlyValidatedLesson(lesson: any): boolean {
  const review = lesson?.independentReview;
  const submitterCredentialId = clean(lesson?.submitterCredentialId, 256);
  const reviewerCredential = clean(review?.reviewerCredentialId, 256);
  return lesson?.validationStatus === "validated"
    && review?.status === "approved"
    && review?.reviewerAuth === "separate_reviewer_credential"
    && Boolean(submitterCredentialId)
    && Boolean(reviewerCredential)
    && reviewerCredential !== submitterCredentialId
    && Number.isFinite(Date.parse(review?.reviewedAt || ""))
    && safeArray(review?.evidence, 30).some(evidenceHasHttpsUrl);
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
  const [coupons, winning, losing, pending, winCouponCandidates, lessons, lessonReviewCases, entities, profiles, observations, runs,
    humanTips, agentNotes, couponHistory, couponCases, frozenPredictions, settledResults, otherSettlements, learningCycles, strategyCandidates, backtestRuns, persistentAgentProfiles, agentTasks, historicalMarketData, consensusMarketData, observedMarketData, settledObservedMarketData, playerEventData, marketCalibrationReports, marketSettlementRuns, sourceCandidates, sourceDiscoveryRuns, agentProposals, agentSandboxEvaluations] = await Promise.all([
    list<any>("library/coupons", 500),
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/pending-coupons", 500),
    list<any>("library/win-coupon-candidates", 500),
    list<any>("library/lessons", 500),
    list<any>("library/lesson-review-cases", 300),
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
    list<any>("library/backtest-runs", 500),
    list<any>("library/persistent-agent-profiles", 1000),
    list<any>("library/agent-task-queue", 1000),
    list<any>("library/model-lab/historical-event-datasets", 1000),
    list<any>("library/model-lab/market-consensus-datasets", 100),
    list<any>("library/model-lab/observed-market-snapshots", 100),
    list<any>("library/model-lab/settled-observed-markets", 100),
    list<any>("library/model-lab/player-event-datasets", 1000),
    list<any>("library/model-lab/market-calibration-reports", 20),
    list<any>("library/model-lab/observed-market-settlement-runs", 20),
    list<any>("library/research-source-candidates", 1000),
    list<any>("library/research-source-discovery-runs", 20),
    list<any>("library/agent-proposals", 500),
    list<any>("library/agent-sandbox-evaluations", 500)
  ]);
  const marketDataItems = [
    ...historicalMarketData.map((d:any)=>({id:d.id,recordType:"model_lab_historical_event_dataset",providerId:d.providerId,sport:d.sport,competition:d.competition,season:d.season,sourceUrl:d.sourceUrl,sourceLicence:d.sourceLicence,retrievedAt:d.retrievedAt,totalRows:d.totalRows,scoredRows:d.scoredRows,playerEventRows:d.playerEventRows,origin:d.origin,lab:d.lab})),
    ...consensusMarketData.map((d:any)=>({id:d.id,recordType:"model_lab_consensus_market_dataset",providerId:d.providerId,sport:d.sport,repository:d.repository,sourceUrl:d.sourceUrl,sourceLicence:d.sourceLicence,retrievedAt:d.retrievedAt,totalRows:d.totalRows,settledRows:d.settledRows,marketDataType:d.marketDataType,origin:d.origin,lab:d.lab})),
    ...observedMarketData.map((d:any)=>({id:d.id,recordType:"model_lab_observed_market_snapshot",providerId:d.providerId,sport:d.sport,sourceUrl:d.sourceUrl,sourceLicence:d.sourceLicence,retrievedAt:d.retrievedAt,recordCount:d.recordCount,rejectedRows:d.rejectedRows,origin:d.origin,lab:d.lab})),
    ...settledObservedMarketData.map((d:any)=>({id:d.id,recordType:"model_lab_settled_observed_market_dataset",providerId:d.providerId,sourceLicence:d.sourceLicence,resultLicence:d.resultLicence,retrievedAt:d.retrievedAt,settledSelectionCount:d.settledSelectionCount,uniqueEvents:d.uniqueEvents,sourceHash:d.sourceHash,origin:d.origin,lab:d.lab})),
    ...playerEventData.map((d:any)=>({id:d.id,recordType:"model_lab_player_event_dataset",providerId:d.providerId,competition:d.competition,season:d.season,sourceUrl:d.sourceUrl,sourceLicence:d.sourceLicence,totalRows:d.totalRows,origin:d.origin,lab:d.lab})),
    ...marketCalibrationReports.map((d:any)=>({id:d.id,recordType:"model_lab_market_calibration_report",status:d.status,createdAt:d.createdAt,totalEvents:d.totalEvents,sourceDatasetCount:d.sourceDatasetCount,origin:d.origin,lab:d.lab})),
    ...marketSettlementRuns.map((d:any)=>({id:d.id,recordType:"model_lab_market_settlement_run",status:d.status,createdAt:d.createdAt,settledSelections:d.settledSelections,uniqueEvents:d.uniqueEvents,simulationRunId:d.simulationRunId,simulation:d.simulation,caveats:d.caveats,sourceHash:d.sourceHash,origin:"provider_historical_data",lab:"model-lab"}))
  ];
  let items: any[] = [];
  if (category === "winning") items = winning;
  else if (category === "losing") items = losing;
  else if (category === "pending") items = pending;
  else if (category === "win-candidates") items = winCouponCandidates;
  else if (category === "coupons") items = coupons;
  else if (category === "lessons") items = lessons;
  else if (category === "lesson-reviews") items = lessonReviewCases;
  else if (category === "entities") items = entities;
  else if (category === "agents") items = [...profiles, ...persistentAgentProfiles, ...agentTasks, ...agentProposals, ...agentSandboxEvaluations];
  else if (category === "market-data") items = marketDataItems;
  else if (category === "sources") items = [...sourceCandidates.map((x:any)=>({id:x.id,recordType:"research_source_candidate",name:x.name,sourceType:x.sourceType,sourceUrl:x.sourceUrl,license:x.license,licenseStatus:x.licenseStatus,sports:x.sports,dataDomains:x.dataDomains,downloads:x.downloads,stars:x.stars,reviewStatus:x.reviewStatus,automationAllowed:false,lastSeenAt:x.lastSeenAt,reviewNote:x.reviewNote})),...sourceDiscoveryRuns];
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
  else items = [...coupons, ...winCouponCandidates, ...lessons, ...lessonReviewCases, ...entities, ...profiles, ...observations, ...runs,
    ...humanTips, ...agentNotes, ...couponHistory, ...couponCases, ...frozenPredictions, ...settledResults, ...otherSettlements, ...learningCycles, ...strategyCandidates, ...backtestRuns, ...persistentAgentProfiles, ...agentTasks, ...agentProposals, ...agentSandboxEvaluations, ...marketDataItems, ...sourceCandidates.map((x:any)=>({id:x.id,recordType:"research_source_candidate",name:x.name,sourceType:x.sourceType,sourceUrl:x.sourceUrl,license:x.license,licenseStatus:x.licenseStatus,sports:x.sports,dataDomains:x.dataDomains,downloads:x.downloads,stars:x.stars,reviewStatus:x.reviewStatus,automationAllowed:false,lastSeenAt:x.lastSeenAt})), ...sourceDiscoveryRuns];

  let filtered = relevant(items, clean(options.query, 1000));
  if (options.outcome) filtered = filtered.filter((x: any) => x.outcome === options.outcome);
  if (options.sport) filtered = filtered.filter((x: any) => !x.sport || x.sport.toLowerCase() === options.sport!.toLowerCase());
  if (options.entityType) filtered = filtered.filter((x: any) => x.entityType === options.entityType || x.scope?.entityType === options.entityType);
  return {
    category, query: clean(options.query, 1000) || null, count: filtered.length,
    items: filtered.slice(0, limit), reviewedAt: new Date().toISOString(),
    libraryAreas: ["winning-coupons", "losing-coupons", "pending-coupons", "win-coupon-candidates", "coupons", "coupon-history",
      "human-tips", "lessons", "lesson-review-cases", "entity-profiles", "agent-profiles", "agent-observations",
      "agent-notes", "persistent-agent-profiles", "agent-task-queue", "agent-proposals", "agent-sandbox-evaluations", "market-data", "research-source-candidates", "research-source-discovery-runs", "sources", "research-runs", "frozen-predictions", "settled-results", "other-settlements", "coupon-research-cases", "learning-cycles", "strategy-candidates", "backtest-runs"]
  };
}

export async function getMandatoryLearningPack(brief: any) {
  await ensureLegacyLibraryImport();
  const query = [
    brief?.event, brief?.sport, brief?.country, brief?.competition, brief?.context,
    brief?.existingCoupon, brief?.manager, ...(Array.isArray(brief?.managers) ? brief.managers : []),
    ...(Array.isArray(brief?.teams) ? brief.teams : []),
    ...(Array.isArray(brief?.clubs) ? brief.clubs : []), ...(Array.isArray(brief?.players) ? brief.players : [])
  ].filter(Boolean).join(" ");
  const [winning, losing, lessons, profiles, agentProfiles, persistentAgentProfiles, humanTips, couponHistory,
    learningCycles, strategyCandidates, backtestRuns, agentObservations, agentNotes] = await Promise.all([
    list<any>("library/winning-coupons", 500),
    list<any>("library/losing-coupons", 500),
    list<any>("library/lessons", 500),
    list<any>("library/entity-profiles", 1000),
    list<any>("library/agent-profiles", 1000),
    list<any>("library/persistent-agent-profiles", 1000),
    list<any>("library/human-tips", 300),
    list<any>("library/coupon-history", 300),
    list<any>("library/learning-cycles", 100),
    list<any>("library/strategy-candidates", 500),
    list<any>("library/backtest-runs", 200),
    list<any>("library/agent-observations", 1500),
    list<any>("library/agent-notes", 1500)
  ]);
  const newestFirst = (items: any[], dateFields: string[]) => items.sort((a, b) => {
    const getTime = (x: any) => {
      for (const field of dateFields) {
        const value = Date.parse(x?.[field] || "");
        if (Number.isFinite(value)) return value;
      }
      return 0;
    };
    return getTime(b) - getTime(a);
  });
  const winners = newestFirst(relevant(winning, query), ["settledAt", "updatedAt", "createdAt"]).slice(0, 12);
  const losers = newestFirst(relevant(losing, query), ["settledAt", "updatedAt", "createdAt"]).slice(0, 12);
  const validatedLessons = newestFirst(relevant(lessons.filter(isIndependentlyValidatedLesson), query), ["createdAt"]).slice(0, 12);
  const candidateLessons = newestFirst(relevant(lessons.filter(x => !isIndependentlyValidatedLesson(x)), query), ["createdAt"]).slice(0, 8);
  const entityProfiles = newestFirst(relevant(profiles, query), ["updatedAt", "createdAt"]).slice(0, 12);
  const relevantAgentProfiles = newestFirst(relevant([...agentProfiles, ...persistentAgentProfiles], query), ["updatedAt", "createdAt"]).slice(0, 20);

  // Bring back prior entity-specific research as well as the full department reports.
  // This is what lets the on-demand identities reuse earlier findings rather than start from zero.
  const matchingEntityIds = new Set<string>([
    ...entityProfiles.map((x: any) => x.id).filter(Boolean),
    ...entityProfiles.map((x: any) => x.agentId).filter(Boolean),
    ...relevantAgentProfiles.map((x: any) => x.entityId).filter(Boolean),
    ...relevantAgentProfiles.map((x: any) => x.agentId).filter(Boolean)
  ]);
  const observationMatches = agentObservations.filter((x: any) =>
    (x.entityId && matchingEntityIds.has(x.entityId)) ||
    (x.agentId && matchingEntityIds.has(x.agentId)) ||
    relevant([x], query).length > 0
  );
  const priorAgentObservations = newestFirst(observationMatches, ["observedAt", "createdAt"]).slice(0, 16);
  const priorAgentNotes = newestFirst(
    relevant(agentNotes.filter((x: any) => x.recordType === "agent_report"), query),
    ["createdAt"]
  ).slice(0, 8).map((note: any) => {
    const report = clean(note.report, MAX_TEXT);
    const reportExcerpt = report.length <= 1200 ? report
      : report.slice(0, 580) + "\n[Middle of archived report omitted from prompt; full report remains in WIN Library]\n" + report.slice(-580);
    return {
      id: note.id, runId: note.runId, agentId: note.agentId, agentRole: note.agentRole,
      departmentId: note.departmentId, phase: note.phase, status: note.status,
      reportExcerpt, citations: safeArray(note.citations, 12), createdAt: note.createdAt
    };
  });
  const relevantHumanTips = newestFirst(relevant(humanTips, query), ["createdAt"]).slice(0, 10);
  const relevantCouponHistory = newestFirst(relevant(couponHistory, query), ["at"]).slice(0, 10);
  const relevantLearningCycles = newestFirst(relevant(learningCycles, query), ["completedAt", "startedAt"]).slice(0, 8);
  const relevantStrategyCandidates = newestFirst(relevant(strategyCandidates, query), ["createdAt"]).slice(0, 12);
  const relevantBacktests = newestFirst(relevant(backtestRuns, query), ["completedAt", "createdAt"]).slice(0, 6);
  return {
    mandatory: true, readBeforeCouponConstruction: true,
    reviewedAt: new Date().toISOString(), query, reviewStatus: "COMPLETED",
    areasReviewed: ["winning-coupons", "losing-coupons", "validated-lessons", "candidate-lessons",
      "entity-profiles", "agent-profiles", "agent-observations", "agent-notes", "human-tips",
      "coupon-history", "learning-cycles", "strategy-candidates", "backtest-runs"],
    counts: {
      winningCouponsAvailable: winning.length, winningCouponsMatched: winners.length,
      losingCouponsAvailable: losing.length, losingCouponsMatched: losers.length,
      validatedLessonsAvailable: lessons.filter(isIndependentlyValidatedLesson).length,
      validatedLessonsMatched: validatedLessons.length, candidateLessonsMatched: candidateLessons.length,
      entityProfilesMatched: entityProfiles.length, agentProfilesMatched: relevantAgentProfiles.length,
      agentObservationsMatched: priorAgentObservations.length, agentReportNotesMatched: priorAgentNotes.length,
      humanTipsMatched: relevantHumanTips.length, couponHistoryMatched: relevantCouponHistory.length,
      learningCyclesMatched: relevantLearningCycles.length,
      strategyCandidatesMatched: relevantStrategyCandidates.length,
      backtestsMatched: relevantBacktests.length
    },
    winningCoupons: winners, losingCoupons: losers, validatedLessons, candidateLessons,
    entityProfiles, agentProfiles: relevantAgentProfiles,
    agentObservations: priorAgentObservations, agentNotes: priorAgentNotes,
    humanTips: relevantHumanTips, couponHistory: relevantCouponHistory,
    learningCycles: relevantLearningCycles, strategyCandidates: relevantStrategyCandidates,
    backtestRuns: relevantBacktests,
    instruction: "Before researching, inspect the prior agentObservations and agentNotes for this sport, country, competition, club, player, event and specialist. Reuse supported findings and their source references; do not repeat the same stable-fact research when a usable record already exists. Check freshness before reuse: odds, lineups, injuries, player availability, event status, schedules and other time-sensitive claims must be re-verified close to the event. Add genuinely new findings as new dated observations and preserve source URLs, publication dates, retrieval times, evidence grade and uncertainty. Never overwrite history or promote an unverified note into a validated lesson. Every coupon-writing agent must also read both winning and losing examples, relevant entity profiles, validated lessons and recent research cycles."
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
  if (current.origin === "human") throw new Error("Human-origin coupons must use the independent settlement review queue; direct settlement is disabled.");
  const outcome = clean(input?.outcome, 20).toLowerCase() as LibraryOutcome;
  if (!OUTCOMES.has(outcome) || outcome === "pending" || outcome === "unknown") {
    throw new Error("settlement outcome must be won, lost, void, partial or cancelled");
  }
  const settlementSource = clean(input?.settlementSource, 1000);
  if (!settlementSource) throw new Error("settlementSource is required");
  const settlementEvidence = safeArray(input?.evidence, 30);
  if (!isHttpsUrl(settlementSource) || !settlementEvidence.some(evidenceHasHttpsUrl)) {
    throw new Error("Provide an HTTPS settlement source URL and at least one HTTPS evidence URL.");
  }
  const updated = {
    ...current, outcome, settlementSource,
    settlementEvidence,
    settledAt: clean(input?.settledAt, 100) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    learningStatus: "available_for_review",
    settlementReviewStatus: "owner_submitted_reference_pending_independent_review"
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
    observation: "Owner-submitted coupon outcome classification recorded with an HTTPS evidence reference. WIN has not independently verified the source or settlement. This is an observation candidate, not proof that any individual selection or strategy caused the result.",
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
      status: "owner_submitted_outcome_unverified",
      observedAt: updated.settledAt
    });
    await put("library/agent-profiles", profile.agentId, {
      ...(await get<any>("library/agent-profiles", profile.agentId) || {}),
      agentId: profile.agentId, entityId: profile.id, entityType: profile.entityType,
      name: profile.name, scope: profile.scope,
      lastUserSubmittedSettlementLearningId: learningId, lastUserSubmittedOutcome: outcome,
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
    manager: clean(input?.manager, 200) || null,
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
    manager: "Maintain coach/manager identity, tenure, tactical and strategic tendencies, lineup/rotation decisions, substitutions, performance history, press-conference evidence and source freshness.",
    event: "Maintain event identity, schedule, participants, conditions, market context and verified outcome.",
    specialist: "Maintain specialist methodology, market-specific evidence standards, recurring failure modes and validated lessons relevant to the assigned discipline."
  };
  return missions[type];
}

export async function saveLearningNote(input: any) {
  const note = clean(input?.note, 12000);
  if (note.length < 3) throw new Error("note must contain at least 3 characters");
  const id = clean(input?.id, 180) || crypto.randomUUID();
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

function entityDossiersFromReport(report: string): { clubs: any[]; players: any[]; managers: any[] } {
  const startTag = "<WIN_ENTITY_DOSSIERS_JSON>";
  const endTag = "</WIN_ENTITY_DOSSIERS_JSON>";
  const start = report.indexOf(startTag);
  const end = report.indexOf(endTag);
  if (start < 0 || end <= start) return { clubs: [], players: [], managers: [] };
  try {
    const parsed = JSON.parse(report.slice(start + startTag.length, end).trim());
    return {
      clubs: safeArray(parsed?.clubs, 100),
      players: safeArray(parsed?.players, 300),
      managers: safeArray(parsed?.managers, 100)
    };
  } catch {
    return { clubs: [], players: [] };
  }
}

function researchEvidenceFromReport(report: string): any[] {
  const startTag = "<WIN_RESEARCH_EVIDENCE_JSON>";
  const endTag = "</WIN_RESEARCH_EVIDENCE_JSON>";
  const start = report.indexOf(startTag), end = report.indexOf(endTag);
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(report.slice(start + startTag.length, end).trim());
    return safeArray(parsed?.records, 500);
  } catch { return []; }
}

export async function saveResearchEvidence(input: any) {
  const id = clean(input?.id, 180) || crypto.randomUUID();
  const domain = clean(input?.domain || input?.dataType, 80).toLowerCase();
  const metric = clean(input?.metric, 160);
  if (!domain || !metric) throw new Error("domain and metric are required");
  const retrievedAt = clean(input?.retrievedAt, 100) || new Date().toISOString();
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error("retrievedAt must be a valid timestamp");
  const confidence = input?.confidence == null ? null : Number(input.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("confidence must be between 0 and 1");
  const record = {
    id, recordType: "research_evidence",
    sport: clean(input?.sport, 100) || null, country: clean(input?.country, 100) || null,
    competition: clean(input?.competition, 200) || null, season: clean(input?.season, 80) || null,
    eventId: clean(input?.eventId, 180) || null, entityId: clean(input?.entityId, 180) || null,
    entityType: clean(input?.entityType, 40) || null, domain, metric,
    value: input?.value ?? null, unit: clean(input?.unit, 60) || null,
    sourceName: clean(input?.sourceName, 200) || null,
    sourceUrl: clean(input?.sourceUrl, 1500) || null,
    evidenceRefs: safeArray(input?.evidenceRefs, 30),
    publishedAt: clean(input?.publishedAt, 100) || null, retrievedAt,
    validFrom: clean(input?.validFrom, 100) || null, validTo: clean(input?.validTo, 100) || null,
    freshnessTtlHours: Number.isFinite(Number(input?.freshnessTtlHours)) ? Math.max(0, Number(input.freshnessTtlHours)) : null,
    evidenceGrade: clean(input?.evidenceGrade, 40) || "ungraded",
    confidence, conflictStatus: clean(input?.conflictStatus, 40) || "not_checked",
    rawSnapshot: input?.rawSnapshot ?? null,
    rawSnapshotHash: clean(input?.rawSnapshotHash, 128) || null,
    runId: clean(input?.runId, 100) || null,
    evidenceStatus: clean(input?.sourceUrl, 1500) || safeArray(input?.evidenceRefs, 30).length ? "source_reference_attached" : "source_reference_missing",
    createdAt: new Date().toISOString()
  };
  await put("library/research-evidence", id, record);
  return record;
}

export async function searchResearchEvidence(options: any = {}) {
  const items = await list<any>("library/research-evidence", 2000);
  let filtered = items;
  for (const key of ["sport", "country", "competition", "eventId", "entityId", "domain", "metric"] as const) {
    const value = clean(options?.[key], 300).toLowerCase();
    if (value) filtered = filtered.filter((x: any) => clean(x?.[key], 300).toLowerCase() === value);
  }
  const limit = Math.min(200, Math.max(1, Number(options?.limit) || 50));
  return { count: filtered.length, items: filtered.slice(0, limit), reviewedAt: new Date().toISOString() };
}

export async function archiveRunToLibrary(run: any) {
  const savedAt = new Date().toISOString();
  const network = run?.workerNetwork;
  const reports = [...(run.workers || []), ...(run.debate || []), ...(run.master ? [run.master] : [])];

  await put("library/research-runs", run.id, {
    id: run.id, taskType: run.brief?.taskType, event: run.brief?.event,
    status: run.status, decision: run.decision || run.master?.report || null,
    brief: run.brief, workerNetwork: network,
    workers: run.workers || [], debate: run.debate || [], master: run.master || null,
    coupons: safeArray(run.coupons, 100),
    createdAt: run.createdAt, completedAt: run.completedAt || null, savedAt
  });

  // Stable keys make archive retries idempotent: the same run cannot create duplicate report notes.
  const reportNoteIds = new Map<string, string>();
  for (const report of reports) {
    const noteId = run.id + ":" + (report.workerId || slug(report.role || "worker"));
    reportNoteIds.set(report.workerId || report.role, noteId);
    await put("library/agent-notes", noteId, {
      id: noteId, runId: run.id, recordType: "agent_report",
      agentId: report.workerId || null, agentRole: report.role || "WIN worker",
      departmentId: report.departmentId || null, phase: report.phase || "unknown",
      status: report.status || "failed", report: clean(report.report, MAX_TEXT),
      citations: safeArray(report.citations, 100),
      startedAt: report.startedAt || null, createdAt: report.completedAt || savedAt,
      archivedAt: savedAt
    });
  }

  // Store normalized event/entity facts and metrics emitted by department reports.
  // Original reports remain archived; these records add searchable, append-only evidence rows.
  let researchEvidenceSaved = 0;
  for (const report of reports) {
    for (const [index, evidence] of researchEvidenceFromReport(clean(report.report, MAX_TEXT)).entries()) {
      try {
        await saveResearchEvidence({
          ...evidence,
          id: clean(evidence?.id, 180) || run.id + ":" + (report.workerId || slug(report.role || "worker")) + ":evidence:" + index,
          runId: run.id,
          evidenceRefs: [...safeArray(evidence?.evidenceRefs, 30), ...safeArray(report.citations, 10)]
        });
        researchEvidenceSaved++;
      } catch {
        // Keep the full report and note archived even when a malformed evidence row is rejected.
      }
    }
  }

  const nodeType: Record<string, EntityKind> = {
    T1: "sport", T2: "country", T3: "league", T4: "club",
    T5: "player", T6: "event", T7: "specialist"
  };
  let entityProfilesUpdated = 0;
  let observationsSaved = 0;
  for (const node of network?.nodes || []) {
    const entityType: EntityKind | undefined = node.tier === "T5" && node.id.startsWith("manager-") ? "manager" : nodeType[node.tier];
    if (!entityType) continue;
    const entityId = clean(node.id, 180);
    if (!entityId) continue;
    const existingProfile = await get<any>("library/entity-profiles", entityId);
    const entityName = entityType === "sport" ? node.scope?.sport
      : entityType === "country" ? node.scope?.country
      : entityType === "league" ? node.scope?.competition
      : entityType === "club" ? node.scope?.club
      : entityType === "player" ? node.scope?.player
      : entityType === "manager" ? node.scope?.manager
      : entityType === "event" ? node.scope?.event : node.name;
    const departmentId = node.assignedDepartment ||
      (["sport", "club", "player", "manager", "event"].includes(entityType) ? "D2" : "D1");
    const sourceReport = reports.find((x: any) => x.departmentId === departmentId && x.phase === "department")
      || reports.find((x: any) => x.departmentId === departmentId);
    const sourceLibraryNoteId = sourceReport
      ? reportNoteIds.get(sourceReport.workerId || sourceReport.role) || null : null;
    const priorSources = safeArray(existingProfile?.sources, 100);
    const reportSources = safeArray(sourceReport?.citations, 100);
    const profile = await saveEntityProfile({
      entityType, id: entityId, name: entityName || node.name,
      sport: node.scope?.sport, country: node.scope?.country, sports: node.scope?.sports,
      competition: node.scope?.competition, club: node.scope?.club, manager: node.scope?.manager,
      providerId: node.scope?.providerId,
      aliases: typeof node.scope?.aliases === "string" ? node.scope.aliases.split("|").filter(Boolean) : node.scope?.aliases,
      profile: {
        ...(existingProfile?.profile || {}), ...node.scope,
        workerStatus: node.status, lastRunId: run.id,
        lastReviewedAt: sourceReport?.completedAt || savedAt,
        lastResearchReportId: sourceReport?.workerId || null,
        lastResearchNoteId: sourceLibraryNoteId,
        lastResearchDepartment: departmentId,
        executionMode: node.executionMode || "covered_by_department_checklist"
      },
      sources: [...priorSources, ...reportSources].slice(-100),
      createdAt: existingProfile?.createdAt,
      agentMission: entityMission(entityType)
    });
    entityProfilesUpdated++;

    // The observation links each persistent identity to the full, archived department report
    // and its citations rather than copying a shortened/partial report into every profile.
    const observationId = run.id + ":" + entityId + ":" + (sourceReport?.workerId || "no-source");
    await put("library/agent-observations", observationId, {
      id: observationId, recordType: "entity_agent_research_link",
      agentId: profile.agentId, entityId, entityType, entityName: profile.name,
      scope: node.scope || {}, runId: run.id, departmentId,
      sourceReportId: sourceReport?.workerId || null,
      sourceLibraryNoteId,
      sourceAgentRole: sourceReport?.role || null,
      sourceReportStatus: sourceReport?.status || "not_run",
      citations: reportSources,
      observation: {
        nodeName: node.name, nodeStatus: node.status,
        executionMode: node.executionMode || "covered_by_department_checklist",
        finding: sourceReport?.status === "completed"
          ? "See the linked full department report and citations for this agent's research contribution."
          : "No completed department report was available; no research finding is claimed."
      },
      status: sourceReport?.status === "completed" && Boolean(sourceReport.report?.trim())
        ? "case_specific_review" : "not_verified",
      observedAt: sourceReport?.completedAt || savedAt
    });
    observationsSaved++;
  }

  const sportReport = (run.workers || []).find((x: any) => x.departmentId === "D2");
  const sportReportNoteId = sportReport
    ? reportNoteIds.get(sportReport.workerId || sportReport.role) || null : null;
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
      const evidence = safeArray(dossier?.evidence, 100);
      const profile = await saveEntityProfile({
        entityType: "club", id, name, ...scope,
        providerId: clean(dossier?.providerId || dossier?.externalId, 250),
        aliases: safeArray(dossier?.aliases, 50),
        profile: { ...(previous?.profile || {}), dossier: dossier.profile || dossier,
          lastReviewedAt: savedAt, lastRunId: run.id, lastResearchReportId: sportReport.workerId,
          lastResearchNoteId: sportReportNoteId,
          dossierEvidenceStatus: evidence.length ? "references_supplied_needs_validation" : "evidence_missing" },
        sources: [...safeArray(previous?.sources, 100), ...evidence].slice(-100),
        agentMission: entityMission("club")
      });
      const observationId = run.id + ":" + id + ":dossier";
      await put("library/agent-observations", observationId, {
        id: observationId, recordType: "entity_dossier",
        agentId: profile.agentId, entityId: id, entityType: "club",
        runId: run.id, sourceReportId: sportReport.workerId,
        sourceLibraryNoteId: sportReportNoteId,
        observation: { dossier, evidence, verificationStatus: "requires_source_validation" },
        citations: safeArray(sportReport.citations, 100),
        status: "dossier_requires_evidence_validation", observedAt: savedAt
      });
      observationsSaved++;
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
      const evidence = safeArray(dossier?.evidence, 100);
      const matchLog = safeArray(dossier?.matchLog, 300).map((match: any) => ({
        date: clean(match?.date, 40) || null, opponent: clean(match?.opponent, 200) || null,
        competition: clean(match?.competition, 200) || null,
        minutes: Number.isFinite(match?.minutes) ? match.minutes : null,
        starter: typeof match?.starter === "boolean" ? match.starter : null,
        position: clean(match?.position, 100) || null,
        goals: Number.isFinite(match?.goals) ? match.goals : null,
        assists: Number.isFinite(match?.assists) ? match.assists : null,
        cards: clean(match?.cards, 100) || null, injuryStatus: clean(match?.injuryStatus, 500) || null,
        sportSpecificMetrics: match?.sportSpecificMetrics && typeof match.sportSpecificMetrics === "object" ? match.sportSpecificMetrics : {},
        evidenceRefs: safeArray(match?.evidenceRefs, 30)
      }));
      const profile = await saveEntityProfile({
        entityType: "player", id, name, ...scope,
        providerId: clean(dossier?.providerId || dossier?.externalId, 250),
        aliases: safeArray(dossier?.aliases, 50),
        profile: { ...(previous?.profile || {}), dossier: dossier.profile || {},
          matchLog, lastReviewedAt: savedAt, lastRunId: run.id,
          lastResearchReportId: sportReport.workerId, lastResearchNoteId: sportReportNoteId,
          dossierEvidenceStatus: evidence.length && matchLog.every((m: any) => m.evidenceRefs.length)
            ? "references_supplied_needs_validation" : "evidence_missing_or_incomplete" },
        sources: [...safeArray(previous?.sources, 100), ...evidence].slice(-100),
        agentMission: entityMission("player")
      });
      const observationId = run.id + ":" + id + ":dossier";
      await put("library/agent-observations", observationId, {
        id: observationId, recordType: "entity_dossier",
        agentId: profile.agentId, entityId: id, entityType: "player",
        runId: run.id, sourceReportId: sportReport.workerId,
        sourceLibraryNoteId: sportReportNoteId,
        observation: { dossier: { ...dossier, matchLog }, evidence, verificationStatus: "requires_source_validation" },
        citations: safeArray(sportReport.citations, 100),
        status: "dossier_requires_evidence_validation", observedAt: savedAt
      });
      observationsSaved++;
    }
    for (const dossier of dossiers.managers) {
      const name = clean(dossier?.name || dossier?.manager || dossier?.coach, 200);
      if (!name) continue;
      const scope = {
        sport: clean(dossier?.sport || run.brief?.sport, 100),
        country: clean(dossier?.country || run.brief?.country, 100),
        competition: clean(dossier?.competition || run.brief?.competition, 200),
        club: clean(dossier?.club || dossier?.team, 200)
      };
      const node = (network?.nodes || []).find((n: any) => n.id.startsWith("manager-") &&
        clean(n.scope?.manager || n.name.replace(/ Manager \/ Coach Agent$/, ""), 200).toLowerCase() === name.toLowerCase());
      const id = clean(node?.id, 180) || "manager-" + slug([scope.sport, name].filter(Boolean).join(" × "));
      const previous = await get<any>("library/entity-profiles", id);
      const evidence = safeArray(dossier?.evidence, 100);
      const profile = await saveEntityProfile({
        entityType: "manager", id, name, ...scope,
        providerId: clean(dossier?.providerId || dossier?.externalId, 250),
        aliases: safeArray(dossier?.aliases, 50),
        profile: { ...(previous?.profile || {}), dossier: dossier.profile || dossier,
          tenure: clean(dossier?.tenure, 300), tacticalIdentity: dossier?.tacticalIdentity || null,
          decisionHistory: safeArray(dossier?.decisionHistory, 200),
          lastReviewedAt: savedAt, lastRunId: run.id, lastResearchReportId: sportReport.workerId,
          dossierEvidenceStatus: evidence.length ? "references_supplied_needs_validation" : "evidence_missing" },
        sources: [...safeArray(previous?.sources, 100), ...evidence].slice(-100),
        agentMission: entityMission("manager")
      });
      const observationId = run.id + ":" + id + ":dossier";
      await put("library/agent-observations", observationId, {
        id: observationId, recordType: "entity_dossier",
        agentId: profile.agentId, entityId: id, entityType: "manager",
        runId: run.id, sourceReportId: sportReport.workerId,
        sourceLibraryNoteId: sportReportNoteId,
        observation: { dossier, evidence, verificationStatus: "requires_source_validation" },
        citations: safeArray(sportReport.citations, 100),
        status: "dossier_requires_evidence_validation", observedAt: savedAt
      });
      observationsSaved++;
    }
  }



  // Save D6's structured candidates with stable IDs. Only fully qualified
  // candidates enter the pending tracker; WIN does not place any bet.
  let winCouponCandidatesSaved = 0;
  let qualifiedWinCouponsTracked = 0;
  const runResearchPassed = run.status === "completed" &&
    run.workerNetwork?.libraryReviewGate?.status === "passed" &&
    run.workerNetwork?.riskAssessmentGate?.status === "passed" &&
    /^\s*FINAL DECISION:\s*BET\b/im.test(run.master?.report || "");
  for (const [index, candidate] of safeArray(run.coupons, 100).entries()) {
    const candidateId = "win-candidate-" + slug(run.id + "-" + (candidate?.id || index));
    const legs = safeArray(candidate?.legs, 100).map((leg: any) => ({
      event: clean(leg?.event, 250) || "Unspecified event",
      market: clean(leg?.market, 180) || "Unspecified market",
      selection: clean(leg?.selection, 180) || "Unspecified selection",
      odds: Number.isFinite(leg?.odds) && leg.odds > 1 ? leg.odds : null,
      sourceUrl: clean(leg?.sourceUrl, 1500) || null,
      observedAt: clean(leg?.observedAt, 100) || null,
      settlementRule: clean(leg?.settlementRule, 500) || null,
      blockers: safeArray(leg?.blockers, 20)
    }));
    const blockers = safeArray(candidate?.blockers, 200).map((item: any) => clean(item, 300)).filter(Boolean);
    if (!runResearchPassed) blockers.push("Global Master did not approve the coupon or the full research, library and risk gates did not pass.");
    const fullyQualified = runResearchPassed && candidate?.status === "QUALIFIED" && legs.length > 0 && blockers.length === 0 &&
      legs.every((leg: any) =>
        leg.event !== "Unspecified event" && leg.market !== "Unspecified market" &&
        leg.selection !== "Unspecified selection" && leg.odds !== null && Boolean(leg.sourceUrl) &&
        Boolean(leg.observedAt) && Number.isFinite(Date.parse(leg.observedAt)) &&
        Boolean(leg.settlementRule) && leg.blockers.length === 0
      );
    const candidateRecord = {
      id: candidateId, recordType: "win_coupon_candidate", origin: "win",
      runId: run.id, label: clean(candidate?.label, 250) || "WIN coupon candidate " + (index + 1),
      sport: clean(run.brief?.sport, 100) || null,
      country: clean(run.brief?.country, 100) || null,
      competition: clean(run.brief?.competition, 200) || null,
      status: fullyQualified ? "QUALIFIED" : "BLOCKED",
      combinedOdds: fullyQualified && Number.isFinite(candidate?.combinedOdds) ? candidate.combinedOdds : null,
      legs, blockers: fullyQualified ? [] : blockers.length ? blockers : ["Candidate did not pass all structured D6 qualification checks."],
      riskFactors: safeArray(candidate?.riskFactors, 30),
      correlationNotes: safeArray(candidate?.correlationNotes, 30),
      placementStatus: "not_placed_by_WIN",
      executionDisclosure: "This is a research candidate. WIN did not place a bet or verify a bookmaker ticket.",
      createdAt: run.createdAt || savedAt, archivedAt: savedAt
    };
    await put("library/win-coupon-candidates", candidateId, candidateRecord);
    winCouponCandidatesSaved++;

    if (fullyQualified) {
      const couponId = "win-coupon-" + slug(run.id + "-" + (candidate?.id || index));
      const selections = legs.map((leg: any) => ({
        event: leg.event, market: leg.market, pick: leg.selection,
        odds: leg.odds, sourceUrl: leg.sourceUrl, observedAt: leg.observedAt,
        settlementRule: leg.settlementRule, result: "pending"
      }));
      const couponText = [
        candidateRecord.label,
        ...selections.map((selection: any, legIndex: number) =>
          (legIndex + 1) + ". " + selection.event + " — " + selection.market + ": " +
          selection.pick + " @ " + Number(selection.odds).toFixed(2)
        ),
        "Combined odds: " + Number(candidateRecord.combinedOdds).toFixed(4),
        "Placement: not placed by WIN"
      ].join("\n");
      const existingCoupon = await get<any>("library/coupons", couponId);
      if (!existingCoupon) {
        const trackedCoupon = {
          id: couponId, recordType: "coupon", origin: "win",
          label: candidateRecord.label, couponText, selections,
          sport: clean(run.brief?.sport, 100) || null,
          country: clean(run.brief?.country, 100) || null,
          competition: clean(run.brief?.competition, 200) || null,
          combinedOdds: candidateRecord.combinedOdds,
          bookmaker: "Not placed — no bookmaker execution by WIN",
          outcome: "pending", candidateStatus: "QUALIFIED",
          winCandidateId: candidateId, runId: run.id,
          executionStatus: "not_placed_by_WIN",
          source: "WIN D6 structured coupon candidate",
          sourceType: "win_constructed",
          notes: "Research candidate only. It was not placed automatically. The user must confirm any real placement and provide settlement evidence before recording an outcome.",
          createdAt: run.createdAt || savedAt, updatedAt: savedAt,
          learningStatus: "awaiting_user_placement_and_settlement"
        };
        const write = await putIfNew("library/coupons", couponId, trackedCoupon);
        if (write.modified) {
          await putIfNew("library/coupon-history", couponId + ":created", {
            id: couponId + ":created", couponId, action: "created",
            outcome: "pending", at: trackedCoupon.createdAt, source: "win"
          });
        }
      }
      const currentCoupon = await get<any>("library/coupons", couponId);
      if (currentCoupon?.outcome === "pending")
        await put("library/pending-coupons", couponId, currentCoupon);
      qualifiedWinCouponsTracked++;
    }
  }

  const learningReport = (run.workers || []).find((x: any) => x.departmentId === "D7");
  if (learningReport?.report) {
    await saveLearningNote({
      id: run.id + ":D7:report",
      title: "D7 learning review — " + (run.brief?.event || run.id),
      note: learningReport.report, agentId: learningReport.workerId, runId: run.id,
      validationStatus: "candidate_for_validation", evidence: learningReport.citations || []
    });
    for (const [lessonIndex, lesson] of lessonsFromReport(learningReport.report).entries()) {
      if (typeof lesson?.lesson !== "string" || lesson.lesson.trim().length < 8) continue;
      await saveLearningNote({
        id: run.id + ":D7:lesson:" + lessonIndex,
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
    // Structured D6 candidates are tracked above; the full Master report remains in this research case.
  }
  return {
    savedAt, reportsArchived: reports.length, reportNotesSaved: reports.length,
    entityProfilesUpdated, observationsSaved, researchEvidenceSaved,
    winCouponCandidatesSaved, qualifiedWinCouponsTracked
  };
}

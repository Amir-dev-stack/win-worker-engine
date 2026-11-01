import { WIN_DEPARTMENTS, buildWorkerNetwork } from "./worker-org.mts";
import { reserveAIRequest, settleAIRequest, releaseAIRequest } from "./ai-budget.mts";

export type Citation = { title?: string; url?: string; snippet?: string };
export type WorkerReport = {
  workerId: string;
  role: string;
  phase: string;
  departmentId?: string;
  assignedTeams?: string[];
  status: "completed" | "failed";
  responseId?: string;
  report: string;
  citations: Citation[];
  error?: string;
  startedAt: string;
  completedAt: string;
};

type DepartmentAssignment = {
  id: string;
  role: string;
  assignment: string;
  requiresScoutingPack?: boolean;
};

const departmentAssignments: DepartmentAssignment[] = [
  {
    id: "D1",
    role: "Public Offer & Scouting Department Director",
    assignment: [
      "Run a bounded public-source pre-match offer and fixture scan for the requested objective and time window.",
      "Attempt official publicly accessible STS offer pages first. Do not log in, bypass bot checks, scrape hidden/private APIs, use cookies, or claim access to the user's account.",
      "For every candidate, identify participants, sport, country/competition when available, local start time/timezone, current event status, source URL, publication/update date, whether STS itself is the source, exact market label and exact price only if directly visible.",
      "Identify every club/team and named player explicitly supported by reliable sources or user-supplied material. For player names, connect the player to a club only when the relationship is supported. Never invent a squad or imply every player was individually researched.",
      "When a reliable source supplies stable club, athlete or event provider IDs and known aliases, preserve them in the routing JSON and dossiers. Never manufacture identifiers. Use provider IDs for stable cross-event identity; without a reliable ID, keep the entity's context and do not merge ambiguous same-name records.",
      "Separate OFFICIAL STS PUBLICLY OBSERVED, USER-SUPPLIED, THIRD-PARTY SCHEDULE ONLY, LOGIN-RESTRICTED, and NOT VERIFIED.",
      "Reject started, completed, cancelled, postponed, duplicate or ambiguous pre-match events. State scan limits and categories not checked.",
      "Do not label third-party prices as STS prices. Never invent odds.",
      "Return a candidate shortlist and the strongest coverage gaps. If there are no verified public STS prices, say so rather than pretending.",
      "At the end include exactly one machine-readable <WIN_CANDIDATES_JSON> block with JSON { \"events\": [ { \"event\": string, \"providerEventId\": string|null, \"sport\": string, \"country\": string, \"competition\": string, \"startTime\": string, \"eventStatus\": string, \"sourceUrl\": string, \"market\": string, \"selection\": string, \"odds\": string, \"clubs\": [ { \"name\": string, \"side\": string, \"providerId\": string|null, \"aliases\": [string] } ], \"players\": [ { \"name\": string, \"club\": string, \"providerId\": string|null, \"aliases\": [string] } ] } ] }. Preserve external provider IDs and aliases only when the source actually supplies them; never invent an ID. Include only confirmed or user-supplied entities; use [] when unknown. This block routes work but does not itself verify claims.",
    ].join("\n")
  },
  {
    id: "D2",
    role: "Sport Analysis Department Director",
    assignment: [
      "Own sport judgement for every candidate in the scouting pack. Activate the correct sport-specific branch only for sports actually present.",
      "Apply the relevant sport chief, country chief, competition chief and event chief checklists in the worker-network manifest. Do not force football metrics onto other sports.",
      "For each material selection assess event identity/context, recent form and opponent strength, confirmed versus unconfirmed availability, tactics/technical matchup, venue/surface/conditions and rest/travel where relevant.",
      "Cover the assigned form, availability, tactics, competition context, venue/conditions, sport statistics, Small Chef A FOR and Small Chef B AGAINST roles. These are named review assignments within this department request, not claims of separate API sessions.",
      "Write the strongest case FOR, strongest case AGAINST, realistic failure scenario, evidence grade STRONG/MODERATE/WEAK/INSUFFICIENT, and SHORTLIST/WATCHLIST/PASS/NOT VERIFIED verdict.",
      "Preserve disagreement. Do not use popularity, intuition or the number of supporting roles as evidence.",
      "For every identified club and named player, complete the relevant club/player agent checklist: match logs, team performance, role, minutes, goals/assists or sport-specific output, cards/discipline, injuries, availability, recent performance, opponent/context and source freshness. Mark missing data explicitly.",
      "Preserve stable external provider IDs and sourced aliases in each club/player dossier when available. Never invent IDs or merge ambiguous same-name people or clubs. Keep club affiliations dated so a player's profile can follow transfers when a reliable provider ID supports the link.",
      "Club agent dossier: assess sourced identity, manager/coaching, tactics, squad depth, recent results, opponent strength, home/away performance, injuries/suspensions and schedule congestion. Player agent dossier: record each relevant sourced match performance for every named player, including date, opponent, competition, starting/substitute status, minutes, position, goals/assists or sport-specific metrics, cards/fouls, injury/recovery/availability status and trend. Date and source every fact; use null/UNKNOWN for missing data.",
      "Include a <WIN_ENTITY_DOSSIERS_JSON> block with clubs and players arrays. Player entries must include name, club, profile, matchLog and evidenceRefs; matchLog rows include date, opponent, competition, minutes, starter, position, goals, assists, cards, injuryStatus, sportSpecificMetrics and evidenceRefs. Include only identified entities and actual sourced records; do not invent full squads or stats."
    ].join("\n"),
    requiresScoutingPack: true
  },
  {
    id: "D3",
    role: "Betting Markets & Settlement Department Director",
    assignment: [
      "Own the bet itself, separately from the sporting prediction.",
      "For every candidate, verify exact bookmaker/source, market label, selection, line/handicap, period, displayed price and capture time. Never assume a market exists on STS merely because another bookmaker offers it.",
      "Check regulation time versus overtime/extra time/shootout, push/void, half-win/half-loss, retirement/withdrawal, abandonment, postponement, participant changes and operator-specific settlement wording.",
      "Compare lower-variance or more forgiving alternatives only when actually available and documented. Do not call a market safer only because its odds are shorter.",
      "For any unavailable STS rules or unobserved price write BLOCKED / NOT VERIFIED and name the exact missing item."
    ].join("\n"),
    requiresScoutingPack: true
  },
  {
    id: "D4",
    role: "Quantitative Research & Evidence Department Director",
    assignment: [
      "Audit source authority, publication date separately from event date, retrieval time, sample size, recency, definitions, missing data and contradictions.",
      "Separate observed facts, third-party reports, inference, bookmaker-implied break-even probability and independent probability estimates.",
      "Calculate 1 / decimal odds only from a verified price and label it raw implied break-even probability before margin, not the true win chance.",
      "Do not claim EV, value, calibration, ROI or precise probabilities without a transparent, defensible basis. Use NOT ESTIMABLE when inputs are insufficient.",
      "Challenge tiny samples, cherry-picking, survivorship bias, data leakage and false precision."
    ].join("\n"),
    requiresScoutingPack: true
  },
  {
    id: "D5",
    role: "Strefa Inspiracji & Tipster Intelligence Department Director",
    assignment: [
      "Audit only public or user-supplied/authorized SmartBet, Strefa Inspiracji, tipster or coupon material included in the brief.",
      "Decompose each supplied tip into exact event, market, selection, line, odds and source. Verify historical results, odds, time window, sample size and settlement before reporting any hit rate or ROI.",
      "Popularity, tipster confidence and copied-pick counts are discovery signals only, not proof.",
      "If no inspiration material was supplied or accessible, mark NOT APPLICABLE with the reason. Never claim inspection of login-restricted material."
    ].join("\n")
  },
  {
    id: "D6",
    role: "Coupon Construction & Portfolio Risk Department Director",
    assignment: [
      "Compare the user's existing coupon, when supplied, against the latest candidate set and an independently constructed alternative.",
      "Construct only from legs that have passed event, sport, market, quantitative and integrity checks. If upstream evidence is missing, return WAIT / REMOVE / NO BET.",
      "Check duplicate and contradictory legs, same-event dependence, same-team/player exposure, shared venue/weather/roster/schedule/league and all common-cause risks.",
      "Compare fewer-leg alternatives, separate sport-specific coupons and singles. Do not force an odds target by adding a weak leg.",
      "Calculate combined odds only when every included decimal price is current and verified. For MAXIKOMBI/system bets, distinguish stake per combination from total stake and label unsupported payouts illustrative.",
      "Apply the WIN Low-Risk Gate as a hard veto. Never issue the final Global Master decision.",
      "Before constructing any coupon, review the supplied mandatory WIN library pack. Read BOTH winningCoupons and losingCoupons, relevant entityProfiles and validatedLessons. Identify reusable patterns and counterexamples, but do not copy picks blindly or overfit small samples. If either collection has zero matching records, say so honestly.",
      "Include a <WIN_LIBRARY_REVIEW_JSON>...</WIN_LIBRARY_REVIEW_JSON> block with JSON: { \"reviewed\": true, \"winningRecordIds\": [], \"losingRecordIds\": [], \"validatedLessonIds\": [], \"emptyCollections\": [], \"keyLearning\": [\"...\"] }. This receipt is mandatory even when there are zero records."
    ].join("\n"),
    requiresScoutingPack: true
  },
  {
    id: "D7",
    role: "Results, Learning & Knowledge Transfer Department Director",
    assignment: [
      "Review only the prior frozen forecasts/results/lesson records included in the brief. Do not invent a historical WIN track record.",
      "Keep pre-event forecast timestamps separate from post-event results. Verify sporting result separately from bookmaker market settlement.",
      "Identify validated sport-, market-, country- or competition-scoped lessons only when sample size supports them.",
      "If there are no applicable prior records, mark NOT APPLICABLE / NO VALIDATED HISTORICAL LESSONS AVAILABLE.",
      "Mandatory: examine the complete libraryReview pack before making any learning claim. Read both wins and losses, and distinguish validated lessons from candidate notes. Record which coupon examples and entity profiles were reviewed.",
      "Write a dated learning report and, where evidence warrants, append a <WIN_LESSONS_JSON>...</WIN_LESSONS_JSON> block with JSON { \"lessons\": [ { \"title\": string, \"scopeType\": string, \"scopeId\": string, \"lesson\": string, \"sampleSize\": number, \"evidenceRecordIds\": [string] } ] }. Never promote a proposed lesson to validated status automatically.",
      "Include the mandatory <WIN_LIBRARY_REVIEW_JSON> receipt with reviewed=true, winningRecordIds, losingRecordIds, validatedLessonIds and emptyCollections."
    ].join("\n")
  },
  {
    id: "D8",
    role: "Integrity, Source Governance & Responsible Play Director",
    assignment: [
      "Independently re-check material source claims, event status, price timestamps, market wording, source conflicts, calculations and omissions.",
      "Run the red-team/pre-mortem: strongest plausible losing scenario for each leg and a common-cause failure scenario for the whole coupon.",
      "Identify fabricated/unsupported facts, stale prices, ambiguous markets, unresolved FOR/AGAINST disagreement, missing participant facts and any misleading confidence claim.",
      "Protect privacy and access boundaries. No STS login bypass, no hidden APIs, no automated bet placement or stake change.",
      "Use neutral responsible-play language; never encourage chasing losses or risking essential funds. Block publication if a material concern remains."
    ].join("\n"),
    requiresScoutingPack: true
  }
];

const commonInstructions = [
  "You are one independent department director pass in WIN, a cautious sports-betting research system.",
  "This request is one separate OpenAI Responses API call. Do not claim that the sub-roles listed in your assignment are separate model sessions; they are assigned checks within your department pass.",
  "Do not invent facts, injuries, lineups, odds, markets, results, sources, source access or statistics. Distinguish CONFIRMED, REPORTED/UNCONFIRMED, UNKNOWN and CONTRADICTED.",
  "Use current, primary and reputable web sources where web search is enabled. Cite URLs and publication/update times. Record source retrieval time.",
  "A source URL alone is not proof that the relevant claim was verified. Include what the source actually supports.",
  "Never say an STS price was visible unless it was actually visible on an official/public STS source or supplied by the user. Third-party odds must be labelled third-party.",
  "Do not describe any bet as safe, guaranteed, fixed or 100%. Do not recommend staking more, chasing losses or risking essential funds.",
  "A required check with insufficient evidence must be reported as BLOCKED, PARTIAL, INSUFFICIENT or NOT ESTIMABLE, not passed.",
  "Return a structured report with: execution status, assigned team checklist, findings, evidence/citations and timestamps, FOR case where relevant, AGAINST case where relevant, unknowns/blockers, handoff recipient and provisional verdict.",
  "The brief includes a real libraryReview payload loaded from persistent storage. Every department must inspect relevant winning and losing human coupon cases and scoped agent/entity profiles before its assessment; distinguish verified library records from unverified notes. Do not invent a record or claim a collection was reviewed if its payload was not supplied.",
  "EVERY actual model worker pass that contributes to a coupon decision must independently review the supplied libraryReview payload and include its own machine-readable <WIN_LIBRARY_REVIEW_JSON> receipt with reviewed=true, winningRecordIds, losingRecordIds, validatedLessonIds, emptyCollections and keyLearning. This includes all eight department passes, all four adversarial debate reviewers and the Global Master. Receipts must list every supplied matching record ID in the winningCoupons, losingCoupons and validatedLessons arrays; do not claim to review data that was not supplied. Empty results are allowed but must be acknowledged. Missing or invalid receipt means the pass is blocked and the final decision must be NO BET.",
].join("\n");

function extractText(data: any): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output ?? []) for (const part of item.content ?? []) {
    if (part.type === "output_text" && part.text) chunks.push(part.text);
  }
  return chunks.join("\n");
}

function extractCitations(data: any): Citation[] {
  const found: Citation[] = [];
  for (const item of data.output ?? []) for (const part of item.content ?? []) {
    for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) {
      found.push({ title: a.title, url: a.url, snippet: a.snippet });
    }
  }
  for (const item of data.output ?? []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources ?? item.results ?? []) {
        if (source.url || source.source_website_url) {
          found.push({ title: source.title, url: source.url || source.source_website_url, snippet: source.snippet });
        }
      }
    }
  }
  return [...new Map(found.filter(x => x.url).map(x => [x.url, x])).values()];
}

async function askWorker(
  role: string,
  phase: string,
  brief: unknown,
  peerReports?: WorkerReport[],
  department?: DepartmentAssignment
): Promise<WorkerReport> {
  const startedAt = new Date().toISOString();
  const workerId = crypto.randomUUID();
  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  const configuredModel = Netlify.env.get("OPENAI_MODEL");
  const model = (phase === "scheduled_scout" || phase === "scheduled_learning") ? "gpt-6-luna" : configuredModel;
  const failed = (error: string): WorkerReport => ({
    workerId, role, phase, departmentId: department?.id, status: "failed",
    report: "", citations: [], error, startedAt, completedAt: new Date().toISOString()
  });

  if (!apiKey || !model) {
    return failed(!apiKey ? "OPENAI_API_KEY is not configured." :
      "OPENAI_MODEL is not configured. Set a model ID available to your API account.");
  }

  // Fail closed until the owner has configured provider-side spending controls
  // and rotated the API key. The Blobs ledger is an estimate, not a hard cap.
  if (Netlify.env.get("WIN_AI_BUDGET_APPROVED") !== "true") {
    return failed("WIN AI execution is disabled until the owner confirms a provider-side monthly spending limit, usage alerts, auto-recharge disabled, and API-key rotation. Set WIN_AI_BUDGET_APPROVED=true only after those controls are verified.");
  }

  const webSearch = (Netlify.env.get("WIN_ENABLE_WEB_SEARCH") ?? "true") === "true";
  const roleInstructions = department
    ? "DEPARTMENT: " + department.id + " — " + department.role + "\nASSIGNED DEPARTMENT CHECKS:\n" + department.assignment
    : "";
  const instructions = commonInstructions + "\n" + roleInstructions;
  let input: string;

  if (phase === "initial_scout") {
    input = "Original WIN brief:\n" + JSON.stringify(brief) +
      "\nPerform Department D1 Public Offer & Scouting first. Discover only bounded, relevant public candidates. Produce the machine-readable WIN_CANDIDATES_JSON block exactly as specified in your assignment. No other department conclusion is final at this stage.";
  } else if (phase === "scheduled_scout") {
    input = "Perform a small, time-bounded public fixture and pre-match offer scan for the next 24 hours across sports. Return up to 10 candidates only, exact source URLs and timestamps, and clear coverage gaps. Do not construct a coupon or make betting recommendations. Include the required WIN_CANDIDATES_JSON block.\\n" + JSON.stringify(brief);
  } else if (phase === "scheduled_learning") {
    input = "You are WIN's scheduled intensive-learning researcher. Complete ONE bounded research cycle using the exact learningTrack in the supplied brief. Focus on verifiable public information, source URLs and publication/retrieval dates. Distinguish sourced facts, hypotheses, inferences and unknowns. If the library contains no settled examples or usable historical odds, say so. Do not fabricate historical results, prices, sample sizes or strategy performance. Do not label a strategy validated or recommend a bet. Produce a concise report with: objective, scope, findings, evidence references, data gaps, falsifiable next steps, and a machine-readable <WIN_LEARNING_CYCLE_JSON> block containing {\"cycleType\":string,\"sport\":string|null,\"focus\":string,\"candidateStrategies\":[{\"name\":string,\"market\":string,\"hypothesis\":string,\"eligibilityRules\":[string],\"exclusions\":[string],\"requiredData\":[string],\"validationStatus\":\"candidate_for_validation\"}],\"coverageGaps\":[string],\"sourceRefs\":[string],\"validationBlockers\":[string]}. Empty arrays are acceptable. Candidate strategies remain hypotheses only.\\n" + JSON.stringify(brief);
  } else if (phase === "department") {
    input = "Original WIN brief plus the completed scouting handoff and dynamically built worker network. Perform only your assigned department review independently; do not copy conclusions from other department reports.\n" +
      JSON.stringify(brief);
  } else if (phase === "debate") {
    input = "Original WIN brief, worker-network manifest and all first-pass department reports follow. Challenge unsupported assumptions, correct mistakes, identify material disagreement and missing evidence. Do not simply agree. Re-check current/disputed claims.\nBRIEF AND NETWORK:\n" +
      JSON.stringify(brief) + "\nDEPARTMENT REPORTS:\n" + JSON.stringify(peerReports ?? []);
  } else {
    const departmentReports = (peerReports ?? []).filter(report => report.phase === "initial_scout" || report.phase === "department");
    const debateReports = (peerReports ?? []).filter(report => report.phase === "debate");
    input = "You are the SINGLE final decision authority in WIN. Review the original brief, worker-network hierarchy, all eight department reports, four adversarial reviews and the Low-Risk Gate. Do not treat report count or consensus as evidence. Decide whether any proposed coupon is actually publishable.\\n" +
      JSON.stringify({ brief, departmentReports, debateReports, mandatoryRules: [
        "Return exactly one final decision: BET, WAIT or NO BET.",
        "Choose NO BET when core evidence, event identity, current STS prices or exact market/settlement rules are missing, stale, contradictory or unverifiable.",
        "For a latest-coupon build, compare the eligible current candidate pool and any user-supplied existing coupon. Offer a WIN alternative only if each included leg passes all mandatory checks.",
        "For a coupon audit, compare the supplied coupon against independently researched alternatives, but do not treat an inaccessible private STS coupon as retrieved.",
        "Never force a combined-odds target by adding weak selections.",
        "Explain exact selections, source/price timestamps, settlement, weakest leg, correlation, common-cause risks and unverified claims.",
        "No bet placement, account login or stake action."
      ] });
  }

  let budgetId: string | null = null;
  let budgetSettled = false;
  try {
    const maxOutputTokens = (phase === "scheduled_scout" || phase === "scheduled_learning") ? 600 : 1000;
    const maxToolCalls = (phase === "scheduled_scout" || phase === "scheduled_learning") ? 1 : 2;
    const requestBudgetId = crypto.randomUUID();
    budgetId = requestBudgetId;
    const budget = await reserveAIRequest({
      id: requestBudgetId, model, phase, inputChars: instructions.length + input.length,
      maxOutputTokens, maxToolCalls,
      maxInputChars: (phase === "scheduled_scout" || phase === "scheduled_learning") ? 12000 : 25000
    });
    if (!budget.allowed) throw new Error(budget.reason);
    const body: any = { model, instructions, input, store: false, max_output_tokens: maxOutputTokens, max_tool_calls: maxToolCalls };
    if (webSearch) {
      body.tools = [{ type: "web_search", return_token_budget: "default" }];
      body.tool_choice = "required";
      body.include = ["web_search_call.action.sources"];
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000)
    });
    const data: any = await response.json();
    if (!response.ok) {
      if (response.status >= 500) await settleAIRequest(requestBudgetId, null, 0, true);
      else await releaseAIRequest(requestBudgetId, "OpenAI rejected request with HTTP " + response.status);
      budgetSettled = true;
      throw new Error(data.error?.message || "Responses API returned HTTP " + response.status);
    }
    const webSearchRequests = Number(data.tool_usage?.web_search?.num_requests ??
      (data.output ?? []).filter((item: any) => item.type === "web_search_call").length);
    await settleAIRequest(requestBudgetId, data.usage, webSearchRequests);
    budgetSettled = true;
    return {
      workerId, role, phase, departmentId: department?.id,
      assignedTeams: department ? WIN_DEPARTMENTS.find(d => d.id === department.id)?.teams : undefined,
      status: "completed", responseId: data.id,
      report: extractText(data), citations: extractCitations(data),
      startedAt, completedAt: new Date().toISOString()
    };
  } catch (error) {
    if (budgetId && !budgetSettled) {
      try { await settleAIRequest(budgetId, null, 0, true); } catch { /* retain reservation if storage is unavailable */ }
    }
    return failed(String(error));
  }
}

export async function runScheduledScout(brief: any) {
  const scoutDepartment = departmentAssignments[0];
  return askWorker("WIN Scheduled Public Offer & Scouting", "scheduled_scout", brief, undefined, scoutDepartment);
}

export async function runScheduledLearning(brief: any) {
  return askWorker("WIN Scheduled Intensive Learning Researcher", "scheduled_learning", brief);
}

export async function runIndependentWorkers(brief: any, runId: string) {
  // D1 runs first so its candidate inventory can create the actual sport/country/competition/event task graph.
  const scoutDepartment = departmentAssignments[0];
  const scout = await askWorker(scoutDepartment.role, "initial_scout", brief, undefined, scoutDepartment);
  const workerNetwork = buildWorkerNetwork(brief, scout.report, runId);
  const routedBrief = {
    ...brief,
    scoutingReport: scout.report,
    workerNetwork,
    workerNetworkExecutionDisclosure: workerNetwork.executionDisclosure
  };

  const remainingDepartments = departmentAssignments.slice(1);
  const rest = await Promise.all(remainingDepartments.map(department =>
    askWorker(department.role, "department", routedBrief, undefined, department)
  ));
  const reports = [scout, ...rest];
  const failed = reports.filter(r => r.status !== "completed" || !r.report.trim());
  const departmentStatuses = WIN_DEPARTMENTS.map(department => {
    const report = reports.find(r => r.departmentId === department.id);
    return {
      id: department.id, name: department.name, director: department.director,
      status: !report ? "not_run" : report.status === "completed" && report.report.trim() ? "completed" : "failed",
      workerId: report?.workerId, responseId: report?.responseId,
      blocker: report?.error || (!report?.report.trim() ? "Empty report." : undefined)
    };
  });

  return {
    reports,
    workerNetwork: { ...workerNetwork, departmentStatuses, failedDepartmentIds: failed.map(x => x.departmentId) }
  };
}

export async function runDebate(brief: unknown, reports: WorkerReport[]) {
  const roles = [
    "Independent FOR-side challenger / Small Chef A review",
    "Independent AGAINST-side challenger / Small Chef B review",
    "Markets, price and settlement red-team auditor",
    "Quantitative evidence and correlation challenger"
  ];
  return Promise.all(roles.map(role => askWorker(role, "debate", { brief, departmentReports: reports }, reports)));
}

export async function runGlobalMaster(brief: unknown, reports: WorkerReport[], debate: WorkerReport[], workerNetwork: unknown) {
  return askWorker("WIN Global Master — single final decision authority", "final", {
    originalBrief: brief, workerNetwork
  }, [...reports, ...debate]);
}

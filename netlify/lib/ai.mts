import { runWinAgent } from "./agents-sdk.mts";
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
      "For every identified club, named player and named manager/coach, complete the relevant persistent entity-agent checklist: match logs, team performance, role, minutes, goals/assists or sport-specific output, cards/discipline, injuries, availability, recent performance, opponent/context and source freshness. Mark missing data explicitly.",
      "Preserve stable external provider IDs and sourced aliases in each club/player dossier when available. Never invent IDs or merge ambiguous same-name people or clubs. Keep club affiliations dated so a player's profile can follow transfers when a reliable provider ID supports the link.",
      "Club agent dossier: assess sourced identity, manager/coaching, tactics, squad depth, recent results, opponent strength, home/away performance, injuries/suspensions and schedule congestion. Player agent dossier: record each relevant sourced match performance for every named player, including date, opponent, competition, starting/substitute status, minutes, position, goals/assists or sport-specific metrics, cards/fouls, injury/recovery/availability status and trend. Date and source every fact; use null/UNKNOWN for missing data.",
      "Include a <WIN_ENTITY_DOSSIERS_JSON> block with clubs, players and managers arrays. Player entries must include name, club, profile, matchLog and evidenceRefs; matchLog rows include date, opponent, competition, minutes, starter, position, goals, assists, cards, injuryStatus, sportSpecificMetrics and evidenceRefs. Manager entries must include name, club/team, tenure, tacticalIdentity, decisionHistory and evidence. Include only identified entities and actual sourced records; do not invent full squads, coaches or stats.",
      "Also include a <WIN_RESEARCH_EVIDENCE_JSON> block with JSON { records: [ { sport, country, competition, eventId, entityId, entityType, domain, metric, value, unit, sourceName, sourceUrl, publishedAt, retrievedAt, validFrom, validTo, freshnessTtlHours, evidenceGrade, confidence, evidenceRefs } ] }. Emit one row per sourced fact/metric; unknown values stay null and missing source references must be explicit. Use sport-specific metrics from the registry, not football-only fields."
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
      "Actively search the public web for human betting behaviour and publicly shared coupons/picks relevant to the sports and time window in the brief. Search public community pages, open betting forums, public Reddit discussions, public X posts where visible, public tipster leaderboards, public coupon-sharing feeds, public video descriptions and bookmaker social/community pages. Prioritize original posts and open datasets over affiliate roundups.",
      "Use the source catalog as discovery guidance: BetBuddyRank open leaderboard/JSON/RSS and original X-post links; OLBG public tipster community; Superbet Supersocial public pages; Tipsto; 1x2.social; BetSlip Social; Reddit public betting communities; public X posts; YouTube public descriptions; STS Strefa Inspiracji. A listed source is not permission to crawl it.",
      "Capture a human coupon only when the actual selections are visible in a publicly accessible source or supplied by the user. Record source URL, author/handle only when publicly displayed and necessary, publication timestamp, retrieval timestamp, sport, event, market, selection, line, odds, bookmaker, coupon legs, combined odds and whether the item is a complete coupon, a single pick, a promotional example or a demo. Never fabricate missing fields.",
      "Separate ORIGINAL HUMAN COUPON, SINGLE HUMAN PICK, COMMUNITY CONSENSUS, TIPSTER PROMOTION, BOOKMAKER MARKETING, DEMO/SAMPLE CONTENT and MODEL-GENERATED PICK. Never treat a marketing graphic, mock example, affiliate ad or model forecast as a real bettor's placed coupon.",
      "Preserve exact source links and a minimal evidence excerpt; do not copy private messages, personal data, paywalled/premium content or material from closed groups. Do not log in, reuse cookies, bypass bot checks, paywalls, CAPTCHA or platform restrictions. Follow robots.txt, official APIs, rate limits and platform terms; if automation is not authorized, use public web research and manual import only.",
      "Do not identify a tipster as profitable from screenshots or selected wins. Track every available pick in chronological order, including losses, edits/deletions where reliably recorded, posted odds, price timestamp, sample size, ROI, closing-line value and settlement evidence. Mark incomplete histories and survivorship bias.",
      "Decompose each coupon into exact event, market, selection, line, odds and source. Verify event result separately from bookmaker market settlement, including pushes, voids, partial settlements, extra time and period-specific rules. A coupon starts pending; only independently evidenced settlement may classify it as won/lost/void.",
      "Compare human choices by sport, league, market family, odds band, coupon leg count, same-event Bet Builder, accumulator, system bet, mixed-sport composition, live/pre-match status and stated reasoning. Popularity and copied-pick counts are discovery signals, not evidence of predictive edge.",
      "Output an import-ready <WIN_HUMAN_COUPONS_JSON> block with { \"coupons\": [ { \"sourceId\": string, \"sourceUrl\": string, \"tipsterName\": string|null, \"publishedAt\": string|null, \"retrievedAt\": string, \"sport\": string|null, \"couponText\": string, \"couponType\": \"single_pick\"|\"accumulator\"|\"bet_builder\"|\"system\"|\"mixed_sport\"|\"unknown\", \"selections\": [ { \"event\": string, \"market\": string, \"selection\": string, \"line\": string|null, \"odds\": number|null, \"bookmaker\": string|null } ], \"combinedOdds\": number|null, \"contentClass\": \"original human coupon\"|\"single human pick\"|\"community consensus\"|\"tipster promotion\"|\"bookmaker marketing\"|\"demo/sample content\"|\"model-generated pick\", \"settlementStatus\": \"pending\"|\"won\"|\"lost\"|\"void\"|\"unknown\", \"evidenceRefs\": [string], \"limitations\": [string] } ] }. Include only actual observed or supplied records; do not invent odds or settlement. Use an empty array if none qualify.",
      "Report source-by-source search coverage, inaccessible sources, API/permission blockers, and how many genuine coupons versus picks, promos and demos were observed. If no inspiration material was accessible, explain the search and limitations rather than claiming it was unavailable without checking."
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
      "Apply the WIN Low-Risk Gate as a hard eligibility check. Never issue or imply the user\u2019s final betting decision.",
      "At the end include exactly one <WIN_COUPONS_JSON> block with { \"coupons\": [ { \"id\": string, \"label\": string, \"status\": \"QUALIFIED\"|\"BLOCKED\", \"legs\": [ { \"event\": string, \"eventId\": string|null, \"startTime\": string|null, \"market\": string, \"selection\": string, \"odds\": number|null, \"oddsSource\": string|null, \"sourceUrl\": string|null, \"observedAt\": string|null, \"settlementRule\": string|null, \"evidenceRefs\": [string], \"checksPassed\": [string], \"blockers\": [string] } ], \"combinedOdds\": number|null, \"riskFactors\": [string], \"correlationNotes\": [string], \"blockers\": [string] } ] }. Only set status QUALIFIED if every leg has confirmed event identity, future pre-match status, exact market/selection, current verified decimal odds, source URL, observed timestamp, and settlement rules, and D2-D5/D8 checks do not block it. Otherwise status BLOCKED and list every missing item. Never invent IDs, prices, timestamps, source URLs or settlement rules. Include an empty coupons array if no defensible candidate exists.",
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
  "The brief may include a modelLabResearchPack built from isolated Model Lab evidence and public-source discovery metadata. Review it when present. It contains provider-import counts, historical consensus market calibration, static multi-book odds snapshots, settled sample simulations and review-only source candidates. Treat it as a bounded evidence index, not as a WIN predictive model or proof of betting edge. Source candidates are not approved or connected: never claim they are usable until licence, provenance, schema and terms have been reviewed and a provider adapter is explicitly enabled. Consensus fair probabilities are not bookmaker execution prices; static odds snapshots are not live. Never infer missing market prices or results. Human Coupon Lab data is not included in this pack and must never be copied into Model Lab training. The brief includes a real libraryReview payload loaded from persistent storage. Before researching, inspect prior agentObservations, archived agentNotes and scoped entityProfiles for the same sport, country, competition, club, player, event and specialist. Reuse supported findings and linked source references; do not repeat the same stable-fact research when a useful record already exists. Check timestamps and re-verify time-sensitive facts such as odds, lineups, injuries, availability, event status and schedules close to the event. Preserve new findings, citations, source dates, retrieval timestamps and uncertainty in the report so they can be archived for the next run. Every department must also inspect relevant winning and losing human coupon cases and validated lessons; distinguish verified library records from unverified notes. Do not invent a record or claim a collection was reviewed if its payload was not supplied.",
  "EVERY actual model worker pass that contributes to a coupon decision must independently review the supplied libraryReview payload and include its own machine-readable <WIN_LIBRARY_REVIEW_JSON> receipt with reviewed=true, winningRecordIds, losingRecordIds, validatedLessonIds, emptyCollections and keyLearning. This includes all eight department passes, all four adversarial debate reviewers and the Global Master. Receipts must list every supplied matching record ID in the winningCoupons, losingCoupons and validatedLessons arrays; do not claim to review data that was not supplied. Empty results are allowed but must be acknowledged. Missing or invalid receipt means the pass is blocked. Expose the blocker to the user; do not issue a betting decision.",
].join("\n");


function compactPromptValue(value: any, depth = 0, arrayLimit = 12, fieldName = ""): any {
  if (typeof value === "string") {
    const limit = 1400;
    return value.length > limit ? value.slice(0, limit) + " [TRUNCATED FOR REQUEST BUDGET]" : value;
  }
  if (Array.isArray(value)) {
    const receiptCollection = ["winningCoupons", "losingCoupons", "validatedLessons"].includes(fieldName);
    if (receiptCollection) return value.map((item: any) => ({ id: item?.id }));
    return value.slice(0, arrayLimit).map(item => compactPromptValue(item, depth + 1, arrayLimit));
  }
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    const entries = Object.entries(value);
    for (const [key, child] of entries) {
      if (["rawReport", "sourceSnapshot", "debugTrace", "fullHtml"].includes(key)) continue;
      if (depth > 5 && !["id", "name", "status", "outcome", "validationStatus"].includes(key)) continue;
      out[key] = compactPromptValue(child, depth + 1, arrayLimit, key);
    }
    return out;
  }
  return value;
}
function promptJson(value: any, maxChars: number): string {
  for (const arrayLimit of [12, 8, 5, 3, 1]) {
    const serialized = JSON.stringify(compactPromptValue(value, 0, arrayLimit));
    if (serialized.length <= maxChars) return serialized;
  }
  const serialized = JSON.stringify(compactPromptValue(value, 0, 1));
  if (serialized.length <= maxChars) return serialized;
  throw new Error("WIN request packet cannot fit its safe size after compaction (" + serialized.length + " characters; target " + maxChars + "). Split the work instead of dropping required evidence.");
}

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
  const model = configuredModel;
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
    input = "Original WIN brief:\n" + promptJson(brief, phase === "scheduled_learning" || phase === "scheduled_scout" ? 3000 : 8500) +
      "\nPerform Department D1 Public Offer & Scouting first. Discover only bounded, relevant public candidates. Produce the machine-readable WIN_CANDIDATES_JSON block exactly as specified in your assignment. No other department conclusion is final at this stage.";
  } else if (phase === "scheduled_scout") {
    input = "Perform a small, time-bounded public fixture and pre-match offer scan for the next 24 hours across sports. Return up to 10 candidates only, exact source URLs and timestamps, and clear coverage gaps. Do not construct a coupon or make betting recommendations. Include the required WIN_CANDIDATES_JSON block.\n" + promptJson(brief, 3000);
  } else if (phase === "scheduled_learning") {
    const entityTaskInstruction = brief?.agentTask
    const entityTaskInstruction = brief?.agentTask
      ? `This cycle must execute ONE separately queued persistent entity agent. Scope: ${JSON.stringify(brief.agentTask)}. Research only this entity/scope. Use public reliable sources, preserve IDs and aliases only when sourced, and store unknowns rather than guessing. Return a machine-readable <WIN_ENTITY_AGENT_JSON> block containing {"agentId":string,"scope":object,"profileSummary":string,"facts":[{"claim":string,"sourceUrl":string,"publishedAt":string|null,"retrievedAt":string,"confidence":"high"|"medium"|"low"}],"unknowns":[string],"nextResearch":[string]}. agentId must exactly match the supplied task. Do not mark the profile validated. Also return the required WIN_LEARNING_CYCLE_JSON block with cycleType=entity_agent_maintenance and empty candidateStrategies unless a separate falsifiable hypothesis is genuinely supported.`
      : "Complete ONE bounded research cycle using the exact learningTrack in the supplied brief.";
    input = "You are WIN's scheduled intensive-learning researcher. " + entityTaskInstruction + " First inspect the supplied libraryReview, including prior agentObservations, archived agentNotes, entityProfiles, previous learningCycles, strategyCandidates and backtestRuns, to reuse existing evidence and avoid repeating completed research; refresh volatile facts and explicitly log what was newly discovered. Review modelLabResearchPack when present, but treat market consensus as a benchmark only, not an independent WIN model. Treat all candidate strategies and retrospective backtests as unvalidated. Focus on verifiable public information, source URLs and publication/retrieval dates. Distinguish sourced facts, hypotheses, inferences and unknowns. If the library contains no settled examples or usable historical odds, say so. Do not fabricate historical results, prices, sample sizes or strategy performance. Do not label a strategy validated or recommend a bet. Produce a concise report with: objective, scope, findings, evidence references, data gaps, falsifiable next steps, and a machine-readable <WIN_LEARNING_CYCLE_JSON> block containing {\"cycleType\":string,\"sport\":string|null,\"focus\":string,\"candidateStrategies\":[{\"name\":string,\"market\":string,\"hypothesis\":string,\"eligibilityRules\":[string],\"exclusions\":[string],\"requiredData\":[string],\"validationStatus\":\"candidate_for_validation\"}],\"coverageGaps\":[string],\"sourceRefs\":[string],\"validationBlockers\":[string]}. Empty arrays are acceptable. Candidate strategies remain hypotheses only. Also always return a <WIN_AGENT_PROPOSALS_JSON> block containing {\"proposals\":[{\"name\":string,\"role\":string,\"scope\":object,\"parentDepartment\":string,\"mission\":string,\"requiredData\":[string],\"evaluationPlan\":string,\"evidenceRefs\":[string],\"riskControls\":[string]}]}. Propose at most three new specialist agent candidates only when a documented coverage gap justifies them; otherwise return {\"proposals\":[]}. Evidence references must be public HTTPS URLs. Proposals are candidates only: do not claim an agent has been created, tested, validated, or promoted.\n" + promptJson(brief, 3000);
  } else if (phase === "department") {
    input = "Original WIN brief plus the completed scouting handoff and dynamically built worker network. Perform only your assigned department review independently; do not copy conclusions from other department reports.\n" +
      promptJson(brief, 8500);
  } else if (phase === "debate") {
    input = "Original WIN brief, worker-network manifest and all first-pass department reports follow. Challenge unsupported assumptions, correct mistakes, identify material disagreement and missing evidence. Do not simply agree. Re-check current/disputed claims.\nBRIEF AND NETWORK:\n" +
      promptJson(brief, 3500) + "\nDEPARTMENT REPORTS:\n" + promptJson((peerReports ?? []).map(r => ({role:r.role,departmentId:r.departmentId,status:r.status,error:r.error,report:(r.report||"").slice(0,650),citations:(r.citations||[]).slice(0,3)})), 8500);
  } else {
    const departmentReports = (peerReports ?? []).filter(report => report.phase === "initial_scout" || report.phase === "department").map(r => ({role:r.role,departmentId:r.departmentId,status:r.status,error:r.error,report:(r.report||"").slice(0,900),citations:(r.citations||[]).slice(0,4)}));
    const debateReports = (peerReports ?? []).filter(report => report.phase === "debate").map(r => ({role:r.role,status:r.status,error:r.error,report:(r.report||"").slice(0,900),citations:(r.citations||[]).slice(0,4)}));
    input = "You are WIN Global Master, an independent RISK ASSESSOR ONLY. You do not make the user\u2019s betting decision and have no authority to approve, reject, publish, hide or place a bet. Review the original brief, worker-network hierarchy, all eight department reports, four adversarial reviews and coupon-construction output. Do not treat report count or consensus as evidence. Assess risk for each constructed coupon and report an overall risk percentage.\n" +
      promptJson({ brief, departmentReports, debateReports, mandatoryRules: [
        "Never output BET, WAIT or NO BET, and never tell the user whether to place the bet.",
        "Return exactly one <WIN_RISK_ASSESSMENT_JSON> block with { \"overallRiskPercent\": number|null, \"riskScale\": \"heuristic_0_to_100_higher_is_riskier\", \"isCalibratedLossProbability\": false, \"method\": string, \"components\": [ { \"factor\": string, \"riskPercent\": number|null, \"weightPercent\": number, \"evidence\": [string] } ], \"topRiskDrivers\": [string], \"uncertainties\": [string], \"couponRisks\": [ { \"couponId\": string, \"riskPercent\": number|null, \"reason\": [string] } ] }.",
        "The overallRiskPercent is a transparent heuristic risk score from 0 to 100, not a probability of losing or winning. Do not claim statistical calibration. If evidence is insufficient to score, return null rather than inventing a number.",
        "Explain scoring factors, weights and evidence. Missing/stale odds, unknown settlement, unresolved adverse findings, weak evidence, high correlation, lineup uncertainty and source quality should increase risk or remain explicitly unscored.",
        "Do not invent source checks, prices, statistics, calibration or risk precision. No bet placement, account login, stake advice or final decision.",
        "Return a concise human-readable explanation followed by the single machine-readable risk block."
      ] }, 9000);
  }

  const maxInputChars = (phase === "scheduled_scout" || phase === "scheduled_learning") ? 12000 : 25000;
  const actualInputChars = instructions.length + input.length;
  if (actualInputChars > maxInputChars) {
    return failed("WIN compact request preflight blocked " + phase + ": " + actualInputChars + " characters exceeds " + maxInputChars + ". No API request was sent.");
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
      maxInputChars
    });
    if (!budget.allowed) throw new Error(budget.reason);
    const sdkResult = await runWinAgent({
      name: "WIN " + role,
      instructions,
      prompt: input,
      model,
      apiKey,
      webSearch,
      maxTurns: 2
    });
    await settleAIRequest(requestBudgetId, sdkResult.usage, sdkResult.webSearchRequests);
    budgetSettled = true;
    const sdkOutput = sdkResult.rawResponses.flatMap((response: any) => response.output ?? []);
    return {
      workerId, role, phase, departmentId: department?.id,
      assignedTeams: department ? WIN_DEPARTMENTS.find(d => d.id === department.id)?.teams : undefined,
      status: "completed", responseId: sdkResult.responseId,
      report: sdkResult.finalOutput,
      citations: extractCitations({ output: sdkOutput }),
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
  return askWorker("WIN Global Master — risk assessment only; user retains final decision", "final", {
    originalBrief: brief, workerNetwork
  }, [...reports, ...debate]);
}

import { listSportCapabilities, getSportCapability, normalizeSportName } from "./sport-registry.mts";
export type WorkerDepartment = {
  id: string;
  name: string;
  director: string;
  purpose: string;
  required: boolean;
  teams: string[];
  handoffTo: string[];
};

export const WIN_DEPARTMENTS: WorkerDepartment[] = [
  {
    id: "D1", name: "Public Offer & Scouting", director: "Public Offer Intelligence Director",
    purpose: "Discover and verify the bounded event universe, current public STS availability, event status, exact observed markets, prices and coverage gaps.",
    required: true,
    teams: [
      "STS Coverage Governor / Discipline Registry Master",
      "Public STS Offer Capture Agent / Scanner",
      "Country Scouting Master — Country Scout A (coverage) and Country Scout B (challenge)",
      "League & Competition Scouting Master — League Scout A (coverage) and League Scout B (quality/format challenge)",
      "Match & Event Scouting Master — Fixture Scout A (candidate) and Fixture Scout B (identity/time/status/duplicate verification)",
      "Data Coverage Scout",
      "Scouting Challenge Agent",
      "Market Availability Scout"
    ],
    handoffTo: ["D2", "D3", "D4", "D5", "D8"]
  },
  {
    id: "D2", name: "Sport Analysis", director: "Chief Sport Analysis Director",
    purpose: "Assess each event with the correct sport-specific blueprint, participant availability, matchup, context and independent FOR/AGAINST reasoning.",
    required: true,
    teams: [
      "Dynamic Sport / Discipline Master for each represented sport",
      "Persistent Club / Team Agent for each identified club",
      "Persistent Player / Athlete Agent for each identified athlete",
      "Persistent Manager / Coach Agent for each identified manager or coach",
      "Performance & Form Upper Agent",
      "Availability & Context Upper Agent",
      "Competition & Event Context Upper Agent",
      "Tactical / Technical Upper Agent",
      "Sport-specific Statistics and Conditions specialists",
      "Small Chef A — strongest evidence-based FOR case",
      "Small Chef B — strongest evidence-based AGAINST case"
    ],
    handoffTo: ["D3", "D4", "D6", "D8"]
  },
  {
    id: "D3", name: "Betting Markets & Settlement", director: "STS Bet Types & Market Director",
    purpose: "Verify exact market, selection, line, period, price provenance, alternative markets and settlement rules.",
    required: true,
    teams: [
      "STS Bet Types & Market Master",
      "Sport Market Specialists",
      "Market Mapping Team",
      "Settlement & Rules Team",
      "Price Snapshot Analyst",
      "Bet Builder & System Specialist"
    ],
    handoffTo: ["D4", "D6", "D8"]
  },
  {
    id: "D4", name: "Quantitative Research & Evidence", director: "Quantitative Research Director",
    purpose: "Audit source quality, sample sizes, statistics, break-even prices, probability reasoning, uncertainty and value claims.",
    required: true,
    teams: [
      "Data Source Verification Team",
      "Statistical Research Team",
      "Probability & Calibration Team",
      "Price & Value Team",
      "Uncertainty & Sample Quality Team"
    ],
    handoffTo: ["D6", "D8"]
  },
  {
    id: "D5", name: "Strefa Inspiracji & Tipster Intelligence", director: "Inspiration Intelligence Director",
    purpose: "Audit supplied or publicly accessible SmartBet, Strefa Inspiracji, tipster and coupon material; never imply access to login-restricted content.",
    required: false,
    teams: [
      "SmartBet Analysis Team",
      "Inspiration Source Verification Team",
      "Public Tip & Popular Coupon Scout",
      "Coupon Decomposition Team",
      "Historical Performance Auditor",
      "Contrarian Inspiration Reviewer",
      "Inspiration Learning Liaison"
    ],
    handoffTo: ["D2", "D4", "D6", "D8"]
  },
  {
    id: "D6", name: "Coupon Construction & Portfolio Risk", director: "Coupon & Portfolio Director",
    purpose: "Compare existing and alternative coupons, test correlation and failure scenarios, construct eligible legs and apply the WIN Low-Risk Gate.",
    required: true,
    teams: [
      "Coupon Builder",
      "Coupon & Portfolio Auditor",
      "Correlation & Failure-Mode Analyst",
      "Alternative Construction Analyst",
      "System Bet / MAXIKOMBI Analyst",
      "WIN Low-Risk Gate"
    ],
    handoffTo: ["D8", "GLOBAL_MASTER"]
  },
  {
    id: "D7", name: "Results, Learning & Knowledge Transfer", director: "Learning & Performance Director",
    purpose: "Review available prior forecasts, results and validated lessons; keep pre-event forecasts separate from post-event outcomes.",
    required: true,
    teams: [
      "Outcome Review Master",
      "Prediction Audit Master",
      "Calibration & Performance Master",
      "Root-Cause & Improvement Master",
      "Knowledge Transfer / Teaching Master",
      "Sport Learning Agents",
      "Learning Ledger Administrator"
    ],
    handoffTo: ["D2", "D3", "D4", "GLOBAL_MASTER"]
  },
  {
    id: "D8", name: "Integrity, Source Governance & Responsible Play", director: "Integrity & Responsible Play Officer",
    purpose: "Independently challenge provenance, freshness, source conflicts, arithmetic, common-cause scenarios, privacy and responsible-play boundaries.",
    required: true,
    teams: [
      "Source Provenance Auditor",
      "Source Conflict & Freshness Reviewer",
      "Red-Team / Pre-Mortem Reviewer",
      "Responsible Play & Privacy Officer"
    ],
    handoffTo: ["GLOBAL_MASTER"]
  }
];

export const IMWFD_TIERS = [
  { id: "T0", name: "Worker Network Director", responsibility: "Creates the task graph, enforces scope, IDs, status tracking, deadlines, quotas and handoffs." },
  { id: "T1", name: "Sport / Discipline Chief", responsibility: "One sport-specific branch per distinct sport present in the verified or supplied event pool." },
  { id: "T2", name: "Country Chief", responsibility: "One SPORT × COUNTRY branch where country is actually identified." },
  { id: "T3", name: "League / Competition Chief", responsibility: "One SPORT × COUNTRY × competition/tour/series branch where the competition is actually identified." },
  { id: "T4", name: "Match / Event Chief", responsibility: "One isolated dossier per verified or user-supplied event." },
  { id: "T5", name: "Independent Specialist Workers", responsibility: "Event identity, form, availability, tactics, competition context, venue/conditions, source/data quality, FOR, AGAINST, red-team, sport statistics and observed price." }
] as const;

export const EVENT_SPECIALISTS = [
  { id: "event_identity", name: "Event Identity & Schedule Worker", department: "D1", purpose: "Participants, competition, start time, timezone, event status, postponement and duplicates." },
  { id: "club_dossier", name: "Club / Team Intelligence Agent", department: "D2", purpose: "Club history, squad depth, manager/coaching, tactics, formations, transfers where relevant, match results, team metrics, home/away splits, injuries, suspensions, workload, schedule and source quality." },
  { id: "player_dossier", name: "Player / Athlete Intelligence Agent", department: "D2", purpose: "Individual match-by-match record, starts, minutes, role, goals/assists or sport-specific output, cards/discipline, injury/recovery, availability, performance trends, opponent context and source freshness." },
  { id: "form", name: "Form & Performance Worker", department: "D2", purpose: "Recent results, opponent strength, sport-specific metrics, sample size and recency." },
  { id: "availability", name: "Availability Worker", department: "D2", purpose: "Confirmed lineups, injuries, suspensions, withdrawals, roster and participation." },
  { id: "tactics", name: "Tactical / Technical Worker", department: "D2", purpose: "Styles, matchup, strategy and sport-specific performance interactions." },
  { id: "competition_context", name: "Competition Context Worker", department: "D2", purpose: "Tournament stage, standings, incentives, qualification, bracket and event format." },
  { id: "venue_conditions", name: "Venue & Conditions Worker", department: "D2", purpose: "Venue, surface, weather, travel, rest and congestion where relevant." },
  { id: "data_quality", name: "Data Quality & Source Worker", department: "D4", purpose: "Authority, timestamps, contradictions, gaps, sample reliability and provenance." },
  { id: "small_chef_a", name: "Independent FOR Worker / Small Chef A", department: "D2", purpose: "Build the strongest evidence-based argument supporting the proposed selection." },
  { id: "small_chef_b", name: "Independent AGAINST Worker / Small Chef B", department: "D2", purpose: "Build the strongest evidence-based opposing argument and identify realistic losing scenarios." },
  { id: "contrarian", name: "Contrarian / Red-Team Worker", department: "D8", purpose: "Falsify apparent edges, expose hidden assumptions and overlooked alternatives." },
  { id: "sport_statistics", name: "Sport-Specific Statistics Worker", department: "D4", purpose: "Choose metrics appropriate to the actual sport, competition and event format." },
  { id: "price_context", name: "Price Context Worker", department: "D3", purpose: "Capture only directly observed prices, bookmaker, market, line and capture time." }
] as const;

export type WorkerNode = {
  id: string;
  parentId: string | null;
  tier: string;
  name: string;
  scope: Record<string, string>;
  status: string;
  executionMode: "orchestrator" | "department_api_request" | "covered_by_department_checklist" | "queued_independent_api_request";
  assignedDepartment?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "unspecified";
}
function extractCandidateBlock(report: string): any[] {
  const startTag = "<WIN_CANDIDATES_JSON>";
  const endTag = "</WIN_CANDIDATES_JSON>";
  const start = report.indexOf(startTag);
  const end = report.indexOf(endTag);
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(report.slice(start + startTag.length, end).trim());
    return Array.isArray(parsed?.events) ? parsed.events.slice(0, 40) : [];
  } catch { return []; }
}
function normalizeCandidate(value: any, source: string, index: number) {
  const event = text(value?.event || value?.name || value?.match);
  if (event.length < 3) return null;
  const sport = normalizeSportName(value?.sport);
  const country = text(value?.country);
  const competition = text(value?.competition || value?.league || value?.tournament);
  const startTime = text(value?.startTime || value?.kickoff || value?.commenceTime);
  const status = text(value?.eventStatus || value?.status) || "unknown";
  const url = text(value?.sourceUrl || value?.url);
  const rawClubs = [value?.homeClub, value?.awayClub, ...(Array.isArray(value?.clubs) ? value.clubs : [])];
  const clubs = rawClubs.map((club: any) => typeof club === "string"
    ? { name: text(club), side: "", providerId: "", aliases: [] }
    : {
        name: text(club?.name || club?.club), side: text(club?.side || club?.role),
        providerId: text(club?.providerId || club?.externalId || club?.id),
        aliases: Array.isArray(club?.aliases) ? club.aliases.map(text).filter(Boolean).slice(0, 20) : []
      }).filter((club: any) => club.name).slice(0, 20);
  const players = (Array.isArray(value?.players) ? value.players : []).map((player: any) => typeof player === "string"
    ? { name: text(player), club: "", providerId: "", aliases: [] }
    : {
        name: text(player?.name || player?.player), club: text(player?.club || player?.team),
        providerId: text(player?.providerId || player?.externalId || player?.id),
        aliases: Array.isArray(player?.aliases) ? player.aliases.map(text).filter(Boolean).slice(0, 20) : []
      }).filter((player: any) => player.name).slice(0, 100);
  const managers = (Array.isArray(value?.managers) ? value.managers : (value?.manager ? [value.manager] : [])).map((manager: any) => typeof manager === "string"
    ? { name: text(manager), club: "", providerId: "", aliases: [] }
    : {
        name: text(manager?.name || manager?.manager || manager?.coach),
        club: text(manager?.club || manager?.team),
        providerId: text(manager?.providerId || manager?.externalId || manager?.id),
        aliases: Array.isArray(manager?.aliases) ? manager.aliases.map(text).filter(Boolean).slice(0, 20) : []
      }).filter((manager: any) => manager.name).slice(0, 30);
  const sourceType = source === "scout_report" ? "SCOUT_REPORT_NEEDS_SECONDARY_VERIFICATION" : "USER_SUPPLIED";
  const providerEventId = text(value?.providerEventId || value?.eventId || value?.id);
  const eventIdentity = providerEventId
    ? [sport, "provider", providerEventId].filter(Boolean).join(" ")
    : [sport, country, competition, event, startTime].filter(Boolean).join(" ");
  return {
    eventId: "evt-" + slug(eventIdentity),
    providerEventId: providerEventId || null,
    event, sport, country, competition, startTime, status, clubs, players, managers,
    sourceType, sourceUrl: url.startsWith("https://") ? url : undefined,
    observedMarket: text(value?.market),
    observedSelection: text(value?.selection),
    observedOdds: text(value?.odds),
    observedOddsStatus: "NOT_VERIFIED_BY_ENGINE",
    evidenceRequired: true
  };
}

export function buildWorkerNetwork(brief: any, scoutingReport = "", runId = "unassigned") {
  const supplied = Array.isArray(brief?.events) ? brief.events : [];
  const candidates = [
    ...supplied.map((e: any, i: number) => normalizeCandidate(e, "user_supplied", i)),
    ...extractCandidateBlock(scoutingReport).map((e, i) => normalizeCandidate(e, "scout_report", i))
  ].filter(Boolean);
  if (!candidates.length && text(brief?.event) && !["latest stS prematch offer", "latest public sts pre-match coupon", "latest public sts fixtures"].includes(text(brief.event).toLowerCase())) {
    candidates.push(normalizeCandidate({
      event: brief.event, sport: brief.sport, country: brief.country, competition: brief.competition,
      startTime: brief.dateTime, status: brief.eventStatus
    }, "user_supplied", 0));
  }

  const sports = [...new Set(candidates.map((x: any) => x.sport).filter(Boolean))];
  // One persistent country agent per country, shared across all sports.
  const countries = [...new Set(candidates.map((x: any) => x.country).filter(Boolean))];
  const competitions = [...new Set(candidates.filter((x: any) => x.sport && x.country && x.competition)
    .map((x: any) => x.sport + " × " + x.country + " × " + x.competition))];

  const nodes: WorkerNode[] = [{
    id: "executive-coordination", parentId: null, tier: "EXECUTIVE",
    name: "Executive Coordination Office", scope: { runId, objective: text(brief?.taskType) || "research" },
    status: "completed", executionMode: "orchestrator"
  }, {
    id: "worker-network-director", parentId: "executive-coordination", tier: "T0",
    name: "Worker Network Director / IMWFD", scope: { runId, eventCandidates: String(candidates.length) },
    status: "completed", executionMode: "orchestrator"
  }];

  for (const sport of sports) {
    const sid = "sport-" + slug(sport);
    nodes.push({ id: sid, parentId: "worker-network-director", tier: "T1", name: sport + " Sport Chief", scope: { sport, marketFamilies: getSportCapability(sport)?.marketFamilies.join(",") || "provider_defined" }, status: "queued", executionMode: "queued_independent_api_request", assignedDepartment: "D2" });
  }
  for (const country of countries) {
    const relatedSports = [...new Set(candidates.filter((x: any) => x.country === country).map((x: any) => x.sport).filter(Boolean))];
    const cid = "country-" + slug(country);
    nodes.push({
      id: cid, parentId: "worker-network-director", tier: "T2",
      name: country + " Country Intelligence Agent",
      scope: { country, sports: relatedSports.join(",") },
      status: "queued", executionMode: "queued_independent_api_request", assignedDepartment: "D1"
    });
  }
  for (const value of competitions) {
    const [sport, country, competition] = value.split(" × ");
    const cid = "country-" + slug(country);
    const sid = "sport-" + slug(sport);
    nodes.push({
      id: "competition-" + slug(value),
      parentId: nodes.some(n => n.id === cid) ? cid : sid,
      tier: "T3", name: competition + " League / Competition Agent",
      scope: { sport, country, competition },
      status: "assigned", executionMode: "covered_by_department_checklist", assignedDepartment: "D1"
    });
  }
  for (const candidate of candidates as any[]) {
    const competitionId = candidate.sport && candidate.country && candidate.competition
      ? "competition-" + slug(candidate.sport + " × " + candidate.country + " × " + candidate.competition)
      : "";
    const countryId = candidate.country
      ? "country-" + slug(candidate.country) : "";
    const sportId = candidate.sport ? "sport-" + slug(candidate.sport) : "worker-network-director";
    const parent = competitionId || countryId || sportId;

    const clubIds: string[] = [];
    for (const club of candidate.clubs || []) {
      const clubName = text(club.name);
      if (!clubName) continue;
      const clubId = club.providerId
        ? "club-" + slug(candidate.sport || "unknown") + "-provider-" + slug(club.providerId)
        : "club-" + slug([candidate.sport, candidate.country, clubName].filter(Boolean).join(" × "));
      clubIds.push(clubId);
      if (!nodes.some(n => n.id === clubId)) nodes.push({
        id: clubId, parentId: nodes.some(n => n.id === parent) ? parent : "worker-network-director",
        tier: "T4", name: clubName + " Club Agent",
        scope: { sport: candidate.sport || "unknown", country: candidate.country || "unknown",
          competition: candidate.competition || "unknown", club: clubName, side: text(club.side),
          providerId: text(club.providerId), aliases: (club.aliases || []).join("|") },
        status: "assigned", executionMode: "covered_by_department_checklist", assignedDepartment: "D2"
      });
    }

    const playerIds: string[] = [];
    for (const player of candidate.players || []) {
      const playerName = text(player.name);
      if (!playerName) continue;
      const clubName = text(player.club);
      const matchedClub = clubName ? nodes.find((node) =>
        node.tier === "T4" &&
        text(node.scope?.club).toLowerCase() === clubName.toLowerCase() &&
        text(node.scope?.sport).toLowerCase() === text(candidate.sport).toLowerCase() &&
        text(node.scope?.country).toLowerCase() === text(candidate.country).toLowerCase()
      ) : undefined;
      const fallbackClubId = clubName
        ? "club-" + slug([candidate.sport, candidate.country, clubName].filter(Boolean).join(" × "))
        : "";
      const clubId = matchedClub?.id || fallbackClubId;
      const playerId = player.providerId
        ? "player-" + slug(candidate.sport || "unknown") + "-provider-" + slug(player.providerId)
        : "player-" + slug([candidate.sport, playerName].filter(Boolean).join(" × "));
      playerIds.push(playerId);
      if (!nodes.some(n => n.id === playerId)) nodes.push({
        id: playerId,
        parentId: clubId && nodes.some(n => n.id === clubId) ? clubId :
          (nodes.some(n => n.id === parent) ? parent : "worker-network-director"),
        tier: "T5", name: playerName + " Player Agent",
        scope: { sport: candidate.sport || "unknown", country: candidate.country || "unknown",
          competition: candidate.competition || "unknown", player: playerName, club: clubName || "unknown",
          providerId: text(player.providerId), aliases: (player.aliases || []).join("|") },
        status: "assigned", executionMode: "covered_by_department_checklist", assignedDepartment: "D2"
      });
    }

    const managerIds: string[] = [];
    for (const manager of candidate.managers || []) {
      const managerName = text(manager.name);
      if (!managerName) continue;
      const managerId = manager.providerId
        ? "manager-" + slug(candidate.sport || "unknown") + "-provider-" + slug(manager.providerId)
        : "manager-" + slug([candidate.sport, managerName].filter(Boolean).join(" × "));
      managerIds.push(managerId);
      if (!nodes.some(n => n.id === managerId)) nodes.push({
        id: managerId, parentId: nodes.some(n => n.id === parent) ? parent : "worker-network-director",
        tier: "T5", name: managerName + " Manager / Coach Agent",
        scope: { sport: candidate.sport || "unknown", country: candidate.country || "unknown",
          competition: candidate.competition || "unknown", manager: managerName, club: text(manager.club) || "unknown",
          providerId: text(manager.providerId), aliases: (manager.aliases || []).join("|") },
        status: "assigned", executionMode: "covered_by_department_checklist", assignedDepartment: "D2"
      });
    }

    const eventId = candidate.eventId;
    nodes.push({ id: eventId, parentId: nodes.some(n => n.id === parent) ? parent : "worker-network-director", tier: "T6", name: candidate.event + " Event Chief", scope: {
      event: candidate.event, sport: candidate.sport || "unknown", country: candidate.country || "unknown",
      competition: candidate.competition || "unknown", sourceType: candidate.sourceType,
      relatedClubAgents: clubIds.join(","), relatedPlayerAgents: playerIds.join(","), relatedManagerAgents: managerIds.join(",")
    }, status: "assigned", executionMode: "covered_by_department_checklist", assignedDepartment: "D2" });
    for (const specialist of EVENT_SPECIALISTS) {
      nodes.push({ id: eventId + ":" + specialist.id, parentId: eventId, tier: "T7", name: specialist.name, scope: { event: candidate.event, purpose: specialist.purpose }, status: "assigned_to_department_pass", assignedDepartment: specialist.department, executionMode: "covered_by_department_checklist" });
    }
    for (const marketFamily of (getSportCapability(candidate.sport)?.marketFamilies || [])) {
      nodes.push({
        id: eventId + ":market:" + slug(marketFamily), parentId: eventId, tier: "T7",
        name: marketFamily.replace(/_/g, " ") + " Market Specialist",
        scope: { event: candidate.event, sport: candidate.sport || "unknown", marketFamily },
        status: "assigned_to_department_pass", assignedDepartment: "D3",
        executionMode: "covered_by_department_checklist"
      });
    }
  }

  for (const department of WIN_DEPARTMENTS) {
    nodes.push({
      id: "department-" + department.id.toLowerCase(), parentId: "worker-network-director",
      tier: "MAIN_DEPARTMENT", name: department.id + " — " + department.name + " / " + department.director,
      scope: { department: department.id, teams: String(department.teams.length) },
      status: "queued", executionMode: "department_api_request", assignedDepartment: department.id
    });
  }

  return {
    organization: "WIN Multi-Sport Intelligence Project",
    runId,
    coordinator: "Executive Coordination Office",
    federation: "Independent Multi-Worker Operations & Federation Department",
    globalDecisionAuthority: "WIN Global Master Agent (single final decision-maker)",
    tiers: IMWFD_TIERS,
    departments: WIN_DEPARTMENTS,
    candidates,
    availableSportCapabilities: listSportCapabilities(),
    nodes,
    nodeCounts: {
      sports: sports.length, countries: countries.length,
      sportCountryBranches: countries.length,
      competitions: competitions.length, events: candidates.length,
      clubs: nodes.filter(n => n.tier === "T4").length,
      players: nodes.filter(n => n.tier === "T5" && n.id.startsWith("player-")).length,
      managers: nodes.filter(n => n.tier === "T5" && n.id.startsWith("manager-")).length,
      eventSpecialistAssignments: candidates.length * EVENT_SPECIALISTS.length,
      sportMarketSpecialistAssignments: nodes.filter(n => n.id.includes(":market:")).length,
      departmentApiRequests: WIN_DEPARTMENTS.length,
      hierarchySpecialistAssignmentsAreIndependentApiSessions: false
    },
    executionDisclosure: "Eight main department director passes are separate OpenAI Responses API requests. Sport, country, league, club, player, manager/coach and event nodes are persistent named agent identities. Each eligible node is also enqueued as its own independent API task, deduplicated by stable agent ID and freshness cooldown. A budget-gated scheduled worker executes at most one queued entity agent per learning cycle; queued work is not falsely reported as already run or always-on. Event specialist roles remain assignments covered within department requests."
  };
}

export function buildDepartmentHandoffs(reports: Array<{ role: string; status: string; departmentId?: string }>) {
  return reports.map(report => ({
    from: report.departmentId || report.role,
    status: report.status,
    handoffTo: report.departmentId
      ? WIN_DEPARTMENTS.find(d => d.id === report.departmentId)?.handoffTo ?? ["GLOBAL_MASTER"]
      : ["GLOBAL_MASTER"],
    accepted: report.status === "completed"
  }));
}

type Evidence = Record<string, any>;
type Provider = {
  id: string; name: string; sports: string[]; dataDomains: string[];
  accessMode: string; authentication: string; licenceReview: string;
  automationAllowed: boolean; licenceReference?: string;
};

const MAX_SAMPLE = 20;
const MAX_VALUES_PER_RECORD = 50;

const clean = (value: unknown) => typeof value === "string"
  ? value.trim().replace(/\s+/g, " ").slice(0, 180)
  : "";

const pathValue = (record: Evidence, path: string) => path.split(".").reduce<any>(
  (value, part) => value && typeof value === "object" ? value[part] : undefined,
  record
);

const valueList = (record: Evidence, paths: string[]) => {
  const values: string[] = [];
  for (const path of paths) {
    const raw = pathValue(record, path);
    const items = Array.isArray(raw) ? raw.slice(0, MAX_VALUES_PER_RECORD) : [raw];
    for (const item of items) {
      const value = clean(typeof item === "object" && item
        ? item.name || item.label || item.id
        : item);
      if (value) values.push(value);
    }
  }
  return [...new Set(values)];
};

const DIMENSIONS = [
  { id: "competitions", label: "Competitions / leagues", paths: ["competition", "league", "tournament", "competitionId", "competition_id", "leagueId", "league_id", "brief.competition", "event.competition"], idPaths: ["competitionId", "competition_id", "leagueId", "league_id"] },
  { id: "seasons", label: "Seasons", paths: ["season", "seasonId", "season_id", "brief.season", "event.season"], idPaths: ["seasonId", "season_id"] },
  { id: "teams", label: "Teams / participants", paths: ["team", "teamName", "team_name", "homeTeam", "home_team", "awayTeam", "away_team", "teams", "participants", "teamId", "team_id", "homeTeamId", "awayTeamId"], idPaths: ["teamId", "team_id", "homeTeamId", "awayTeamId"] },
  { id: "players", label: "Players / athletes", paths: ["player", "playerName", "player_name", "athlete", "athleteName", "athlete_name", "players", "athletes", "playerId", "player_id", "athleteId"], idPaths: ["playerId", "player_id", "athleteId"] },
  { id: "markets", label: "Markets", paths: ["market", "marketId", "market_id", "marketType", "market_type", "markets", "selection.market"], idPaths: ["marketId", "market_id"] }
] as const;

const TARGET_DOMAINS = [
  { id: "fixtures", label: "Fixtures & event identity", pattern: /fixture|schedule|event.?identity|kick.?off/iu },
  { id: "results", label: "Results", pattern: /result|score|outcome|settlement|settled/iu },
  { id: "team_statistics", label: "Team statistics", pattern: /team.*stat|match.*stat|team.*performance/iu },
  { id: "player_statistics", label: "Player statistics", pattern: /player.*stat|athlete.*stat|goalscorer|player.?event|player.?rating/iu },
  { id: "injuries", label: "Injuries & suspensions", pattern: /injur|suspension|fitness|medical/iu },
  { id: "lineups", label: "Lineups & participation", pattern: /line.?up|roster|starting.?xi|participation/iu },
  { id: "tactics_matchups", label: "Tactics & matchups", pattern: /tactic|formation|match.?up|playing.?style/iu },
  { id: "odds_markets", label: "Odds & markets", pattern: /odds|price|market|line|spread|total|handicap/iu }
] as const;

function summarizeDimension(records: Evidence[], dimension: typeof DIMENSIONS[number]) {
  const observed = new Set<string>();
  let recordsWithIdentity = 0;
  let recordsWithStableId = 0;
  let recordsWithoutTimestamp = 0;
  const observedTimes: number[] = [];
  for (const record of records) {
    const values = valueList(record, [...dimension.paths]);
    if (values.length) {
      recordsWithIdentity++;
      if (valueList(record, [...dimension.idPaths]).length) recordsWithStableId++;
      const rawTime = clean(record.retrievedAt || record.updatedAt || record.createdAt || record.observedAt);
      const time = Date.parse(rawTime);
      if (Number.isFinite(time)) observedTimes.push(time);
      else recordsWithoutTimestamp++;
    }
    for (const value of values) observed.add(value);
  }
  const latest = observedTimes.length ? Math.max(...observedTimes) : null;
  return {
    id: dimension.id,
    label: dimension.label,
    distinctObserved: observed.size,
    recordsWithIdentity,
    recordsWithoutIdentity: Math.max(0, records.length - recordsWithIdentity),
    recordsWithStableId,
    recordsWithoutStableId: Math.max(0, recordsWithIdentity - recordsWithStableId),
    latestObservedAt: latest === null ? null : new Date(latest).toISOString(),
    recordsWithoutTimestamp,
    sample: [...observed].sort((a, b) => a.localeCompare(b)).slice(0, MAX_SAMPLE),
    sampleTruncated: observed.size > MAX_SAMPLE
  };
}

function domainText(value: Evidence) {
  return [value.domain, value.metric, value.dataType, value.type, value.label]
    .map(clean).filter(Boolean).join(" ");
}

function providerDomainText(provider: Provider) {
  return Array.isArray(provider.dataDomains) ? provider.dataDomains.map(clean).join(" ") : "";
}

/** Pure persisted-evidence inventory. Registry candidates never count as live data. */
export function buildCoverageInventory(evidence: Evidence[], providers: Provider[], registeredSports: string[] = []) {
  const records = Array.isArray(evidence) ? evidence.filter(x => x && typeof x === "object" && !Array.isArray(x)) : [];
  const registry = Array.isArray(providers) ? providers.filter(x => x && typeof x === "object") : [];
  const dimensions = DIMENSIONS.map(dimension => summarizeDimension(records, dimension));
  const sportIds = [...new Set(records.map(record => clean(record.sport).toLowerCase()).filter(Boolean))].sort();
  const bySport = sportIds.map(sportId => {
    const rows = records.filter(record => clean(record.sport).toLowerCase() === sportId);
    return {
      sportId,
      evidenceRecords: rows.length,
      dimensions: DIMENSIONS.map(dimension => summarizeDimension(rows, dimension))
    };
  });

  const openNoCredential = registry.filter(provider =>
    provider.automationAllowed === true && provider.licenceReview === "approved" &&
    ["open_download", "open_api"].includes(provider.accessMode) &&
    provider.authentication === "none" && /^https:\/\//iu.test(provider.licenceReference || "")
  ).map(provider => ({
    id: clean(provider.id),
    name: clean(provider.name),
    sports: Array.isArray(provider.sports) ? provider.sports.map(clean).filter(Boolean).slice(0, 30) : [],
    dataDomains: Array.isArray(provider.dataDomains) ? provider.dataDomains.map(clean).filter(Boolean).slice(0, 50) : [],
    accessMode: provider.accessMode,
    licenceReview: provider.licenceReview,
    licenceReference: provider.licenceReference,
    connectionStatus: "registry_approved_not_live_verified"
  })).sort((a, b) => a.id.localeCompare(b.id));

  const sportUniverse = [...new Set([
    ...(Array.isArray(registeredSports) ? registeredSports : []),
    ...sportIds,
    ...registry.flatMap(provider => Array.isArray(provider.sports) ? provider.sports : [])
      .filter(sport => !["multi_sport", "other_supported_sports"].includes(sport))
  ].map(clean).map(value => value.toLowerCase()).filter(Boolean))].sort();
  const domainMatrix = sportUniverse.map(sportId => {
    const sportEvidence = records.filter(record => clean(record.sport).toLowerCase() === sportId);
    const sportProviders = registry.filter(provider =>
      (provider.sports || []).includes(sportId) || (provider.sports || []).includes("multi_sport")
    );
    const domains = TARGET_DOMAINS.map(domain => {
      const observedRecords = sportEvidence.filter(record => domain.pattern.test(domainText(record))).length;
      const declaring = sportProviders.filter(provider => domain.pattern.test(providerDomainText(provider)));
      const approvedOpenCandidates = declaring.filter(provider =>
        provider.automationAllowed === true && provider.licenceReview === "approved" &&
        ["open_download", "open_api"].includes(provider.accessMode) && provider.authentication === "none"
      ).map(provider => provider.id).sort();
      const blockedCandidates = declaring.filter(provider => !approvedOpenCandidates.includes(provider.id))
        .map(provider => provider.id).sort();
      const status = observedRecords > 0 ? "observed_in_persisted_evidence"
        : approvedOpenCandidates.length ? "approved_open_candidate_only"
        : blockedCandidates.length ? "blocked_candidate_only"
        : "no_known_coverage";
      return {
        id: domain.id,
        label: domain.label,
        status,
        observedRecords,
        approvedOpenCandidateProviderIds: approvedOpenCandidates.slice(0, 20),
        blockedCandidateProviderIds: blockedCandidates.slice(0, 20)
      };
    });
    return {
      sportId,
      domains,
      observedDomains: domains.filter(domain => domain.observedRecords > 0).length,
      missingDomains: domains.filter(domain => domain.observedRecords === 0).length
    };
  });

  return {
    evidenceRecords: records.length,
    dimensions,
    bySport,
    providers: {
      registryEntries: registry.length,
      approvedOpenNoCredentialCandidates: openNoCredential,
      approvedOpenNoCredentialCount: openNoCredential.length,
      liveVerifiedConnections: 0,
      status: "registry_inventory_only",
      warning: "Approved registry entries are candidate sources, not proof of current connectivity, complete coverage, freshness or free-plan entitlement."
    },
    domainMatrix: {
      domains: TARGET_DOMAINS.map(({ id, label }) => ({ id, label })),
      bySport: domainMatrix,
      status: "persisted_evidence_plus_registry_candidates",
      warning: "Only persisted evidence is observed. Provider declarations are candidate coverage and never prove connection, completeness, rights or freshness."
    },
    limitations: [
      "Distinct counts use only explicit persisted identities; aliases are not merged without a verified mapping.",
      "Stable-ID counts are descriptive; identifier namespaces still require provider-specific mapping and collision review.",
      "Domain matching is a conservative registry/evidence text inventory; ambiguous generic statistics do not prove team or player detail.",
      "A record without a player or market identity may be valid for another domain; missingness is descriptive, not automatic rejection.",
      "Samples are bounded and do not replace record-level provenance review."
    ]
  };
}

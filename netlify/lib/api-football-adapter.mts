import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";
import { DATA_PROVIDER_REGISTRY, providerMayRunAutomatically, type ProviderConnection } from "./data-provider-registry.mts";

const PROVIDER_ID = "api-sports";
const API_BASE = "https://v3.football.api-sports.io";
const TERMS_URL = "https://www.api-football.com/terms";
const ATTRIBUTION = "Football match data and provider-calculated ratings supplied by API-Football (API-SPORTS).";
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";
const MAX_RESPONSE_CHARACTERS = 5_000_000;
const REQUEST_TIMEOUT_MS = 25_000;

type JsonRecord = Record<string, any>;
type ApiResult = { data: JsonRecord; audit: JsonRecord };

function env(name: string): string {
  try {
    const value = (globalThis as any).Netlify?.env?.get?.(name);
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {}
  const localValue = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return typeof localValue === "string" ? localValue.trim() : "";
}
const text = (value: unknown): string => value === null || value === undefined ? "" : String(value).trim();
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);
const apiRows = (payload: any): any[] => asArray(payload?.response);
const fixtureRow = (payload: any): any => apiRows(payload)[0] || null;
const stableJsonHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function parseDomains(raw: string): string[] {
  return [...new Set(raw.split(",").map(x => x.trim()).filter(Boolean))];
}

export function getApiFootballReadiness() {
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === PROVIDER_ID);
  const apiKeyConfigured = !!env("API_FOOTBALL_KEY");
  const rightsApproved = env("WIN_API_FOOTBALL_DATA_RIGHTS_APPROVED").toLowerCase() === "true";
  const approvedAt = env("WIN_API_FOOTBALL_APPROVED_AT");
  const approvedBy = env("WIN_API_FOOTBALL_APPROVED_BY");
  const termsReference = env("WIN_API_FOOTBALL_TERMS_REFERENCE");
  const enabledDomains = parseDomains(env("WIN_API_FOOTBALL_ENABLED_DOMAINS"));
  const connection: ProviderConnection = {
    providerId: PROVIDER_ID,
    status: apiKeyConfigured && rightsApproved ? "connected" : "credentials_missing",
    verifiedAt: approvedAt,
    approvedBy,
    enabledDomains,
    termsReference
  };
  const registryAllows = !!provider && providerMayRunAutomatically(provider, connection);
  const blockers: string[] = [];
  if (!provider) blockers.push("provider_not_registered");
  if (!apiKeyConfigured) blockers.push("api_key_missing");
  if (!rightsApproved) blockers.push("data_rights_approval_missing");
  if (!approvedAt || !Number.isFinite(Date.parse(approvedAt))) blockers.push("approval_timestamp_missing_or_invalid");
  if (!approvedBy) blockers.push("approval_owner_missing");
  if (!/^https:\/\//i.test(termsReference)) blockers.push("terms_reference_missing");
  if (!enabledDomains.length) blockers.push("enabled_data_domains_missing");
  if (provider && provider.accessMode !== "licensed_api") blockers.push("provider_access_mode_not_licensed_api");
  if (provider && provider.licenceReview !== "approved") blockers.push("provider_terms_review_required");
  if (provider && !provider.automationAllowed) blockers.push("provider_automation_disabled_in_registry");
  if (provider && enabledDomains.some(domain => !provider.dataDomains.includes(domain))) blockers.push("enabled_domain_not_registered");
  if (!registryAllows && !blockers.length) blockers.push("provider_connection_not_approved");
  return {
    providerId: PROVIDER_ID,
    providerName: provider?.name || "API-Football",
    apiKeyConfigured,
    rightsApproved,
    registryAllows,
    ready: blockers.length === 0,
    status: blockers.length ? "blocked" : "ready",
    blockers,
    enabledDomains,
    termsReference: termsReference || provider?.licenceReference || TERMS_URL,
    termsReview: provider?.licenceReview || "required",
    automationAllowed: provider?.automationAllowed ?? false,
    note: "No API request is made until a key, documented rights approval, approved registry entry and explicitly enabled data domains are all present."
  };
}

function requireAuthorizedConfig() {
  const readiness = getApiFootballReadiness();
  if (!readiness.ready) throw new Error("api_football_sync_blocked:" + readiness.blockers.join(","));
  const apiKey = env("API_FOOTBALL_KEY");
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === PROVIDER_ID)!;
  const connection: ProviderConnection = {
    providerId: PROVIDER_ID,
    status: "connected",
    verifiedAt: env("WIN_API_FOOTBALL_APPROVED_AT"),
    approvedBy: env("WIN_API_FOOTBALL_APPROVED_BY"),
    enabledDomains: readiness.enabledDomains,
    termsReference: env("WIN_API_FOOTBALL_TERMS_REFERENCE")
  };
  if (!providerMayRunAutomatically(provider, connection)) throw new Error("api_football_sync_blocked:provider_policy_rejected");
  return { apiKey, readiness };
}

function domainEnabled(readiness: ReturnType<typeof getApiFootballReadiness>, domain: string) {
  return readiness.enabledDomains.includes(domain);
}

async function apiRequest(endpoint: string, params: Record<string, string | number | boolean>, apiKey: string): Promise<ApiResult> {
  const url = new URL(API_BASE + "/" + endpoint.replace(/^\/+/, ""));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  const requestedAt = new Date().toISOString();
  const response = await fetch(url, {
    method: "GET",
    headers: { "x-apisports-key": apiKey, accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const bodyText = await response.text();
  if (bodyText.length > MAX_RESPONSE_CHARACTERS) throw new Error("api_football_response_exceeds_size_limit:" + endpoint);
  let payload: any;
  try { payload = JSON.parse(bodyText); }
  catch { throw new Error("api_football_invalid_json:" + endpoint); }
  const errors = payload?.errors;
  const hasErrors = isObject(errors) ? Object.keys(errors).length > 0 : Array.isArray(errors) ? errors.length > 0 : !!errors;
  const audit = {
    endpoint: "/" + endpoint,
    requestedAt,
    completedAt: new Date().toISOString(),
    httpStatus: response.status,
    status: response.ok && !hasErrors ? "success" : "error",
    responseCount: apiRows(payload).length,
    errors: hasErrors ? errors : null,
    quota: {
      dailyLimit: response.headers.get("x-ratelimit-requests-limit"),
      dailyRemaining: response.headers.get("x-ratelimit-requests-remaining"),
      minuteLimit: response.headers.get("x-ratelimit-limit"),
      minuteRemaining: response.headers.get("x-ratelimit-remaining")
    }
  };
  if (!response.ok || hasErrors) throw Object.assign(new Error("api_football_endpoint_error:" + endpoint + ":" + response.status), { audit });
  return { data: payload, audit };
}

export async function testApiFootballConnection() {
  const { apiKey, readiness } = requireAuthorizedConfig();
  const result = await apiRequest("status", {}, apiKey);
  const response = fixtureRow(result.data) || result.data?.response || {};
  const summary = {
    id: "api-football-connection-" + new Date().toISOString().replace(/[^0-9]/g, ""),
    providerId: PROVIDER_ID,
    status: "connected",
    checkedAt: new Date().toISOString(),
    subscription: response?.subscription || null,
    requests: response?.requests || result.data?.requests || null,
    quota: result.audit.quota,
    endpointAudit: [result.audit],
    rightsApproval: { verified: readiness.rightsApproved, domains: readiness.enabledDomains, termsReference: readiness.termsReference }
  };
  await put("library/model-lab/provider-sync-runs", summary.id, summary);
  await put("scheduler-state", "api-football-connection", summary);
  return summary;
}

function getCoverage(leaguePayload: any, season: number) {
  const league = fixtureRow(leaguePayload);
  const seasons = asArray(league?.seasons);
  const found = seasons.find((item: any) => Number(item?.year) === season) || null;
  return {
    league: league?.league || null,
    country: league?.country || null,
    season: found ? { year: found.year, start: found.start, end: found.end, current: found.current } : null,
    coverage: found?.coverage || null
  };
}

function availabilityStatus(coverageValue: unknown, requested: boolean, count: number, error?: unknown) {
  if (coverageValue === false) return "not_in_competition_coverage";
  if (error) return "source_error";
  if (!requested) return coverageValue === true ? "not_requested" : "coverage_unknown_not_requested";
  return count > 0 ? "available" : "no_records_returned";
}

function normaliseEvents(payload: any): any[] {
  return apiRows(payload).map((event, index) => ({
    index,
    minute: event?.time?.elapsed ?? null,
    addedMinute: event?.time?.extra ?? null,
    team: event?.team ? { id: event.team.id ?? null, name: event.team.name ?? null } : null,
    player: event?.player ? { id: event.player.id ?? null, name: event.player.name ?? null } : null,
    assist: event?.assist ? { id: event.assist.id ?? null, name: event.assist.name ?? null } : null,
    type: event?.type ?? null,
    detail: event?.detail ?? null,
    comments: event?.comments ?? null
  })).sort((a, b) =>
    (Number(a.minute ?? 0) * 100 + Number(a.addedMinute ?? 0)) -
    (Number(b.minute ?? 0) * 100 + Number(b.addedMinute ?? 0)) || a.index - b.index
  );
}

function normaliseLineups(payload: any): any[] {
  return apiRows(payload).map(team => ({
    team: team?.team || null,
    formation: team?.formation ?? null,
    coach: team?.coach || null,
    startXI: asArray(team?.startXI).map((entry: any) => ({ player: entry?.player || null })),
    substitutes: asArray(team?.substitutes).map((entry: any) => ({ player: entry?.player || null }))
  }));
}

function normaliseTeamStatistics(payload: any): any[] {
  return apiRows(payload).map(team => ({
    team: team?.team || null,
    statistics: asArray(team?.statistics).map((stat: any) => ({
      metric: stat?.type ?? null,
      value: stat?.value ?? null
    }))
  }));
}

function sanitizePlayerRatingsPayload(payload: any, allowPlayerRatings: boolean): any {
  if (allowPlayerRatings || !payload) return payload ?? null;
  const clone = structuredClone(payload);
  for (const team of apiRows(clone)) {
    for (const player of asArray(team?.players)) {
      for (const stat of asArray(player?.statistics)) {
        if (isObject(stat?.games)) delete stat.games.rating;
      }
    }
  }
  return clone;
}

function sanitizeFixtureResultsPayload(payload: any, allowResults: boolean): any {
  if (allowResults || !payload) return payload ?? null;
  const clone = structuredClone(payload);
  for (const fixture of apiRows(clone)) {
    if (isObject(fixture)) {
      delete fixture.goals;
      delete fixture.score;
    }
  }
  return clone;
}

function normalisePlayerStatistics(payload: any, allowPlayerRatings = false): any[] {
  return apiRows(payload).flatMap(teamBlock =>
    asArray(teamBlock?.players).map((entry: any) => ({
      team: teamBlock?.team || null,
      player: entry?.player || null,
      statistics: asArray(entry?.statistics).map((stat: any) => ({
        games: stat?.games ? { ...stat.games, rating: allowPlayerRatings ? stat.games.rating ?? null : null } : null,
        offsides: stat?.offsides ?? null,
        shots: stat?.shots || null,
        goals: stat?.goals || null,
        passes: stat?.passes || null,
        tackles: stat?.tackles || null,
        duels: stat?.duels || null,
        dribbles: stat?.dribbles || null,
        fouls: stat?.fouls || null,
        cards: stat?.cards || null,
        penalty: stat?.penalty || null
      }))
    }))
  );
}

export function buildApiFootballMatchDossier(input: {
  fixturePayload: any;
  leaguePayload?: any;
  eventsPayload?: any;
  lineupsPayload?: any;
  statisticsPayload?: any;
  halfStatisticsPayload?: any;
  playersPayload?: any;
  injuriesPayload?: any;
  predictionsPayload?: any;
  oddsPayload?: any;
  standingsPayload?: any;
  headToHeadPayload?: any;
  homeTeamSeasonPayload?: any;
  awayTeamSeasonPayload?: any;
  endpointAudit?: any[];
  enabledDomains?: string[];
  retrievedAt?: string;
}, options: { allowPlayerRatings?: boolean; allowResults?: boolean } = {}) {
  const retrievedAt = input.retrievedAt || new Date().toISOString();
  const fixture = fixtureRow(input.fixturePayload);
  if (!fixture?.fixture?.id) throw new Error("api_football_fixture_not_found");
  const season = Number(fixture?.league?.season || 0);
  const coverageInfo = getCoverage(input.leaguePayload, season);
  const coverage = coverageInfo.coverage || {};
  const fixtureEvents = asArray(fixture.events);
  const fixtureLineups = asArray(fixture.lineups);
  const fixtureStats = asArray(fixture.statistics);
  const events = fixtureEvents.length ? fixtureEvents : normaliseEvents(input.eventsPayload);
  const lineups = fixtureLineups.length ? normaliseLineups({ response: fixtureLineups }) : normaliseLineups(input.lineupsPayload);
  const teamStatistics = fixtureStats.length ? normaliseTeamStatistics({ response: fixtureStats }) : normaliseTeamStatistics(input.statisticsPayload);
  const allowPlayerRatings = options.allowPlayerRatings === true;
  const allowResults = options.allowResults === true;
  const playerStatistics = normalisePlayerStatistics(input.playersPayload, allowPlayerRatings);
  const rawPlayers = sanitizePlayerRatingsPayload(input.playersPayload, allowPlayerRatings);
  const rawFixture = sanitizeFixtureResultsPayload(input.fixturePayload, allowResults);
  const injuries = apiRows(input.injuriesPayload);
  const predictions = apiRows(input.predictionsPayload);
  const odds = apiRows(input.oddsPayload);
  const standings = apiRows(input.standingsPayload);
  const headToHead = apiRows(input.headToHeadPayload);
  const enabledDomains = Array.isArray(input.enabledDomains) ? input.enabledDomains : [];
  const coverageRows = [
    { id: "competition_season_coverage", domain: "competition_coverage", flag: coverageInfo.season ? true : null, requested: !!input.leaguePayload, count: coverageInfo.season ? 1 : 0 },
    { id: "fixture_events", domain: "match_events", flag: coverage?.fixtures?.events, requested: !!input.eventsPayload || fixtureEvents.length > 0, count: events.length },
    { id: "lineups", domain: "lineups", flag: coverage?.fixtures?.lineups, requested: !!input.lineupsPayload || fixtureLineups.length > 0, count: lineups.length },
    { id: "team_match_statistics", domain: "team_match_statistics", flag: coverage?.fixtures?.statistics_fixtures, requested: !!input.statisticsPayload || fixtureStats.length > 0, count: teamStatistics.length },
    { id: "half_time_team_statistics", domain: "half_time_team_statistics", flag: coverage?.fixtures?.statistics_fixtures, requested: !!input.halfStatisticsPayload, count: input.halfStatisticsPayload ? normaliseTeamStatistics(input.halfStatisticsPayload).length : 0 },
    { id: "player_match_statistics", domain: "player_match_statistics", flag: coverage?.fixtures?.statistics_players, requested: !!input.playersPayload, count: playerStatistics.length },
    { id: "result_score", domain: "results", flag: null, requested: allowResults, count: allowResults && fixture.goals ? 1 : 0 },
    { id: "injuries", domain: "injuries", flag: coverage?.injuries, requested: !!input.injuriesPayload, count: injuries.length },
    { id: "predictions", domain: "predictions", flag: coverage?.predictions, requested: !!input.predictionsPayload, count: predictions.length },
    { id: "pre_match_odds", domain: "pre_match_odds", flag: coverage?.odds, requested: !!input.oddsPayload, count: odds.length },
    { id: "standings", domain: "competition_standings", flag: coverage?.standings, requested: !!input.standingsPayload, count: standings.length },
    { id: "head_to_head", domain: "head_to_head", flag: null, requested: !!input.headToHeadPayload, count: headToHead.length },
    { id: "home_team_season_statistics", domain: "team_season_statistics", flag: null, requested: !!input.homeTeamSeasonPayload, count: input.homeTeamSeasonPayload ? 1 : 0 },
    { id: "away_team_season_statistics", domain: "team_season_statistics", flag: null, requested: !!input.awayTeamSeasonPayload, count: input.awayTeamSeasonPayload ? 1 : 0 }
  ].map((item: any) => {
    const sourceError = (input.endpointAudit || []).some((audit: any) => audit.domain === item.domain && audit.status !== "success");
    const domainAllowed = enabledDomains.includes(item.domain);
    return {
      ...item,
      status: item.flag === false ? "not_in_competition_coverage"
        : !domainAllowed ? "not_authorized_by_enabled_domain"
        : availabilityStatus(item.flag, item.requested, item.count, sourceError)
    };
  });
  const playerRatings = allowPlayerRatings ? playerStatistics.flatMap(player => player.statistics
    .filter(stat => stat?.games?.rating !== null && stat?.games?.rating !== undefined && stat?.games?.rating !== "")
    .map(stat => ({
      player: player.player, team: player.team, rating: stat.games.rating,
      position: stat?.games?.position ?? null, minutes: stat?.games?.minutes ?? null
    }))) : [];
  coverageRows.push({
    id: "player_ratings",
    domain: "player_ratings",
    flag: coverage?.fixtures?.statistics_players,
    requested: !!input.playersPayload && allowPlayerRatings,
    count: playerRatings.length,
    status: coverage?.fixtures?.statistics_players === false ? "not_in_competition_coverage"
      : !enabledDomains.includes("player_ratings") ? "not_authorized_by_enabled_domain"
      : !input.playersPayload ? "not_requested"
      : playerRatings.length ? "available" : "not_provided_by_provider"
  });
  const dossier = {
    id: "api-football-" + String(fixture.fixture.id),
    providerId: PROVIDER_ID,
    sport: "football",
    competition: {
      ...coverageInfo.league,
      ...fixture.league,
      country: coverageInfo.country || fixture.league?.country || null,
      seasonCoverage: coverageInfo.season,
      coverage: coverage
    },
    fixture: {
      id: fixture.fixture.id,
      referee: fixture.fixture.referee ?? null,
      timezone: fixture.fixture.timezone ?? null,
      date: fixture.fixture.date ?? null,
      timestamp: fixture.fixture.timestamp ?? null,
      periods: fixture.fixture.periods ?? null,
      venue: fixture.fixture.venue ?? null,
      status: fixture.fixture.status ?? null,
      round: fixture.league?.round ?? null,
      home: fixture.teams?.home ?? null,
      away: fixture.teams?.away ?? null,
      goals: allowResults ? fixture.goals ?? null : null,
      score: allowResults ? fixture.score ?? null : null
    },
    teamStatistics,
    halfTimeTeamStatistics: input.halfStatisticsPayload ? normaliseTeamStatistics(input.halfStatisticsPayload) : [],
    playerStatistics,
    playerRatings,
    events,
    lineups,
    injuries,
    predictions,
    odds,
    standings,
    headToHead,
    teamSeasonStatistics: {
      home: input.homeTeamSeasonPayload ? apiRows(input.homeTeamSeasonPayload)[0] || null : null,
      away: input.awayTeamSeasonPayload ? apiRows(input.awayTeamSeasonPayload)[0] || null : null
    },
    coverage: coverageRows,
    raw: {
      fixture: rawFixture,
      league: input.leaguePayload || null,
      events: input.eventsPayload || null,
      lineups: input.lineupsPayload || null,
      statistics: input.statisticsPayload || null,
      halfStatistics: input.halfStatisticsPayload || null,
      players: rawPlayers,
      injuries: input.injuriesPayload || null,
      predictions: input.predictionsPayload || null,
      odds: input.oddsPayload || null,
      standings: input.standingsPayload || null,
      headToHead: input.headToHeadPayload || null,
      homeTeamSeason: input.homeTeamSeasonPayload || null,
      awayTeamSeason: input.awayTeamSeasonPayload || null
    },
    endpointAudit: input.endpointAudit || [],
    provenance: {
      provider: "API-Football / API-SPORTS",
      sourceUrl: API_BASE,
      termsReference: TERMS_URL,
      attribution: ATTRIBUTION,
      retrievedAt,
      rawPayloadSha256: stableJsonHash({ ...input, fixturePayload: rawFixture, playersPayload: rawPlayers }),
      sourceReportedNotIndependentlyVerified: true
    }
  };
  return dossier;
}

async function fetchOptional(
  endpoint: string,
  params: Record<string, string | number | boolean>,
  domain: string,
  readiness: ReturnType<typeof getApiFootballReadiness>,
  apiKey: string,
  audit: any[],
  condition = true
): Promise<any | null> {
  if (!condition || !domainEnabled(readiness, domain)) return null;
  try {
    const result = await apiRequest(endpoint, params, apiKey);
    audit.push({ ...result.audit, domain });
    return result.data;
  } catch (error) {
    const errorAudit = (error as any)?.audit;
    if (errorAudit) audit.push({ ...errorAudit, domain });
    else audit.push({ endpoint: "/" + endpoint, domain, status: "error", error: String(error).slice(0, 240) });
    return null;
  }
}

export async function syncApiFootballFixtureDossier(
  fixtureIdInput: number,
  options: { includeContext?: boolean; includeHalfTime?: boolean } = {}
) {
  const fixtureId = Number(fixtureIdInput);
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) throw new Error("api_football_invalid_fixture_id");
  const { apiKey, readiness } = requireAuthorizedConfig();
  if (!domainEnabled(readiness, "fixtures")) throw new Error("api_football_sync_blocked:fixtures_domain_not_enabled");
  const startedAt = new Date().toISOString();
  const endpointAudit: any[] = [];
  const fixtureResult = await apiRequest("fixtures", { id: fixtureId, timezone: "Europe/Warsaw" }, apiKey);
  endpointAudit.push({ ...fixtureResult.audit, domain: "fixtures" });
  const fixture = fixtureRow(fixtureResult.data);
  if (!fixture) throw new Error("api_football_fixture_not_found:" + fixtureId);
  const leagueId = Number(fixture?.league?.id || 0);
  const season = Number(fixture?.league?.season || 0);
  const homeTeamId = Number(fixture?.teams?.home?.id || 0);
  const awayTeamId = Number(fixture?.teams?.away?.id || 0);
  const leaguePayload = leagueId && season
    ? await fetchOptional("leagues", { id: leagueId, season }, "competition_coverage", readiness, apiKey, endpointAudit)
    : null;
  const cov = getCoverage(leaguePayload, season).coverage || {};
  const embeddedEvents = asArray(fixture.events).length > 0;
  const embeddedLineups = asArray(fixture.lineups).length > 0;
  const embeddedStatistics = asArray(fixture.statistics).length > 0;

  const [eventsPayload, lineupsPayload, statisticsPayload, playersPayload] = await Promise.all([
    fetchOptional("fixtures/events", { fixture: fixtureId }, "match_events", readiness, apiKey, endpointAudit, !embeddedEvents && cov?.fixtures?.events !== false),
    fetchOptional("fixtures/lineups", { fixture: fixtureId }, "lineups", readiness, apiKey, endpointAudit, !embeddedLineups && cov?.fixtures?.lineups !== false),
    fetchOptional("fixtures/statistics", { fixture: fixtureId }, "team_match_statistics", readiness, apiKey, endpointAudit, !embeddedStatistics && cov?.fixtures?.statistics_fixtures !== false),
    fetchOptional("fixtures/players", { fixture: fixtureId }, "player_match_statistics", readiness, apiKey, endpointAudit, cov?.fixtures?.statistics_players !== false)
  ]);
  const halfStatisticsPayload = options.includeHalfTime !== false && season >= 2024
    ? await fetchOptional("fixtures/statistics", { fixture: fixtureId, half: "true" }, "team_match_statistics", readiness, apiKey, endpointAudit, cov?.fixtures?.statistics_fixtures !== false)
    : null;

  let injuriesPayload: any = null, predictionsPayload: any = null, oddsPayload: any = null, standingsPayload: any = null;
  let headToHeadPayload: any = null, homeTeamSeasonPayload: any = null, awayTeamSeasonPayload: any = null;
  if (options.includeContext) {
    [injuriesPayload, predictionsPayload, oddsPayload, standingsPayload, headToHeadPayload] = await Promise.all([
      fetchOptional("injuries", { fixture: fixtureId }, "injuries", readiness, apiKey, endpointAudit, cov?.injuries !== false),
      fetchOptional("predictions", { fixture: fixtureId }, "predictions", readiness, apiKey, endpointAudit, cov?.predictions !== false),
      fetchOptional("odds", { fixture: fixtureId }, "pre_match_odds", readiness, apiKey, endpointAudit, cov?.odds !== false),
      fetchOptional("standings", { league: leagueId, season }, "competition_standings", readiness, apiKey, endpointAudit, !!leagueId && !!season && cov?.standings !== false),
      fetchOptional("fixtures/headtohead", { h2h: homeTeamId + "-" + awayTeamId, last: 10 }, "head_to_head", readiness, apiKey, endpointAudit, !!homeTeamId && !!awayTeamId)
    ]);
    if (leagueId && season) {
      [homeTeamSeasonPayload, awayTeamSeasonPayload] = await Promise.all([
        fetchOptional("teams/statistics", { league: leagueId, season, team: homeTeamId }, "team_season_statistics", readiness, apiKey, endpointAudit, !!homeTeamId),
        fetchOptional("teams/statistics", { league: leagueId, season, team: awayTeamId }, "team_season_statistics", readiness, apiKey, endpointAudit, !!awayTeamId)
      ]);
    }
  }

  const retrievedAt = new Date().toISOString();
  const dossier = buildApiFootballMatchDossier({
    fixturePayload: fixtureResult.data, leaguePayload, eventsPayload, lineupsPayload, statisticsPayload,
    halfStatisticsPayload, playersPayload, injuriesPayload, predictionsPayload, oddsPayload,
    standingsPayload, headToHeadPayload, homeTeamSeasonPayload, awayTeamSeasonPayload,
    endpointAudit, enabledDomains: readiness.enabledDomains, retrievedAt
  }, { allowPlayerRatings: domainEnabled(readiness, "player_ratings"), allowResults: domainEnabled(readiness, "results") });
  const failedEndpoints = endpointAudit.filter(item => item.status !== "success");
  const availableSections = dossier.coverage.filter((item: any) => item.status === "available").length;
  const summary = {
    id: "api-football-sync-" + fixtureId + "-" + startedAt.replace(/[^0-9]/g, ""),
    providerId: PROVIDER_ID,
    fixtureId,
    status: failedEndpoints.length ? "partial" : "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    endpointCount: endpointAudit.length,
    successfulEndpoints: endpointAudit.filter(item => item.status === "success").length,
    failedEndpoints: failedEndpoints.length,
    availableSections,
    playerCount: dossier.playerStatistics.length,
    eventCount: dossier.events.length,
    sourceReportedNotIndependentlyVerified: true,
    aiCalls: 0
  };
  await put("library/model-lab/historical-event-datasets", dossier.id, {
    ...dossier,
    id: dossier.id,
    eventId: String(fixtureId),
    totalRows: 1,
    scoredRows: domainEnabled(readiness, "results") && fixture?.fixture?.status?.short === "FT" ? 1 : 0,
    retrievedAt,
    origin: "provider_historical_data",
    lab: "model-lab"
  });
  await put("library/model-lab/provider-sync-runs", summary.id, summary);
  await put("scheduler-state", "api-football-sync", {
    status: summary.status, providerId: PROVIDER_ID, lastCheck: summary.completedAt,
    latestFixtureId: fixtureId, matchesImported: 1, availableSections,
    endpointCount: summary.endpointCount, successfulEndpoints: summary.successfulEndpoints
  });
  return { ...summary, dossier: { id: dossier.id, fixture: dossier.fixture, competition: dossier.competition, coverage: dossier.coverage, provenance: dossier.provenance } };
}

export async function findApiFootballFixtures(input: { date: string; leagueId?: number; teamId?: number }) {
  const date = text(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T00:00:00Z"))) {
    throw new Error("api_football_invalid_date");
  }
  const { apiKey, readiness } = requireAuthorizedConfig();
  if (!domainEnabled(readiness, "fixtures")) throw new Error("api_football_sync_blocked:fixtures_domain_not_enabled");
  const params: Record<string, string | number> = { date, timezone: "Europe/Warsaw" };
  if (Number.isSafeInteger(input.leagueId) && Number(input.leagueId) > 0) params.league = Number(input.leagueId);
  if (Number.isSafeInteger(input.teamId) && Number(input.teamId) > 0) params.team = Number(input.teamId);
  const result = await apiRequest("fixtures", params, apiKey);
  return {
    providerId: PROVIDER_ID, date, results: apiRows(result.data), endpointAudit: [result.audit],
    note: "Fixture search results are source-reported; sync an exact fixture ID to retrieve the detailed dossier."
  };
}

export async function getApiFootballSyncStatus() {
  const readiness = getApiFootballReadiness();
  const state = await get<any>("scheduler-state", "api-football-sync");
  const connection = await get<any>("scheduler-state", "api-football-connection");
  const runs = await list<any>("library/model-lab/provider-sync-runs", 100);
  const recentRuns = runs.filter(run => run.providerId === PROVIDER_ID)
    .sort((a, b) => Date.parse(b.startedAt || b.checkedAt || "") - Date.parse(a.startedAt || a.checkedAt || ""))
    .slice(0, 10);
  return {
    ...readiness,
    lastSync: state?.lastCheck || null,
    totals: state || null,
    lastConnectionTest: connection?.checkedAt || null,
    connectionTest: connection ? { status: connection.status, quota: connection.quota, checkedAt: connection.checkedAt } : null,
    recentRuns
  };
}

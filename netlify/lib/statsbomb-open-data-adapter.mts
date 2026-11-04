import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";
import { DATA_PROVIDER_REGISTRY } from "./data-provider-registry.mts";
import { normalizeStatsBombMatch } from "./statsbomb-normalize.mjs";

const ROOT = "https://raw.githubusercontent.com/hudl/open-data/master/data";
const REPOSITORY = "https://github.com/hudl/open-data";
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";
const MAX_MATCHES = 15;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;
const CONFIRMATION = "I_CONFIRM_PRIVATE_STATSBOMB_RESEARCH_USE";

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error("statsbomb_http_" + response.status + ":" + url);
  const raw = await response.text();
  const bytes = Buffer.byteLength(raw);
  if (bytes > MAX_FILE_BYTES) throw new Error("statsbomb_file_exceeds_12mb:" + url);
  let data: any;
  try { data = JSON.parse(raw); }
  catch { throw new Error("statsbomb_invalid_json:" + url); }
  return { data, raw, bytes };
}

function assertManualResearchUse(confirm: unknown) {
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === "statsbomb-open-data");
  if (!provider || provider.licenceReview !== "documented_open_terms" || provider.automationAllowed) {
    throw new Error("statsbomb_research_import_blocked: source must remain manual and research-only.");
  }
  if (confirm !== CONFIRMATION) {
    throw new Error("statsbomb_research_import_blocked: explicit private non-commercial research confirmation is required.");
  }
  return provider;
}

function numericId(value: unknown, field: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("statsbomb_invalid_" + field);
  return n;
}

export async function getStatsBombOpenDataCatalog() {
  const { data, raw } = await getJson(ROOT + "/competitions.json");
  if (!Array.isArray(data)) throw new Error("statsbomb_competitions_schema_invalid");
  const competitions = data.flatMap((item: any) => {
    const competitionId = Number(item?.competition_id);
    const seasonId = Number(item?.season_id);
    const competitionName = typeof item?.competition_name === "string" ? item.competition_name : "";
    const seasonName = typeof item?.season_name === "string" ? item.season_name : "";
    if (!Number.isSafeInteger(competitionId) || !Number.isSafeInteger(seasonId) || !competitionName || !seasonName) return [];
    return [{
      competitionId,
      seasonId,
      competitionName,
      countryName: typeof item?.country_name === "string" ? item.country_name : null,
      competitionGender: typeof item?.competition_gender === "string" ? item.competition_gender : null,
      seasonName,
      competitionYouth: Boolean(item?.competition_youth),
      competitionInternational: Boolean(item?.competition_international)
    }];
  }).sort((a: any, b: any) =>
    a.competitionName.localeCompare(b.competitionName) || b.seasonName.localeCompare(a.seasonName)
  );
  return {
    providerId: "statsbomb-open-data",
    repository: REPOSITORY,
    fetchedAt: new Date().toISOString(),
    catalogChecksum: createHash("sha256").update(raw).digest("hex"),
    competitionSeasonCount: competitions.length,
    competitions
  };
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

async function getOptionalJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(25_000)
  });
  if (response.status === 404) return { data: null, raw: "", bytes: 0, missing: true };
  if (!response.ok) throw new Error("statsbomb_http_" + response.status + ":" + url);
  const raw = await response.text();
  const bytes = Buffer.byteLength(raw);
  if (bytes > MAX_FILE_BYTES) throw new Error("statsbomb_file_exceeds_12mb:" + url);
  let data: any;
  try { data = JSON.parse(raw); }
  catch { throw new Error("statsbomb_invalid_json:" + url); }
  return { data, raw, bytes, missing: false };
}

export async function syncStatsBombOpenDataResearch(input: {
  competitionId: unknown;
  seasonId: unknown;
  maxMatches?: unknown;
  confirmResearchUse?: unknown;
}) {
  const provider = assertManualResearchUse(input.confirmResearchUse);
  const competitionId = numericId(input.competitionId, "competition_id");
  const seasonId = numericId(input.seasonId, "season_id");
  const maxMatches = Math.min(MAX_MATCHES, Math.max(1, Math.trunc(Number(input.maxMatches) || 10)));
  const startedAt = new Date().toISOString();

  const catalog = await getStatsBombOpenDataCatalog();
  const selected = catalog.competitions.find((item: any) =>
    item.competitionId === competitionId && item.seasonId === seasonId
  );
  if (!selected) throw new Error("statsbomb_competition_season_not_in_public_catalog");

  const matchesUrl = ROOT + "/matches/" + competitionId + "/" + seasonId + ".json";
  const matchesFile = await getJson(matchesUrl);
  if (!Array.isArray(matchesFile.data)) throw new Error("statsbomb_matches_schema_invalid");
  const validMatches = matchesFile.data.filter((match: any) =>
    Number.isSafeInteger(Number(match?.match_id)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(match?.match_date || "")) &&
    typeof match?.home_team?.name === "string" &&
    typeof match?.away_team?.name === "string"
  );
  // Select the latest bounded sample, then put it back into chronological order.
  const chosen = [...validMatches]
    .sort((a: any, b: any) => String(b.match_date).localeCompare(String(a.match_date)))
    .slice(0, maxMatches)
    .sort((a: any, b: any) => String(a.match_date).localeCompare(String(b.match_date)));

  if (!chosen.length) throw new Error("statsbomb_no_valid_matches_in_selected_season");

  const fileDigests: string[] = [createHash("sha256").update(matchesFile.raw).digest("hex")];
  let rawBytes = matchesFile.bytes;
  let eventsImported = 0;
  let lineupsImported = 0;
  const failures: any[] = [];

  const records = await mapLimit(chosen, 2, async (match: any) => {
    const matchId = Number(match.match_id);
    const eventsUrl = ROOT + "/events/" + matchId + ".json";
    const lineupsUrl = ROOT + "/lineups/" + matchId + ".json";
    try {
      const [eventsFile, lineupsFile] = await Promise.all([
        getOptionalJson(eventsUrl),
        getOptionalJson(lineupsUrl)
      ]);
      rawBytes += eventsFile.bytes + lineupsFile.bytes;
      if (rawBytes > MAX_TOTAL_BYTES) throw new Error("statsbomb_import_exceeds_48mb");
      if (eventsFile.raw) fileDigests.push(createHash("sha256").update(eventsFile.raw).digest("hex"));
      if (lineupsFile.raw) fileDigests.push(createHash("sha256").update(lineupsFile.raw).digest("hex"));
      if (Array.isArray(eventsFile.data) && eventsFile.data.length) eventsImported++;
      if (Array.isArray(lineupsFile.data) && lineupsFile.data.length) lineupsImported++;
      const eventList = Array.isArray(eventsFile.data) ? eventsFile.data : [];
      const lineupList = Array.isArray(lineupsFile.data) ? lineupsFile.data : [];
      if (!eventList.length) failures.push({ matchId, section: "events", reason: eventsFile.missing ? "not_published" : "empty_or_missing" });
      return normalizeStatsBombMatch(match, eventList, lineupList, {
        sourceUrl: matchesUrl,
        sourceFiles: [matchesUrl, eventsFile.missing ? "" : eventsUrl, lineupsFile.missing ? "" : lineupsUrl].filter(Boolean),
        retrievedAt: new Date().toISOString()
      });
    } catch (error) {
      failures.push({ matchId, section: "match_detail", reason: String(error).slice(0, 300) });
      return null;
    }
  });

  const normalized = records.filter(Boolean);
  if (!normalized.length) throw new Error("statsbomb_import_has_no_complete_match_records");

  const rawChecksum = createHash("sha256").update(fileDigests.sort().join("\n")).digest("hex");
  const datasetId = "statsbomb-" + competitionId + "-" + seasonId;
  const dataset = {
    id: datasetId,
    providerId: "statsbomb-open-data",
    sport: "football",
    competitionId,
    competition: selected.competitionName,
    country: selected.countryName,
    seasonId,
    season: selected.seasonName,
    sourceUrl: REPOSITORY + "/tree/master/data",
    sourceLicence: "StatsBomb Open Data public research-use terms; not represented as a general-purpose Creative Commons licence.",
    licenceReference: provider.licenceReference,
    attribution: provider.attribution,
    usageRestriction: "Private, non-commercial football research only. Do not redistribute the raw data. If publishing, sharing or distributing derived analysis, credit StatsBomb and use the official StatsBomb logo.",
    retrievedAt: new Date().toISOString(),
    rawChecksum,
    totalRows: normalized.length,
    scoredRows: normalized.filter((row: any) => Array.isArray(row.fullTimeScore)).length,
    matchesWithEventData: normalized.filter((row: any) => row.details?.events?.length > 0).length,
    matchesWithLineups: normalized.filter((row: any) => row.details?.lineups?.length > 0).length,
    eventRows: normalized.reduce((sum: number, row: any) => sum + Number(row.details?.events?.length || 0), 0),
    records: normalized,
    origin: "provider_historical_data",
    lab: "model-lab",
    researchOnly: true,
    humanCouponLabTouched: false,
    importWindow: { selection: "latest_bounded_matches_in_selected_competition_season", maxMatches, returnedMatches: normalized.length },
    failures: failures.slice(0, 100),
    startedAt,
    completedAt: new Date().toISOString(),
    status: failures.length || normalized.length < chosen.length ? "partial" : "completed"
  };

  await put("library/model-lab/historical-event-datasets", datasetId, dataset);
  const run = {
    id: "statsbomb-import-" + competitionId + "-" + seasonId + "-" + startedAt.slice(0, 10),
    providerId: "statsbomb-open-data",
    status: dataset.status,
    competition: selected.competitionName,
    season: selected.seasonName,
    matchesImported: normalized.length,
    matchesWithScores: dataset.scoredRows,
    matchesWithEvents: eventsImported,
    matchesWithLineups: lineupsImported,
    eventRows: dataset.eventRows,
    failures: failures.length,
    rawBytes,
    rawChecksum,
    startedAt,
    completedAt: dataset.completedAt,
    origin: "provider_historical_data",
    researchOnly: true,
    aiCalls: 0,
    humanCouponLabTouched: false
  };
  await put("library/model-lab/provider-sync-runs", run.id, run);
  await put("scheduler-state", "statsbomb-open-data", {
    status: dataset.status,
    lastCheck: run.completedAt,
    competitionId,
    seasonId,
    competition: selected.competitionName,
    season: selected.seasonName,
    matchesImported: normalized.length,
    eventRows: dataset.eventRows,
    failures: failures.length,
    datasetId
  });
  return { ...run, datasetId, sourceLicence: dataset.sourceLicence, attribution: dataset.attribution };
}

export async function getStatsBombOpenDataStatus() {
  const [state, datasets] = await Promise.all([
    get<any>("scheduler-state", "statsbomb-open-data"),
    list<any>("library/model-lab/historical-event-datasets", 1000)
  ]);
  const statsbomb = datasets.filter(item => item.providerId === "statsbomb-open-data");
  return {
    providerId: "statsbomb-open-data",
    status: state?.status || "not_imported",
    lastCheck: state?.lastCheck || null,
    lastImport: state || null,
    datasetCount: statsbomb.length,
    matchesImported: statsbomb.reduce((sum, dataset) => sum + Number(dataset.totalRows || 0), 0),
    eventRows: statsbomb.reduce((sum, dataset) => sum + Number(dataset.eventRows || 0), 0),
    accessMode: "manual_research_import",
    automationAllowed: false,
    aiCalls: 0
  };
}

export const STATSBOMB_RESEARCH_CONFIRMATION = CONFIRMATION;

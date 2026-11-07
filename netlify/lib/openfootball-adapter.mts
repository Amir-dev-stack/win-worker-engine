import { createHash, randomUUID } from "node:crypto";
import { get, put, list } from "./store.mts";
import { assertProviderImportAllowed } from "./data-provider-registry.mts";

const API = "https://api.github.com/repos/openfootball/football.json/contents";
const RAW = "https://raw.githubusercontent.com/openfootball/football.json";
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";
const MAX_SEASONS = 3;
const MAX_FILES_PER_SEASON = 24;

async function getJson(url: string) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error("upstream_http_" + response.status + ":" + url);
  return response.json() as Promise<any>;
}

export function isPinnedOpenFootballRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

export function buildOpenFootballDatasetSnapshotId(season: string, fileName: string, sourceRevision: string) {
  if (!normalizedSeason(season) || !/^[a-z]{2}\.\d+\.json$/i.test(fileName) || !isPinnedOpenFootballRevision(sourceRevision)) {
    throw new Error("openfootball_dataset_snapshot_identity_invalid");
  }
  return "openfootball-" + season + "-" + fileName.replace(/\.json$/i, "") + "-r" + sourceRevision.toLowerCase();
}

export function buildOpenFootballSyncRunId(startedAt: string, sourceRevision: string) {
  if (!Number.isFinite(Date.parse(startedAt)) || !isPinnedOpenFootballRevision(sourceRevision)) {
    throw new Error("openfootball_sync_run_identity_invalid");
  }
  return "openfootball-" + Date.parse(startedAt).toString(36) + "-" + sourceRevision.slice(0, 12).toLowerCase() + "-" + randomUUID();
}

function normalizedSeason(name: string) {
  return /^\d{4}-\d{2}$/.test(name);
}

function validScore(score: any) {
  return Array.isArray(score) && score.length === 2 &&
    score.every((n: any) => Number.isInteger(n) && n >= 0 && n <= 30);
}

export async function syncOpenFootballHistoricalData() {
  assertProviderImportAllowed("openfootball-football-json", ["fixtures", "results"]);
  const startedAt = new Date().toISOString();
  const revisionRecord = await getJson("https://api.github.com/repos/openfootball/football.json/commits/master");
  const sourceRevision = revisionRecord?.sha;
  if (!isPinnedOpenFootballRevision(sourceRevision)) throw new Error("openfootball_source_revision_not_pinned");
  const previous = await get<any>("scheduler-state", "openfootball-daily-sync");
  if (previous?.sourceRevision === sourceRevision && previous?.status === "completed") {
    const completedAt = new Date().toISOString();
    const unchanged = {
      id: buildOpenFootballSyncRunId(startedAt, sourceRevision), providerId: "openfootball-football-json",
      status: "unchanged", startedAt, completedAt, sourceRevision, reusedExistingSnapshot: true,
      seasonsAttempted: previous.seasonsAttempted || [], filesFetched: 0,
      matchesImported: Number(previous.matchesImported || 0), matchesWithScores: Number(previous.matchesWithScores || 0),
      failures: [], sourceLicence: "CC0-1.0", sourceUrl: "https://github.com/openfootball/football.json",
      origin: "provider_historical_data", modelLabOnly: true, humanCouponLabTouched: false
    };
    await put("library/model-lab/provider-sync-runs", unchanged.id, unchanged);
    await put("scheduler-state", "openfootball-daily-sync", { ...previous, lastCheck: completedAt, status: "unchanged", sourceRevision });
    return unchanged;
  }
  const root = await getJson(API + "?ref=" + sourceRevision);
  const seasons = (root as any[])
    .filter(x => x.type === "dir" && normalizedSeason(x.name))
    .map(x => x.name)
    .sort((a,b) => b.localeCompare(a))
    .slice(0, MAX_SEASONS);

  const summary: any = {
    id: buildOpenFootballSyncRunId(startedAt, sourceRevision),
    providerId: "openfootball-football-json",
    status: "running",
    startedAt,
    sourceRevision,
    sourceCommitUrl: "https://github.com/openfootball/football.json/commit/" + sourceRevision,
    seasonsAttempted: seasons,
    filesFetched: 0,
    matchesImported: 0,
    matchesWithScores: 0,
    failures: [],
    sourceLicence: "CC0-1.0",
    sourceUrl: "https://github.com/openfootball/football.json",
    origin: "provider_historical_data",
    modelLabOnly: true,
    humanCouponLabTouched: false
  };

  for (const season of seasons) {
    try {
      const entries = await getJson(API + "/" + season + "?ref=" + sourceRevision);
      const files = (entries as any[])
        .filter(x => x.type === "file" && /^[a-z]{2}\.\d+\.json$/i.test(x.name))
        .slice(0, MAX_FILES_PER_SEASON);
      for (const file of files) {
        try {
          const url = RAW + "/" + sourceRevision + "/" + season + "/" + file.name;
          const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
          if (!response.ok) throw new Error("raw_http_" + response.status);
          const raw = await response.text();
          if (raw.length > 3_000_000) throw new Error("dataset_file_too_large");
          const parsed = JSON.parse(raw);
          const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
          const normalized = matches.flatMap((m: any, index: number) => {
            const date = typeof m?.date === "string" ? m.date : "";
            const home = typeof m?.team1 === "string" ? m.team1.trim() : "";
            const away = typeof m?.team2 === "string" ? m.team2.trim() : "";
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !home || !away) return [];
            const ft = validScore(m?.score?.ft) ? m.score.ft : null;
            const ht = validScore(m?.score?.ht) ? m.score.ht : null;
            const identity = [season,file.name,date,home,away,index].join("|");
            const eventId = createHash("sha256").update(identity).digest("hex").slice(0,32);
            return [{
              id:eventId, eventId, sport:"football", season, competitionFile:file.name,
              competition:typeof parsed?.name === "string" ? parsed.name : file.name,
              event:home + " vs " + away, homeTeam:home, awayTeam:away,
              eventStart:date, eventTimePrecision:"date_only", resultAvailableAt:null, trainingEligible:false, round:typeof m?.round === "string" ? m.round : null,
              venue:typeof m?.ground === "string" ? m.ground : null,
              fullTimeScore:ft, halfTimeScore:ht,
              status:ft ? "completed" : "scheduled_or_unscored",
              sourceProvider:"openfootball-football-json",
              sourceUrl:url, retrievedAt:new Date().toISOString(),
              sourceLicence:"CC0-1.0", licenceReference:"https://github.com/openfootball/football.json/blob/" + sourceRevision + "/LICENSE.md", attribution:"OpenFootball football.json — CC0 1.0.", origin:"provider_historical_data",
              rawIndex:index
            }];
          });
          const checksum = createHash("sha256").update(raw).digest("hex");
          const datasetId = buildOpenFootballDatasetSnapshotId(season, file.name, sourceRevision);
          await put("library/model-lab/historical-event-datasets", datasetId, {
            id:datasetId, providerId:"openfootball-football-json", sourceRevision, sourceCommitUrl:"https://github.com/openfootball/football.json/commit/" + sourceRevision, season, competitionFile:file.name,
            competition:parsed?.name || file.name, sourceUrl:url, sourceLicence:"CC0-1.0",
            retrievedAt:new Date().toISOString(), rawChecksum:checksum,
            totalRows:normalized.length, scoredRows:normalized.filter(x=>x.fullTimeScore).length,
            records:normalized, eventTimePrecision:"date_only", resultAvailability:"unknown", trainingEligible:false, origin:"provider_historical_data", lab:"model-lab"
          });
          summary.filesFetched++;
          summary.matchesImported += normalized.length;
          summary.matchesWithScores += normalized.filter(x=>x.fullTimeScore).length;
        } catch (error) {
          summary.failures.push({season,file:file.name,error:String(error).slice(0,500)});
        }
      }
    } catch (error) {
      summary.failures.push({season,error:String(error).slice(0,500)});
    }
  }

  summary.status = summary.filesFetched > 0 ? (summary.failures.length ? "partial" : "completed") : "failed";
  summary.completedAt = new Date().toISOString();
  await put("library/model-lab/provider-sync-runs", summary.id, summary);
  await put("scheduler-state", "openfootball-daily-sync", {
    lastCheck:summary.completedAt, status:summary.status, providerId:summary.providerId,
    filesFetched:summary.filesFetched, matchesImported:summary.matchesImported,
    matchesWithScores:summary.matchesWithScores, failures:summary.failures.length,
    sourceRevision:summary.sourceRevision, seasonsAttempted:summary.seasonsAttempted
  });
  return summary;
}

export function selectLatestOpenFootballSnapshots<T extends {id?:unknown;retrievedAt?:unknown;sourceRevision?:unknown}>(snapshots:T[]):T[] {
  const latest = new Map<string,T>();
  for (const snapshot of snapshots) {
    const id = String(snapshot?.id || "");
    if (!id) continue;
    const logicalId = id.replace(/-r[a-f0-9]{40}$/i, "");
    const current = latest.get(logicalId);
    const parsedNext = Date.parse(String(snapshot.retrievedAt || ""));
    const parsedCurrent = current ? Date.parse(String(current.retrievedAt || "")) : Number.NEGATIVE_INFINITY;
    const nextTime = Number.isFinite(parsedNext) ? parsedNext : Number.NEGATIVE_INFINITY;
    const currentTime = Number.isFinite(parsedCurrent) ? parsedCurrent : Number.NEGATIVE_INFINITY;
    if (!current || nextTime > currentTime ||
        (nextTime === currentTime && String(snapshot.sourceRevision || "") > String(current.sourceRevision || ""))) {
      latest.set(logicalId, snapshot);
    }
  }
  return [...latest.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}

export async function getOpenFootballSyncStatus() {
  const state = await get<any>("scheduler-state","openfootball-daily-sync");
  const [runs, snapshots] = await Promise.all([
    list<any>("library/model-lab/provider-sync-runs",20),
    list<any>("library/model-lab/historical-event-datasets",500)
  ]);
  const providerSnapshots = snapshots.filter(item => item?.providerId === "openfootball-football-json");
  const latestDatasets = selectLatestOpenFootballSnapshots(providerSnapshots);
  const totals = latestDatasets.reduce((sum,item) => ({
    filesFetched: sum.filesFetched + 1,
    matchesImported: sum.matchesImported + Number.isSafeInteger(item.totalRows) ? item.totalRows : 0,
    matchesWithScores: sum.matchesWithScores + Number.isSafeInteger(item.scoredRows) ? item.scoredRows : 0
  }), {filesFetched:0,matchesImported:0,matchesWithScores:0});
  return {
    providerId:"openfootball-football-json", status:state?.status || "not_yet_run",
    lastCheck:state?.lastCheck || null, totals:state || null,
    snapshotCount:providerSnapshots.length, datasetCount:latestDatasets.length,
    datasetTotals:totals,
    recentRuns:runs.filter(run=>run?.providerId==="openfootball-football-json")
      .sort((a,b)=>Date.parse(b.startedAt||"")-Date.parse(a.startedAt||"")).slice(0,5)
  };
}

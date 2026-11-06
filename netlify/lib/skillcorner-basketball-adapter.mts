import { createHash } from "node:crypto";
import { list, put } from "./store.mts";
import { DATA_PROVIDER_REGISTRY } from "./data-provider-registry.mts";
import { parseSkillCornerCsv } from "./skillcorner-basketball-normalize.mjs";

const BASE = "https://raw.githubusercontent.com/SkillCorner/opendata-basketball/main/data/aggregates/";
const FILES = [
  { type: "shots", file: "acb_shotsaggregates_20252026.csv" },
  { type: "drives", file: "acb_drivesaggregates_20252026.csv" },
  { type: "picks", file: "acb_picksaggregates_20252026.csv" }
];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const CONFIRMATION = "I_CONFIRM_SKILLCORNER_ACB_2025_26_RESEARCH";
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";

function assertManualSourceConfirmation(value: unknown) {
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === "skillcorner-open-basketball-acb-2025-26");
  if (!provider || provider.accessMode !== "manual_authorized_import" ||
      provider.licenceReview !== "documented_open_terms" || provider.automationAllowed !== false ||
      !provider.licenceReference || !provider.attribution) {
    throw new Error("skillcorner_import_blocked: provider policy is not approved for manual research import.");
  }
  if (value !== CONFIRMATION) {
    throw new Error("skillcorner_import_blocked: owner confirmation of attribution and research-only use is required.");
  }
  return provider;
}

async function download(file: typeof FILES[number]) {
  const url = BASE + file.file;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/csv" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error("skillcorner_http_" + response.status + ":" + file.file);
  const body = await response.text();
  const bytes = Buffer.byteLength(body);
  if (bytes > MAX_FILE_BYTES) throw new Error("skillcorner_file_exceeds_2mb:" + file.file);
  return { file, url, body, bytes, checksum: createHash("sha256").update(body).digest("hex") };
}

export async function syncSkillCornerBasketballAggregates(input: { confirmResearchUse?: unknown }) {
  const provider = assertManualSourceConfirmation(input.confirmResearchUse);
  const startedAt = new Date().toISOString();
  const downloaded = await Promise.all(FILES.map(download));
  const totalBytes = downloaded.reduce((sum, item) => sum + item.bytes, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("skillcorner_import_exceeds_3mb");
  const datasets = downloaded.map(item => {
    const parsed = parseSkillCornerCsv(item.body, item.file.type, {
      sourceUrl: item.url,
      retrievedAt: new Date().toISOString()
    });
    const datasetId = "skillcorner-acb-2025-2026-" + item.file.type;
    return {
      id: datasetId,
      providerId: "skillcorner-open-basketball-acb-2025-26",
      sport: "basketball",
      competition: "Liga ACB",
      season: "2025-2026",
      aggregateType: item.file.type,
      sourceUrl: item.url,
      repositoryUrl: "https://github.com/SkillCorner/opendata-basketball",
      sourceLicence: "SkillCorner repository includes an MIT licence; its README separately asks users to credit SkillCorner. This import preserves the source attribution.",
      licenceReference: provider.licenceReference,
      attribution: provider.attribution,
      rawChecksum: item.checksum,
      rawBytes: item.bytes,
      retrievedAt: new Date().toISOString(),
      totalRows: parsed.totalRows,
      uniquePlayers: parsed.uniquePlayers,
      uniqueTeams: parsed.uniqueTeams,
      records: parsed.records,
      grain: "player_team_season",
      includesSeasonTotalRows: parsed.records.some(record => record.teamId === null || record.team === "total"),
      origin: "provider_historical_data",
      researchOnly: true,
      rawTrackingDataImported: false,
      humanCouponLabTouched: false
    };
  });

  for (const dataset of datasets) {
    await put("library/model-lab/player-season-aggregate-datasets", dataset.id, dataset);
  }
  const run = {
    id: "skillcorner-acb-2025-2026-" + startedAt.slice(0, 10),
    providerId: "skillcorner-open-basketball-acb-2025-26",
    status: "completed",
    sport: "basketball",
    competition: "Liga ACB",
    season: "2025-2026",
    datasetsImported: datasets.length,
    totalRows: datasets.reduce((sum, dataset) => sum + dataset.totalRows, 0),
    uniquePlayers: new Set(datasets.flatMap(dataset => dataset.records.map(record => record.playerId))).size,
    uniqueTeams: new Set(datasets.flatMap(dataset => dataset.records.filter(record => !record.isSeasonTotalRow).map(record => record.team))).size,
    importedAggregates: datasets.map(dataset => ({
      type: dataset.aggregateType,
      rows: dataset.totalRows,
      uniquePlayers: dataset.uniquePlayers,
      uniqueTeams: dataset.uniqueTeams,
      rawBytes: dataset.rawBytes,
      checksum: dataset.rawChecksum,
      datasetId: dataset.id
    })),
    rawBytes: totalBytes,
    startedAt,
    completedAt: new Date().toISOString(),
    origin: "provider_historical_data",
    researchOnly: true,
    aiCalls: 0,
    humanCouponLabTouched: false,
    note: "Player-team-season aggregates only. This is not match-level play-by-play and must not be counted as separate games. Rows may include both team rows and a season-total row for a player who changed teams; do not sum both for the same player."
  };
  await put("library/model-lab/provider-sync-runs", run.id, run);
  await put("scheduler-state", "skillcorner-open-basketball-acb-2025-26", {
    status: run.status,
    lastCheck: run.completedAt,
    datasetsImported: run.datasetsImported,
    totalRows: run.totalRows,
    uniquePlayers: run.uniquePlayers,
    uniqueTeams: run.uniqueTeams,
    season: run.season
  });
  return run;
}

export async function getSkillCornerBasketballStatus() {
  const datasets = (await list<any>("library/model-lab/player-season-aggregate-datasets", 20))
    .filter(item => item.providerId === "skillcorner-open-basketball-acb-2025-26");
  const runs = await list<any>("library/model-lab/provider-sync-runs", 30);
  const lastRun = runs.filter(item => item.providerId === "skillcorner-open-basketball-acb-2025-26")
    .sort((a,b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")))[0] || null;
  return {
    status: datasets.length ? "imported" : "not_imported",
    datasetCount: datasets.length,
    aggregateRows: datasets.reduce((sum, item) => sum + Number(item.totalRows || 0), 0),
    aggregates: datasets.map(item => ({ type: item.aggregateType, rows: item.totalRows, players: item.uniquePlayers, teams: item.uniqueTeams })),
    lastRun,
    accessMode: "manual_import",
    automationAllowed: false,
    rawTrackingDataImported: false,
    aiCalls: 0
  };
}

export const SKILLCORNER_RESEARCH_CONFIRMATION = CONFIRMATION;

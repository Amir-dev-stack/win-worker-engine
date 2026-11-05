import type { WinFootballResultRow } from "./ml-football-importer.mts";

export type WinFootballResultWithAvailability = WinFootballResultRow & {
  /** Source-recorded instant when the final score became available to WIN. */
  resultAvailableAt: string;
};

export type WinFootballFeatureExample = {
  eventId: string;
  datasetId: string;
  eventStart: string;
  predictionCutoff: string;
  featureSchemaVersion: "win.football.form.v1";
  features: Record<string, { value: number; availableAt: string; sourceId: string }>;
  evidence: {
    homeMatchesUsed: number;
    awayMatchesUsed: number;
    excludedFutureOrUnavailableRows: number;
  };
};

export class WinFootballFeatureError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "WinFootballFeatureError";
    this.code = code;
  }
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function teamMatchStats(rows: WinFootballResultWithAvailability[], teamId: string) {
  const played = rows.filter(row => row.homeTeamId === teamId || row.awayTeamId === teamId);
  const recent = played.slice(-5);
  if (recent.length === 0) return null;
  let points = 0, scored = 0, conceded = 0, wins = 0, draws = 0, losses = 0;
  for (const row of recent) {
    const isHome = row.homeTeamId === teamId;
    const goalsFor = isHome ? row.homeGoals : row.awayGoals;
    const goalsAgainst = isHome ? row.awayGoals : row.homeGoals;
    scored += goalsFor;
    conceded += goalsAgainst;
    if (goalsFor > goalsAgainst) { points += 3; wins++; }
    else if (goalsFor === goalsAgainst) { points += 1; draws++; }
    else losses++;
  }
  return {
    matches: recent.length,
    pointsPerMatch: points / recent.length,
    goalsForPerMatch: scored / recent.length,
    goalsAgainstPerMatch: conceded / recent.length,
    wins, draws, losses,
    lastResultAvailableAt: recent.reduce((latest, row) =>
      Date.parse(row.resultAvailableAt) > Date.parse(latest) ? row.resultAvailableAt : latest,
      recent[0].resultAvailableAt),
    sourceIds: recent.map(row => row.sourceRecordId)
  };
}

/**
 * Creates a small, auditable last-five form feature set. A historical result
 * is eligible only when its source explicitly supplies resultAvailableAt at
 * or before the target prediction cutoff. This function neither trains nor
 * persists anything and never infers availability from kickoff time.
 */
export function buildWinFootballPointInTimeFeatures(args: {
  datasetId: string;
  historicalRows: WinFootballResultWithAvailability[];
  target: { eventId: string; kickoff: string; homeTeamId: string; awayTeamId: string };
  predictionCutoff: string;
}): WinFootballFeatureExample {
  if (!args || typeof args.datasetId !== "string" || !args.datasetId.trim()) {
    throw new WinFootballFeatureError("dataset_id_required");
  }
  const cutoff = timestamp(args.predictionCutoff);
  const kickoff = timestamp(args.target?.kickoff);
  if (cutoff === null || kickoff === null || cutoff >= kickoff) {
    throw new WinFootballFeatureError("prediction_cutoff_must_precede_target_kickoff");
  }
  if (!args.target.eventId || !args.target.homeTeamId || !args.target.awayTeamId ||
      args.target.homeTeamId === args.target.awayTeamId) {
    throw new WinFootballFeatureError("target_identity_invalid");
  }
  if (!Array.isArray(args.historicalRows)) throw new WinFootballFeatureError("historical_rows_required");

  const eligible: WinFootballResultWithAvailability[] = [];
  const seenEvents = new Set<string>();
  const seenSources = new Set<string>();
  let excluded = 0;
  for (const row of args.historicalRows) {
    if (!row || typeof row.eventId !== "string" || !row.eventId.trim() ||
        typeof row.sourceRecordId !== "string" || !row.sourceRecordId.trim() ||
        seenEvents.has(row.eventId) || seenSources.has(row.sourceRecordId)) {
      throw new WinFootballFeatureError("historical_row_identity_duplicate_or_invalid");
    }
    seenEvents.add(row.eventId);
    seenSources.add(row.sourceRecordId);
    const rowKickoff = timestamp(row?.kickoff);
    const availableAt = timestamp(row?.resultAvailableAt);
    const validScores = row?.scoreBasis === "regulation_time" &&
      Number.isSafeInteger(row?.homeGoals) && row.homeGoals >= 0 &&
      Number.isSafeInteger(row?.awayGoals) && row.awayGoals >= 0;
    if (!row || row.eventId === args.target.eventId || row.homeTeamId === row.awayTeamId ||
        rowKickoff === null || availableAt === null || !validScores ||
        rowKickoff >= cutoff || availableAt > cutoff) {
      excluded++;
      continue;
    }
    eligible.push(row);
  }
  eligible.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) ||
    a.eventId.localeCompare(b.eventId));

  const home = teamMatchStats(eligible, args.target.homeTeamId);
  const away = teamMatchStats(eligible, args.target.awayTeamId);
  const features: WinFootballFeatureExample["features"] = {};
  const addTeam = (prefix: "home" | "away", stats: ReturnType<typeof teamMatchStats>) => {
    if (!stats) return;
    const sourceId = stats.sourceIds.join(",");
    const provenance = { availableAt: stats.lastResultAvailableAt, sourceId };
    features[prefix + "_last5_matches"] = { value: stats.matches, ...provenance };
    features[prefix + "_last5_points_per_match"] = { value: stats.pointsPerMatch, ...provenance };
    features[prefix + "_last5_goals_for_per_match"] = { value: stats.goalsForPerMatch, ...provenance };
    features[prefix + "_last5_goals_against_per_match"] = { value: stats.goalsAgainstPerMatch, ...provenance };
    features[prefix + "_last5_wins"] = { value: stats.wins, ...provenance };
    features[prefix + "_last5_draws"] = { value: stats.draws, ...provenance };
    features[prefix + "_last5_losses"] = { value: stats.losses, ...provenance };
  };
  addTeam("home", home);
  addTeam("away", away);

  return {
    eventId: args.target.eventId,
    datasetId: args.datasetId,
    eventStart: args.target.kickoff,
    predictionCutoff: args.predictionCutoff,
    featureSchemaVersion: "win.football.form.v1",
    features,
    evidence: {
      homeMatchesUsed: home?.matches ?? 0,
      awayMatchesUsed: away?.matches ?? 0,
      excludedFutureOrUnavailableRows: excluded
    }
  };
}

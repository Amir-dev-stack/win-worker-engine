import { createHash } from "node:crypto";
import { parseStrictIsoTimestamp } from "./strict-timestamp.mts";
import { validateSnapshotBatch, type SnapshotEnvelope } from "./evidence-snapshot-envelope.mts";

export type TeamAvailabilityEvidence = {
  evidenceId: string;
  teamId: string;
  sourceSnapshotId: string;
  observedAt: string;
  availableAt: string;
  status: "confirmed_lineup" | "provisional" | "availability_report";
  expectedStartingSlots: number;
  confirmedStartingSlots: number;
  confirmedAbsences: number;
  questionablePlayers: number;
};

export type TeamStrengthOptions = {
  asOf: string;
  sportId: string;
  competitionId: string;
  seasonId: string;
  seasonStart: string;
  teamIds: readonly [string, string];
  maxResultRecords: number;
  maxResultAgeMs: number;
  minSampleSize: number;
  recentWindow: number;
  maxAvailabilityRecords: number;
  availabilityEvidence?: readonly TeamAvailabilityEvidence[];
};

type Diagnostic =
  | "AVAILABILITY_CONFLICT"
  | "AVAILABILITY_LIMIT_EXCEEDED"
  | "CONFLICTING_EVENT_IDENTITY"
  | "CONFLICTING_EVENT_RESULT"
  | "INSUFFICIENT_SAMPLE"
  | "INVALID_AVAILABILITY"
  | "NO_ELIGIBLE_RESULTS";

type Match = {
  eventId: string;
  eventTime: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  snapshotIds: string[];
  providerIds: string[];
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SCHEMA_VERSION = "win.team-strength.v1" as const;
const OPPONENT_ADJUSTMENT_FACTOR = 0.5;

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Strength values must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Strength values must be JSON-compatible");
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function emptyStats() {
  return { played: 0, wins: 0, draws: 0, losses: 0, points: 0, pointsPerGame: null, goalsFor: 0, goalsAgainst: 0, goalDifferencePerGame: null };
}

function teamStats(teamId: string, matches: Match[]) {
  if (!matches.length) return emptyStats();
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const match of matches) {
    const home = match.homeTeamId === teamId;
    const own = home ? match.homeScore : match.awayScore;
    const opposing = home ? match.awayScore : match.homeScore;
    goalsFor += own;
    goalsAgainst += opposing;
    if (own > opposing) wins++;
    else if (own < opposing) losses++;
    else draws++;
  }
  const points = wins * 3 + draws;
  return {
    played: matches.length,
    wins,
    draws,
    losses,
    points,
    pointsPerGame: round(points / matches.length),
    goalsFor,
    goalsAgainst,
    goalDifferencePerGame: round((goalsFor - goalsAgainst) / matches.length)
  };
}

function eventIdentity(row: SnapshotEnvelope) {
  return [row.sportId, row.competitionId, row.homeParticipantId, row.awayParticipantId, row.eventTime].join("|");
}

function resultIdentity(row: SnapshotEnvelope) {
  const payload = row.payload as { status: string; homeScore: number; awayScore: number };
  return `${payload.status}|${payload.homeScore}|${payload.awayScore}`;
}

function resolveMatches(rows: SnapshotEnvelope[]) {
  const groups = new Map<string, SnapshotEnvelope[]>();
  for (const row of rows) groups.set(row.canonicalEventId, [...(groups.get(row.canonicalEventId) ?? []), row]);
  const diagnostics = [] as Diagnostic[];
  const conflictedEventIds = [] as string[];
  const matches = [] as Match[];
  for (const [eventId, group] of groups) {
    if (new Set(group.map(eventIdentity)).size > 1) {
      diagnostics.push("CONFLICTING_EVENT_IDENTITY");
      conflictedEventIds.push(eventId);
      continue;
    }
    if (new Set(group.map(resultIdentity)).size > 1) {
      diagnostics.push("CONFLICTING_EVENT_RESULT");
      conflictedEventIds.push(eventId);
      continue;
    }
    const ordered = [...group].sort((left, right) => left.snapshotId.localeCompare(right.snapshotId));
    const first = ordered[0];
    const payload = first.payload as { status: "final"; homeScore: number; awayScore: number };
    matches.push({
      eventId,
      eventTime: first.eventTime,
      homeTeamId: first.homeParticipantId,
      awayTeamId: first.awayParticipantId,
      homeScore: payload.homeScore,
      awayScore: payload.awayScore,
      snapshotIds: ordered.map(row => row.snapshotId).sort(),
      providerIds: [...new Set(ordered.map(row => row.providerId))].sort()
    });
  }
  return {
    matches: matches.sort((left, right) => Date.parse(left.eventTime) - Date.parse(right.eventTime) || left.eventId.localeCompare(right.eventId)),
    diagnostics,
    conflictedEventIds: [...new Set(conflictedEventIds)].sort()
  };
}

function availabilityFor(teamId: string, evidence: TeamAvailabilityEvidence[], asOfMs: number) {
  const diagnostics = [] as Diagnostic[];
  const normalized = [] as Array<TeamAvailabilityEvidence & { contentId: string }>;
  for (const item of evidence.filter(row => row?.teamId === teamId)) {
    const observedMs = parseStrictIsoTimestamp(item?.observedAt);
    const availableMs = parseStrictIsoTimestamp(item?.availableAt);
    if (!safeId(item?.evidenceId) || !HASH.test(String(item?.sourceSnapshotId)) || observedMs === null || availableMs === null || observedMs > availableMs || availableMs > asOfMs || !["confirmed_lineup", "provisional", "availability_report"].includes(item?.status) || !Number.isSafeInteger(item?.expectedStartingSlots) || item.expectedStartingSlots < 1 || item.expectedStartingSlots > 50 || !Number.isSafeInteger(item?.confirmedStartingSlots) || item.confirmedStartingSlots < 0 || item.confirmedStartingSlots > item.expectedStartingSlots || !Number.isSafeInteger(item?.confirmedAbsences) || item.confirmedAbsences < 0 || item.confirmedAbsences > 50 || !Number.isSafeInteger(item?.questionablePlayers) || item.questionablePlayers < 0 || item.questionablePlayers > 50) {
      diagnostics.push("INVALID_AVAILABILITY");
      continue;
    }
    normalized.push({ ...item, contentId: sha256(item) });
  }
  const byEvidenceId = new Map<string, Array<TeamAvailabilityEvidence & { contentId: string }>>();
  for (const row of normalized) byEvidenceId.set(row.evidenceId, [...(byEvidenceId.get(row.evidenceId) ?? []), row]);
  const conflicting = new Set([...byEvidenceId].filter(([, rows]) => new Set(rows.map(row => row.contentId)).size > 1).map(([id]) => id));
  if (conflicting.size) diagnostics.push("AVAILABILITY_CONFLICT");
  const eligible = [...byEvidenceId].filter(([id]) => !conflicting.has(id)).map(([, rows]) => rows[0])
    .sort((left, right) => Date.parse(right.availableAt) - Date.parse(left.availableAt) || left.evidenceId.localeCompare(right.evidenceId));
  const latest = eligible[0];
  if (!latest) return { status: conflicting.size ? "conflicted" : "not_provided", latestEvidence: null, diagnostics: [...new Set(diagnostics)].sort() };
  const confirmed = latest.status === "confirmed_lineup" && latest.confirmedStartingSlots === latest.expectedStartingSlots;
  return {
    status: confirmed ? "confirmed" : "uncertain",
    latestEvidence: {
      evidenceId: latest.evidenceId,
      sourceSnapshotId: latest.sourceSnapshotId,
      observedAt: latest.observedAt,
      availableAt: latest.availableAt,
      evidenceClass: latest.status,
      expectedStartingSlots: latest.expectedStartingSlots,
      confirmedStartingSlots: latest.confirmedStartingSlots,
      confirmedAbsences: latest.confirmedAbsences,
      questionablePlayers: latest.questionablePlayers
    },
    diagnostics: [...new Set(diagnostics)].sort()
  };
}

export function buildTeamStrengthSnapshot(resultInputs: unknown, options: TeamStrengthOptions) {
  if (!Array.isArray(resultInputs)) throw new TypeError("Result evidence must be an array");
  const asOfMs = parseStrictIsoTimestamp(options?.asOf);
  const seasonStartMs = parseStrictIsoTimestamp(options?.seasonStart);
  if (asOfMs === null || seasonStartMs === null || seasonStartMs >= asOfMs || !safeId(options?.sportId) || !safeId(options?.competitionId) || !safeId(options?.seasonId) || !Array.isArray(options?.teamIds) || options.teamIds.length !== 2 || options.teamIds.some(teamId => !safeId(teamId)) || options.teamIds[0] === options.teamIds[1]) throw new TypeError("Invalid team strength identity, season or asOf");
  if (!Number.isSafeInteger(options.maxResultRecords) || options.maxResultRecords < 1 || options.maxResultRecords > 500 || !Number.isSafeInteger(options.maxResultAgeMs) || options.maxResultAgeMs < 1 || !Number.isSafeInteger(options.minSampleSize) || options.minSampleSize < 1 || options.minSampleSize > 50 || !Number.isSafeInteger(options.recentWindow) || options.recentWindow < 1 || options.recentWindow > 20 || !Number.isSafeInteger(options.maxAvailabilityRecords) || options.maxAvailabilityRecords < 0 || options.maxAvailabilityRecords > 200) throw new TypeError("Invalid team strength bounds");
  const availabilityInputs = options.availabilityEvidence ?? [];
  if (!Array.isArray(availabilityInputs)) throw new TypeError("Availability evidence must be an array");
  if (availabilityInputs.length > options.maxAvailabilityRecords) {
    const rejected = {
      schemaVersion: SCHEMA_VERSION,
      status: "rejected",
      asOf: options.asOf,
      sportId: options.sportId,
      competitionId: options.competitionId,
      seasonId: options.seasonId,
      seasonStart: options.seasonStart,
      teamIds: [...options.teamIds].sort(),
      teams: [],
      evidence: { inputResultRecords: resultInputs.length, acceptedResultSnapshots: 0, resolvedMatches: 0, conflictedEventIds: [] },
      diagnostics: ["AVAILABILITY_LIMIT_EXCEEDED"] as Diagnostic[]
    };
    return deepFreeze({ ...rejected, strengthSnapshotId: sha256(rejected) });
  }

  const batch = validateSnapshotBatch(resultInputs, {
    asOf: options.asOf,
    maxBatchSize: options.maxResultRecords,
    maxAgeMs: { schedule: options.maxResultAgeMs, result: options.maxResultAgeMs, odds: options.maxResultAgeMs }
  });
  const acceptedResults = batch.accepted.filter(row => row.kind === "result" && row.sportId === options.sportId && row.competitionId === options.competitionId && Date.parse(row.eventTime) >= seasonStartMs);
  const resolved = resolveMatches(acceptedResults);
  const matches = resolved.matches;
  const allTeamIds = [...new Set(matches.flatMap(match => [match.homeTeamId, match.awayTeamId]))].sort();
  const statsByTeam = new Map(allTeamIds.map(teamId => [teamId, teamStats(teamId, matches.filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId))]));
  const totalPoints = [...statsByTeam.values()].reduce((sum, stats) => sum + stats.points, 0);
  const totalAppearances = [...statsByTeam.values()].reduce((sum, stats) => sum + stats.played, 0);
  const competitionAveragePpg = totalAppearances ? round(totalPoints / totalAppearances) : null;
  const diagnostics = [...resolved.diagnostics] as string[];
  if (!matches.length) diagnostics.push("NO_ELIGIBLE_RESULTS");

  const teams = [...options.teamIds].sort().map(teamId => {
    const teamMatches = matches.filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId);
    const chronological = [...teamMatches].sort((left, right) => Date.parse(right.eventTime) - Date.parse(left.eventTime) || left.eventId.localeCompare(right.eventId));
    const home = teamMatches.filter(match => match.homeTeamId === teamId);
    const away = teamMatches.filter(match => match.awayTeamId === teamId);
    const overall = teamStats(teamId, teamMatches);
    const opponentPpg = teamMatches.map(match => statsByTeam.get(match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId)?.pointsPerGame).filter((value): value is number => value !== null && value !== undefined);
    const averageOpponentPpg = opponentPpg.length ? round(opponentPpg.reduce((sum, value) => sum + value, 0) / opponentPpg.length) : null;
    const scheduleAdjustment = averageOpponentPpg !== null && competitionAveragePpg !== null ? round((averageOpponentPpg - competitionAveragePpg) * OPPONENT_ADJUSTMENT_FACTOR) : null;
    const opponentAdjustedPpg = overall.pointsPerGame !== null && scheduleAdjustment !== null ? round(Math.max(0, Math.min(3, overall.pointsPerGame + scheduleAdjustment))) : null;
    const availability = availabilityFor(teamId, availabilityInputs as TeamAvailabilityEvidence[], asOfMs);
    diagnostics.push(...availability.diagnostics);
    const evidenceStatus = overall.played >= options.minSampleSize ? "sufficient_sample" : "insufficient_sample";
    if (evidenceStatus === "insufficient_sample") diagnostics.push("INSUFFICIENT_SAMPLE");
    return {
      teamId,
      evidenceStatus,
      predictiveConfidence: null,
      fullSeason: overall,
      home: teamStats(teamId, home),
      away: teamStats(teamId, away),
      recent: {
        requestedWindow: options.recentWindow,
        availableMatches: Math.min(chronological.length, options.recentWindow),
        stats: teamStats(teamId, chronological.slice(0, options.recentWindow)),
        eventIds: chronological.slice(0, options.recentWindow).map(match => match.eventId)
      },
      opponentContext: {
        method: "descriptive_ppg_plus_half_schedule_delta_v1",
        competitionAveragePpg,
        averageOpponentPpg,
        adjustmentFactor: OPPONENT_ADJUSTMENT_FACTOR,
        scheduleAdjustment,
        opponentAdjustedPpg,
        calibrated: false
      },
      availability
    };
  });

  const body = {
    schemaVersion: SCHEMA_VERSION,
    status: teams.every(team => team.evidenceStatus === "sufficient_sample") && matches.length ? "descriptive_ready" : "insufficient_evidence",
    asOf: options.asOf,
    sportId: options.sportId,
    competitionId: options.competitionId,
    seasonId: options.seasonId,
    seasonStart: options.seasonStart,
    teamIds: [...options.teamIds].sort(),
    teams,
    evidence: {
      inputResultRecords: resultInputs.length,
      acceptedResultSnapshots: acceptedResults.length,
      resolvedMatches: matches.length,
      agreeingDuplicateSnapshots: matches.reduce((sum, match) => sum + Math.max(0, match.snapshotIds.length - 1), 0),
      providerIds: [...new Set(matches.flatMap(match => match.providerIds))].sort(),
      conflictedEventIds: resolved.conflictedEventIds,
      snapshotBatchStatus: batch.status,
      snapshotBatchDiagnostics: batch.diagnostics
    },
    diagnostics: [...new Set(diagnostics)].sort(),
    limitations: [
      "Descriptive statistics only; no calibrated probability or betting recommendation.",
      "Opponent adjustment is a fixed transparent schedule-context heuristic, not a fitted model.",
      "Availability evidence is reported separately and never silently changes the strength score.",
      "Missing evidence is not interpreted as a healthy squad or complete competition coverage."
    ]
  };
  return deepFreeze({ ...body, strengthSnapshotId: sha256(body) });
}

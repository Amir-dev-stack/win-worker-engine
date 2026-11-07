import { createHash } from "node:crypto";
import {
  WIN_ML_DATASET_MANIFEST_VERSION,
  validateWinMLDatasetManifest,
  type WinMLDatasetManifestV1,
  isPinnedWinMLSourceRevision
} from "./ml-data-contract.mts";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export const WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA = "win.football.results.v2" as const;
const MAX_RAW_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 50_000;

export type WinFootballImportSource = {
  datasetId: string;
  providerId: string;
  competition: string;
  season: string;
  sourceUrl: string;
  sourceRevision: string;
  licenceId: string;
  attributionRequired: boolean;
  attributionText?: string;
  retrievedAt: string;
};

export type WinFootballResultRow = {
  sourceRecordId: string;
  eventId: string;
  kickoff: string;
  /** Provider-recorded instant the finished score became available. */
  resultAvailableAt: string;
  competitionId: string;
  season: string;
  homeTeamId: string;
  awayTeamId: string;
  scoreBasis: "regulation_time";
  homeGoals: number;
  awayGoals: number;
};

export class WinFootballImportError extends Error {
  readonly code: string;
  readonly details: string[];
  constructor(code: string, details: string[] = []) {
    super(code);
    this.name = "WinFootballImportError";
    this.code = code;
    this.details = details;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return isStrictIsoTimestamp(value);
}

/**
 * Offline, deterministic importer for an already-obtained normalized result
 * payload. It does not fetch data, infer licence permissions, or approve
 * training. The returned manifest is deliberately research-only.
 */
export function importWinFootballResultsBytes(
  rawBytes: Uint8Array,
  source: WinFootballImportSource
): { manifest: WinMLDatasetManifestV1; rows: WinFootballResultRow[]; rawByteLength: number } {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.byteLength === 0) {
    throw new WinFootballImportError("football_import_payload_empty");
  }
  if (rawBytes.byteLength > MAX_RAW_BYTES) {
    throw new WinFootballImportError("football_import_payload_too_large");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
  } catch {
    throw new WinFootballImportError("football_import_json_invalid");
  }

  if (!parsed || parsed.schemaVersion !== WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA ||
      !Array.isArray(parsed.records)) {
    throw new WinFootballImportError("football_import_schema_unsupported");
  }
  if (parsed.records.length < 1 || parsed.records.length > MAX_ROWS) {
    throw new WinFootballImportError("football_import_row_count_out_of_range");
  }

  const sourceErrors: string[] = [];
  for (const field of ["datasetId", "providerId", "competition", "season", "licenceId"] as const) {
    if (!nonEmpty(source?.[field])) sourceErrors.push(field + "_required");
  }
  try {
    const url = new URL(source?.sourceUrl || "");
    if (url.protocol !== "https:") sourceErrors.push("source_url_must_be_https");
    if (!url.hostname || url.username || url.password) sourceErrors.push("source_url_credentials_or_host_invalid");
  } catch {
    sourceErrors.push("source_url_invalid");
  }
  if (typeof source?.attributionRequired !== "boolean") sourceErrors.push("attribution_permission_required");
  if (source?.attributionRequired && !nonEmpty(source?.attributionText)) sourceErrors.push("required_attribution_missing");
  if (!isPinnedWinMLSourceRevision(source?.sourceRevision)) sourceErrors.push("source_revision_invalid");
  if (!validTimestamp(source?.retrievedAt)) sourceErrors.push("retrieved_at_invalid");
  if (sourceErrors.length) throw new WinFootballImportError("football_import_source_metadata_invalid", sourceErrors);

  const recordIds = new Set<string>();
  const eventIds = new Set<string>();
  const rows: WinFootballResultRow[] = [];
  const errors: string[] = [];
  let datasetCompetitionId: string | null = null;

  for (let index = 0; index < parsed.records.length; index++) {
    const row = parsed.records[index];
    const prefix = "record_" + index + ":";
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(prefix + "record_invalid");
      continue;
    }
    const required = ["sourceRecordId", "eventId", "competitionId", "season", "homeTeamId", "awayTeamId"];
    for (const field of required) if (!nonEmpty(row[field])) errors.push(prefix + field + "_required");
    if (!validTimestamp(row.kickoff)) errors.push(prefix + "kickoff_invalid");
    if (!validTimestamp(row.resultAvailableAt)) errors.push(prefix + "result_available_at_invalid");
    else if (validTimestamp(row.kickoff) && Date.parse(row.resultAvailableAt) < Date.parse(row.kickoff)) errors.push(prefix + "result_available_before_kickoff");
    if (validTimestamp(row.resultAvailableAt) && validTimestamp(source.retrievedAt) && Date.parse(row.resultAvailableAt) > Date.parse(source.retrievedAt)) errors.push(prefix + "result_available_after_source_retrieval");
    if (!Number.isSafeInteger(row.homeGoals) || row.homeGoals < 0 ||
        !Number.isSafeInteger(row.awayGoals) || row.awayGoals < 0) errors.push(prefix + "score_invalid");
    if (row.status !== "finished") errors.push(prefix + "match_not_finished");
    if (nonEmpty(row.season) && row.season !== source.season) errors.push(prefix + "season_mismatch");
    if (nonEmpty(row.competitionId)) {
      if (datasetCompetitionId === null) datasetCompetitionId = row.competitionId;
      else if (row.competitionId !== datasetCompetitionId) errors.push(prefix + "competition_mismatch");
    }
    if (row.scoreBasis !== "regulation_time") errors.push(prefix + "score_basis_must_be_regulation_time");
    if (nonEmpty(row.homeTeamId) && row.homeTeamId === row.awayTeamId) errors.push(prefix + "teams_must_differ");
    if (nonEmpty(row.sourceRecordId)) {
      if (recordIds.has(row.sourceRecordId)) errors.push(prefix + "duplicate_source_record_id");
      recordIds.add(row.sourceRecordId);
    }
    if (nonEmpty(row.eventId)) {
      if (eventIds.has(row.eventId)) errors.push(prefix + "duplicate_event_id");
      eventIds.add(row.eventId);
    }
    if (required.every(field => nonEmpty(row[field])) && validTimestamp(row.kickoff) &&
        validTimestamp(row.resultAvailableAt) && Date.parse(row.resultAvailableAt) >= Date.parse(row.kickoff) &&
        Date.parse(row.resultAvailableAt) <= Date.parse(source.retrievedAt) &&
        Number.isSafeInteger(row.homeGoals) && row.homeGoals >= 0 &&
        Number.isSafeInteger(row.awayGoals) && row.awayGoals >= 0 &&
        row.status === "finished" && row.scoreBasis === "regulation_time" && row.homeTeamId !== row.awayTeamId &&
        row.season === source.season && row.competitionId === datasetCompetitionId) {
      rows.push({
        sourceRecordId: row.sourceRecordId,
        eventId: row.eventId,
        kickoff: row.kickoff,
        resultAvailableAt: row.resultAvailableAt,
        competitionId: row.competitionId,
        season: row.season,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
        scoreBasis: "regulation_time",
        homeGoals: row.homeGoals,
        awayGoals: row.awayGoals
      });
    }
  }
  if (errors.length) throw new WinFootballImportError("football_import_rows_invalid", errors.slice(0, 100));

  rows.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId));
  const contentSha256 = createHash("sha256").update(rawBytes).digest("hex");
  const manifest: WinMLDatasetManifestV1 = {
    manifestVersion: WIN_ML_DATASET_MANIFEST_VERSION,
    datasetId: source.datasetId,
    providerId: source.providerId,
    sport: "association_football",
    competition: source.competition,
    season: source.season,
    sourceUrl: source.sourceUrl,
    sourceRevision: source.sourceRevision,
    licenceId: source.licenceId,
    attributionRequired: source.attributionRequired,
    ...(source.attributionText ? { attributionText: source.attributionText } : {}),
    automationAllowed: false,
    approvedForTraining: false,
    permittedUse: "research_only",
    rowGrain: "match",
    eventTimePrecision: "instant",
    retrievedAt: source.retrievedAt,
    rowCount: rows.length,
    labeledRowCount: rows.length,
    schemaVersion: WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA,
    contentSha256
  };
  const manifestErrors = validateWinMLDatasetManifest(manifest);
  if (manifestErrors.length) throw new WinFootballImportError("football_import_manifest_invalid", manifestErrors);

  return { manifest, rows, rawByteLength: rawBytes.byteLength };
}

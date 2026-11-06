import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  importWinFootballResultsBytes,
  WinFootballImportError,
  WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA
} from "../netlify/lib/ml-football-importer.mts";

const source = {
  datasetId: "synthetic-football-results-v1",
  providerId: "synthetic-fixture",
  competition: "Synthetic League",
  season: "2025-2026",
  sourceUrl: "https://example.test/results.json",
  licenceId: "UNVERIFIED-TEST-FIXTURE",
  attributionRequired: false,
  retrievedAt: "2026-11-05T12:00:00.000Z"
};
const payload = (records = [{
  sourceRecordId: "row-1", eventId: "match-1",
  kickoff: "2026-10-01T18:00:00.000Z",
  resultAvailableAt: "2026-10-01T20:00:00.000Z",
  competitionId: "synthetic-league", season: "2025-2026",
  homeTeamId: "team-a", awayTeamId: "team-b",
  homeGoals: 2, awayGoals: 1, scoreBasis: "regulation_time", status: "finished"
}]) => new TextEncoder().encode(JSON.stringify({
  schemaVersion: WIN_FOOTBALL_RESULTS_SOURCE_SCHEMA, records
}));

test("offline football importer hashes exact source bytes and sorts normalized results", () => {
  const bytes = payload([
    { sourceRecordId: "row-b", eventId: "match-b", kickoff: "2026-10-02T18:00:00.000Z", resultAvailableAt: "2026-10-02T20:00:00.000Z", competitionId: "league", season: "2025-2026", homeTeamId: "a", awayTeamId: "b", homeGoals: 0, awayGoals: 0, scoreBasis: "regulation_time", status: "finished" },
    { sourceRecordId: "row-a", eventId: "match-a", kickoff: "2026-10-01T18:00:00.000Z", resultAvailableAt: "2026-10-01T20:00:00.000Z", competitionId: "league", season: "2025-2026", homeTeamId: "c", awayTeamId: "d", homeGoals: 3, awayGoals: 1, scoreBasis: "regulation_time", status: "finished" }
  ]);
  const result = importWinFootballResultsBytes(bytes, source);
  assert.equal(result.manifest.contentSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.manifest.rowCount, 2);
  assert.equal(result.rows[0].eventId, "match-a");
  assert.equal(result.manifest.approvedForTraining, false);
  assert.equal(result.manifest.permittedUse, "research_only");
  assert.equal(result.manifest.automationAllowed, false);
});

test("offline importer rejects malformed JSON, unsupported schemas and empty payloads", () => {
  assert.throws(() => importWinFootballResultsBytes(new Uint8Array(), source),
    error => error instanceof WinFootballImportError && error.code === "football_import_payload_empty");
  assert.throws(() => importWinFootballResultsBytes(new TextEncoder().encode("{"), source),
    error => error.code === "football_import_json_invalid");
  assert.throws(() => importWinFootballResultsBytes(new TextEncoder().encode(JSON.stringify({ schemaVersion: "other", records: [] })), source),
    error => error.code === "football_import_schema_unsupported");
  assert.throws(() => importWinFootballResultsBytes(new TextEncoder().encode(JSON.stringify({ schemaVersion: "win.football.results.v1", records: [] })), source),
    error => error.code === "football_import_schema_unsupported");
});

test("offline importer rejects duplicate IDs, invalid scores, unplayed rows and date-only kickoffs", () => {
  const valid = {
    sourceRecordId: "row-1", eventId: "match-1", kickoff: "2026-10-01T18:00:00.000Z",
    resultAvailableAt: "2026-10-01T20:00:00.000Z",
    competitionId: "league", season: "2025-2026", homeTeamId: "a", awayTeamId: "b",
    homeGoals: 1, awayGoals: 0, scoreBasis: "regulation_time", status: "finished"
  };
  const duplicate = { ...valid, sourceRecordId: "row-2" };
  assert.throws(() => importWinFootballResultsBytes(payload([valid, duplicate]), source),
    error => error.code === "football_import_rows_invalid" && error.details.includes("record_1:duplicate_event_id"));
  assert.throws(() => importWinFootballResultsBytes(payload([{ ...valid, kickoff: "2026-10-01", homeGoals: -1 }]), source),
    error => error.code === "football_import_rows_invalid" &&
      error.details.includes("record_0:kickoff_invalid") && error.details.includes("record_0:score_invalid"));
  assert.throws(() => importWinFootballResultsBytes(payload([{ ...valid, status: "scheduled" }]), source),
    error => error.details.includes("record_0:match_not_finished"));
});

test("offline importer requires HTTPS source provenance and attribution when required", () => {
  assert.throws(() => importWinFootballResultsBytes(payload(), { ...source, sourceUrl: "http://example.test/data" }),
    error => error.code === "football_import_source_metadata_invalid" && error.details.includes("source_url_must_be_https"));
  assert.throws(() => importWinFootballResultsBytes(payload(), { ...source, attributionRequired: true }),
    error => error.code === "football_import_source_metadata_invalid" && error.details.includes("required_attribution_missing"));
});


test("offline importer rejects ambiguous or extra-time score bases", () => {
  const valid = {
    sourceRecordId: "row-1", eventId: "match-1", kickoff: "2026-10-01T18:00:00.000Z",
    competitionId: "league", season: "2025-2026", homeTeamId: "a", awayTeamId: "b",
    homeGoals: 1, awayGoals: 0, scoreBasis: "includes_extra_time", status: "finished"
  };
  assert.throws(() => importWinFootballResultsBytes(payload([valid]), source),
    error => error.code === "football_import_rows_invalid" &&
      error.details.includes("record_0:score_basis_must_be_regulation_time"));
});


test("offline importer requires source-recorded result availability after kickoff and before retrieval", () => {
  const valid = {
    sourceRecordId: "row-1", eventId: "match-1", kickoff: "2026-10-01T18:00:00.000Z",
    resultAvailableAt: "2026-10-01T20:00:00.000Z",
    competitionId: "league", season: "2025-2026", homeTeamId: "a", awayTeamId: "b",
    homeGoals: 1, awayGoals: 0, scoreBasis: "regulation_time", status: "finished"
  };
  const imported = importWinFootballResultsBytes(payload([valid]), source);
  assert.equal(imported.rows[0].resultAvailableAt, valid.resultAvailableAt);
  assert.throws(() => importWinFootballResultsBytes(payload([{ ...valid, resultAvailableAt: undefined }]), source),
    error => error.details.includes("record_0:result_available_at_invalid"));
  assert.throws(() => importWinFootballResultsBytes(payload([{ ...valid, resultAvailableAt: "2026-10-01T17:00:00.000Z" }]), source),
    error => error.details.includes("record_0:result_available_before_kickoff"));
  assert.throws(() => importWinFootballResultsBytes(payload([{ ...valid, resultAvailableAt: "2026-11-06T00:00:00.000Z" }]), source),
    error => error.details.includes("record_0:result_available_after_source_retrieval"));
});

test("offline importer rejects impossible calendar timestamps and mixed dataset scope", () => {
  const valid = {
    sourceRecordId: "row-1", eventId: "match-1", kickoff: "2026-10-01T18:00:00.000Z",
    resultAvailableAt: "2026-10-01T20:00:00.000Z",
    competitionId: "league-a", season: "2025-2026", homeTeamId: "a", awayTeamId: "b",
    homeGoals: 1, awayGoals: 0, scoreBasis: "regulation_time", status: "finished"
  };
  assert.throws(
    () => importWinFootballResultsBytes(payload([{ ...valid, kickoff: "2026-02-31T18:00:00.000Z" }]), source),
    error => error.code === "football_import_rows_invalid" && error.details.includes("record_0:kickoff_invalid")
  );
  assert.throws(
    () => importWinFootballResultsBytes(payload([{ ...valid, season: "2024-2025" }]), source),
    error => error.code === "football_import_rows_invalid" && error.details.includes("record_0:season_mismatch")
  );
  assert.throws(
    () => importWinFootballResultsBytes(payload([
      valid,
      { ...valid, sourceRecordId: "row-2", eventId: "match-2", competitionId: "league-b" }
    ]), source),
    error => error.code === "football_import_rows_invalid" && error.details.includes("record_1:competition_mismatch")
  );
});

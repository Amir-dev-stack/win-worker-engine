import test from "node:test";
import assert from "node:assert/strict";
import { parseSkillCornerCsv } from "../netlify/lib/skillcorner-basketball-normalize.mjs";

const headers = "competition_id,competition_name,season_id,season_name,player_id,player_name,team_id,team_name,games_played,attempts,fg_percentage,zone_rim_attempts,handler_total_picks";
const csv = [
  headers,
  '8,"Liga ACB",51,2025-2026,446,"Kameron Taylor",1325,"Valencia BC",6,42,0.5238,12,18',
  '8,"Liga ACB",51,2025-2026,446,"Kameron Taylor",,total,6,42,0.5238,12,18',
  '8,"Liga ACB",51,2025-2026,96118,"Alvaro Fernandez",1319,"Coviran Granada",3,2,,1,0'
].join("\n");

test("SkillCorner CSV preserves player-team-season identity and numeric aggregate fields", () => {
  const parsed = parseSkillCornerCsv(csv, "shots", {
    sourceUrl: "https://raw.githubusercontent.com/SkillCorner/opendata-basketball/main/data/aggregates/acb_shotsaggregates_20252026.csv",
    retrievedAt: "2026-11-05T09:00:00.000Z"
  });
  assert.equal(parsed.aggregateType, "shots");
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.uniquePlayers, 2);
  assert.equal(parsed.uniqueTeams, 2);
  const row = parsed.records[0];
  assert.equal(row.playerId, "446");
  assert.equal(row.player, "Kameron Taylor");
  assert.equal(row.team, "Valencia BC");
  assert.equal(row.gamesPlayed, 6);
  assert.equal(row.statistics.attempts, 42);
  assert.equal(row.statistics.fg_percentage, 0.5238);
  assert.equal(row.sourceProvider, "skillcorner-open-basketball-acb-2025-26");
  assert.equal(row.sourceUrl.includes("acb_shotsaggregates_20252026.csv"), true);
  assert.equal(row.retrievedAt, "2026-11-05T09:00:00.000Z");
});

test("SkillCorner traded-player total rows are explicitly labelled and remain separate", () => {
  const parsed = parseSkillCornerCsv(csv, "shots");
  const rows = parsed.records.filter(row => row.playerId === "446");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].isSeasonTotalRow, false);
  assert.equal(rows[1].team, "total");
  assert.equal(rows[1].teamId, null);
  assert.equal(rows[1].isSeasonTotalRow, true);
  assert.notEqual(rows[0], rows[1]);
});

test("SkillCorner missing metrics remain null instead of becoming zero", () => {
  const parsed = parseSkillCornerCsv(csv, "shots");
  const alvaro = parsed.records.find(row => row.playerId === "96118");
  assert.ok(alvaro);
  assert.equal(alvaro.statistics.fg_percentage, null);
  assert.equal(alvaro.statistics.attempts, 2);
  assert.equal(alvaro.statistics.handler_total_picks, 0);
});

test("SkillCorner CSV parser handles quoted commas, escaped quotes and CRLF rows", () => {
  const sample = [
    headers,
    '8,"Liga, ACB",51,2025-2026,700,"Player ""A""",1325,"Valencia BC",1,10,0.4,2,3'
  ].join("\r\n");
  const parsed = parseSkillCornerCsv(sample, "drives");
  assert.equal(parsed.records[0].competition, "Liga, ACB");
  assert.equal(parsed.records[0].player, 'Player "A"');
  assert.equal(parsed.records[0].aggregateType, "drives");
});

test("SkillCorner rejects malformed or unsupported aggregate CSVs", () => {
  assert.throws(() => parseSkillCornerCsv("", "shots"), /skillcorner_csv_empty/);
  assert.throws(() => parseSkillCornerCsv("a,b\n1,2", "shots"), /skillcorner_csv_missing_column/);
  assert.throws(() => parseSkillCornerCsv(headers, "tracking"), /skillcorner_aggregate_type_invalid/);
  assert.throws(() => parseSkillCornerCsv(headers + '\n8,"Liga ACB', "shots"), /skillcorner_csv_unclosed_quote/);
});

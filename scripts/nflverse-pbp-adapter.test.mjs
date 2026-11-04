import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNflverseCsv,
  buildNflverseMatchRecords
} from "../netlify/lib/nflverse-pbp-adapter.mts";
import {
  extractPlayerPerformances,
  inspectStatisticCoverage
} from "../netlify/lib/sport-stat-catalog.mts";

const csv = [
  "game_id,game_date,home_team,away_team,home_score,away_score,season_type,week,play_id,qtr,time,posteam,defteam,kicking_team,play_type,kickoff_attempt,pass_attempt,complete_pass,passing_yards,passer_player_id,passer_player_name,receiver_player_id,receiver_player_name,rush_attempt,rushing_yards,rusher_player_id,rusher_player_name,first_down,yards_gained,rush_touchdown,touchdown,desc",
  '2026_01_KC_BAL,2026-09-10,KC,BAL,0,0,REG,1,1,1,15:00,,,KC,kickoff,1,,,,,,,,,,,,,,,"Kickoff, opening play"',
  '2026_01_KC_BAL,2026-09-10,KC,BAL,0,0,REG,1,2,1,14:20,KC,BAL,,pass,,1,1,10,00-001,P. Quarterback,00-002,R. Receiver,,,,,0,10,,,"Pass complete, 10 yards"',
  '2026_01_KC_BAL,2026-09-10,KC,BAL,7,0,REG,1,3,1,13:40,KC,BAL,,run,,, ,,,,,,1,5,00-003,R. Runner,1,5,1,1,"Five-yard rushing touchdown"'
].join("\n");

test("nflverse CSV parser preserves commas in quoted descriptions and maps headers", () => {
  const rows = parseNflverseCsv(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].desc, "Kickoff, opening play");
  assert.equal(rows[1].desc, "Pass complete, 10 yards");
  assert.equal(rows[1].pass_attempt, "1");
  assert.equal(rows[1].receiver_player_name, "R. Receiver");
});

test("NFL match builder creates scores, team box scores, player lines and play events", () => {
  const rows = parseNflverseCsv(csv);
  const records = buildNflverseMatchRecords(
    rows, 2026,
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv",
    "2026-11-04T10:00:00.000Z"
  );
  assert.equal(records.length, 1);
  const match = records[0];
  assert.equal(match.sport, "american_football");
  assert.equal(match.homeTeam, "Kansas City Chiefs");
  assert.equal(match.awayTeam, "Baltimore Ravens");
  assert.deepEqual(match.fullTimeScore, [7, 0]);
  assert.equal(match.status, "completed");
  assert.equal(match.playCount, 3);
  assert.ok(match.events.some(event => event.type === "kickoff"));
  assert.ok(match.events.some(event => event.eventTypes.includes("completion")));
  assert.ok(match.events.some(event => event.eventTypes.includes("touchdown")));

  const home = match.teamStats.find(team => team.side === "home");
  assert.equal(home.pass_attempts, 1);
  assert.equal(home.completions, 1);
  assert.equal(home.passing_yards, 10);
  assert.equal(home.rush_attempts, 1);
  assert.equal(home.rushing_yards, 5);
  assert.equal(home.total_yards, 15);

  const performances = extractPlayerPerformances(match, "nflverse-pbp-data");
  assert.equal(performances.players.length, 3);
  assert.equal(performances.ratingsAvailable, 0);
  assert.equal(performances.players.find(player => player.name === "P. Quarterback").statistics[0].passing.pass_attempts, 1);
  assert.equal(performances.players.find(player => player.name === "R. Receiver").statistics[0].receiving.receptions, 1);
  assert.equal(performances.players.find(player => player.name === "R. Runner").statistics[0].rushing.rushing_yards, 5);
  assert.equal(performances.players.every(player => player.rating === null), true);
});

test("American-football coverage recognises source play types and leaves unavailable player ratings unknown", () => {
  const match = buildNflverseMatchRecords(
    parseNflverseCsv(csv), 2026, "https://source.example/pbp.csv",
    "2026-11-04T10:00:00.000Z"
  )[0];
  const coverage = inspectStatisticCoverage("american_football", {
    teamStats: match.teamStats,
    playerStats: match.playerStats,
    events: match.events
  });
  assert.ok(coverage.team.find(group => group.id === "passing").availableMetrics.includes("pass_attempts"));
  assert.ok(coverage.team.find(group => group.id === "rushing").availableMetrics.includes("rushing_yards"));
  assert.ok(coverage.player.find(group => group.id === "passing").availableMetrics.includes("completions"));
  assert.equal(coverage.player.find(group => group.id === "appearance").missingMetrics.includes("rating"), true);
  assert.ok(coverage.eventTypes.find(event => event.eventType === "kickoff").status === "present");
  assert.ok(coverage.eventTypes.find(event => event.eventType === "completion").status === "present");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNflverseCsv,
  buildNflverseMatchRecords,
  auditNflverseRows,
  parseNflverseScheduleCsv,
  enrichNflverseRecordsWithSchedule,
  measureNflverseDatasetPayloads
} from "../netlify/lib/nflverse-pbp-adapter.mts";
import {
  extractPlayerPerformances,
  inspectStatisticCoverage
} from "../netlify/lib/sport-stat-catalog.mts";

const headers = "game_id,game_date,home_team,away_team,home_score,away_score,season_type,week,play_id,quarter_end,play_type_nfl,qtr,time,posteam,defteam,kicking_team,play_type,kickoff_attempt,pass_attempt,complete_pass,passing_yards,passer_player_id,passer_player_name,receiver_player_id,receiver_player_name,rush_attempt,rushing_yards,rusher_player_id,rusher_player_name,first_down,yards_gained,epa,success,wpa,air_yards,yards_after_catch,rush_touchdown,touchdown,desc".split(",");
const csvCell = value => '"' + String(value ?? "").replaceAll('"', '""') + '"';
const csvRow = values => headers.map(key => csvCell(values[key])).join(",");
function sourceFieldValue(match, event, fieldName) {
  const fieldIndex = match.sourceSchemaFields.indexOf(fieldName);
  if (fieldIndex < 0 || !Array.isArray(event.sourceFields)) return undefined;
  for (let i = 0; i < event.sourceFields.length; i += 2) {
    if (event.sourceFields[i] === fieldIndex) return event.sourceFields[i + 1];
  }
  return undefined;
}

const csv = [
  headers.join(","),
  csvRow({
    game_id:"2026_01_KC_BAL",game_date:"2026-09-10",home_team:"KC",away_team:"BAL",home_score:0,away_score:0,
    season_type:"REG",week:1,play_id:1,qtr:1,time:"15:00",kicking_team:"KC",play_type:"kickoff",kickoff_attempt:1,
    desc:"Kickoff, opening play"
  }),
  csvRow({
    game_id:"2026_01_KC_BAL",game_date:"2026-09-10",home_team:"KC",away_team:"BAL",home_score:0,away_score:0,
    season_type:"REG",week:1,play_id:2,qtr:1,time:"14:20",posteam:"KC",defteam:"BAL",play_type:"pass",
    pass_attempt:1,complete_pass:1,passing_yards:10,epa:1.2,success:1,wpa:0.03,air_yards:8,yards_after_catch:4,passer_player_id:"00-001",passer_player_name:"P. Quarterback",
    receiver_player_id:"00-002",receiver_player_name:"R. Receiver",first_down:0,yards_gained:10,
    desc:"Pass complete, 10 yards"
  }),
  csvRow({
    game_id:"2026_01_KC_BAL",game_date:"2026-09-10",home_team:"KC",away_team:"BAL",home_score:7,away_score:0,
    season_type:"REG",week:1,play_id:3,qtr:1,time:"13:40",posteam:"KC",defteam:"BAL",play_type:"run",
    rush_attempt:1,rushing_yards:5,epa:-0.2,success:0,wpa:-0.01,rusher_player_id:"00-003",rusher_player_name:"R. Runner",
    first_down:1,yards_gained:5,rush_touchdown:1,touchdown:1,quarter_end:1,desc:"Five-yard rushing touchdown"
  }),
  csvRow({
    game_id:"2026_01_KC_BAL",game_date:"2026-09-10",home_team:"KC",away_team:"BAL",home_score:7,away_score:0,
    season_type:"REG",week:1,play_type_nfl:"END_GAME",desc:"END GAME"
  })
].join("\n");

test("NFL payload size audit reports exact UTF-8 bytes and distribution metrics", () => {
  const records = [
    { eventId: "2026_01_A_B", playCount: 2, playerCount: 1, eventDate: "2026-09-10", eventTimePrecision: "date_only", events: [{ sourceFields: { desc: "small" } }] },
    { eventId: "2026_02_C_D", playCount: 4, playerCount: 2, eventDate: "2026-09-17", eventTimePrecision: "date_only", events: [{ sourceFields: { desc: "a longer play description" } }] }
  ];
  const metadata = {
    season: 2026, sourceUrl: "https://source.example/pbp.csv",
    retrievedAt: "2026-11-04T10:00:00.000Z", rawChecksum: "pbp-hash", scheduleChecksum: "schedule-hash"
  };
  const measured = measureNflverseDatasetPayloads(records, metadata);
  const expected = records.map(record => {
    const datasetId = "nflverse-pbp-2026-" + record.eventId;
    const payload = {
      id: datasetId, providerId: "nflverse-pbp-data", sport: "american_football", season: "2026",
      competition: "NFL", sourceUrl: metadata.sourceUrl, sourceLicence: "CC-BY-4.0",
      licenceReference: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
      attribution: "nflverse play-by-play and schedule data — CC BY 4.0. Attribute nflverse and any upstream provider stated by the release.",
      retrievedAt: metadata.retrievedAt, rawChecksum: metadata.rawChecksum,
      totalRows: 1, scoredRows: 1, playCount: record.playCount, playerCount: record.playerCount,
      eventDate: record.eventDate, eventTimePrecision: record.eventTimePrecision,
      records: [record], origin: "provider_historical_data", lab: "model-lab"
    };
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  }).sort((a,b) => a-b);
  assert.equal(measured.recordCount, 2);
  assert.deepEqual(measured.largestRecords.map(item => item.jsonPayloadBytes), [...expected].reverse());
  assert.equal(measured.jsonPayloadBytesTotal, expected.reduce((sum, size) => sum + size, 0));
  assert.equal(measured.averageJsonPayloadBytes, Math.round(measured.jsonPayloadBytesTotal / 2));
  assert.equal(measured.medianJsonPayloadBytes, expected[0]);
  assert.equal(measured.p90JsonPayloadBytes, expected[1]);
  assert.equal(measured.p95JsonPayloadBytes, expected[1]);
  assert.equal(measured.largestJsonPayloadBytes, expected[1]);
});

test("nflverse CSV parser preserves commas in quoted descriptions and maps headers", () => {
  const rows = parseNflverseCsv(csv);
  assert.equal(rows.length, 4);
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
  assert.equal(match.eventDate, "2026-09-10");
  assert.equal(match.eventStart, null);
  assert.equal(match.eventTimePrecision, "date_only");
  assert.equal(match.playCount, 3);
  assert.ok(match.events.some(event => event.type === "kickoff"));
  assert.ok(match.events.some(event => event.eventTypes.includes("completion")));
  assert.ok(match.events.some(event => event.eventTypes.includes("touchdown")));
  assert.ok(match.events.some(event => event.eventTypes.includes("game_end")));
  assert.equal(match.sourceDataGrain, "one_row_per_play");
  assert.equal(match.sourceFieldEncoding, "schema_index_value_pairs_v1");
  assert.equal(Object.hasOwn(match, "eventTimeline"), false, "play timeline must not be duplicated under a second serialized key");
  assert.equal(match.sourceSchemaFieldCount, headers.length);
  assert.ok(match.sourceSchemaFields.includes("play_type_nfl"));
  const passEvent = match.events.find(event => event.eventTypes.includes("completion"));
  assert.equal(sourceFieldValue(match, passEvent, "pass_attempt"), "1");
  assert.equal(sourceFieldValue(match, passEvent, "complete_pass"), "1");
  assert.equal(sourceFieldValue(match, passEvent, "receiver_player_name"), "R. Receiver");
  const quarterEndEvent = match.events.find(event => event.type === "quarter_end");
  assert.equal(quarterEndEvent.playId, null, "synthetic quarter-end markers must not count as source plays");
  assert.equal(match.playCount, 3, "play count must count source play IDs, not synthetic timeline markers");

  const home = match.teamStats.find(team => team.side === "home");
  assert.equal(home.pass_attempts, 1);
  assert.equal(home.completions, 1);
  assert.equal(home.passing_yards, 10);
  assert.equal(home.rush_attempts, 1);
  assert.equal(home.rushing_yards, 5);
  assert.equal(home.total_yards, 15);
  assert.equal(home.epa_total, 1);
  assert.equal(home.epa_play_count, 2);
  assert.equal(home.epa_per_play, 0.5);
  assert.equal(home.successful_plays, 1);
  assert.equal(home.success_opportunities, 2);
  assert.equal(home.success_rate, 0.5);
  assert.ok(Math.abs(home.win_probability_added - 0.02) < 1e-12);
  assert.equal(home.air_yards_total, 8);
  assert.equal(home.pass_attempts_with_air_yards, 1);
  assert.equal(home.air_yards_per_attempt, 8);
  assert.equal(home.yards_after_catch_total, 4);
  assert.equal(home.completions_with_yac, 1);
  assert.equal(home.yards_after_catch_per_completion, 4);

  const performances = extractPlayerPerformances(match, "nflverse-pbp-data");
  assert.equal(performances.players.length, 3);
  assert.equal(performances.ratingsAvailable, 0);
  assert.equal(performances.players.find(player => player.name === "P. Quarterback").statistics[0].passing.pass_attempts, 1);
  assert.equal(performances.players.find(player => player.name === "R. Receiver").statistics[0].receiving.receptions, 1);
  assert.equal(performances.players.find(player => player.name === "R. Runner").statistics[0].rushing.rushing_yards, 5);
  assert.equal(performances.players.every(player => player.rating === null), true);
});

test("NFL matches with a score but no explicit END_GAME marker are not labelled completed", () => {
  const rows = parseNflverseCsv(csv).filter(row => row.play_type_nfl !== "END_GAME");
  assert.equal(buildNflverseMatchRecords(rows, 2026, "https://source.example/pbp.csv").length, 0);
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
  const advancedCoverage = coverage.team.find(group => group.id === "advanced");
  assert.ok(advancedCoverage.availableMetrics.includes("epa_total"));
  assert.ok(advancedCoverage.availableMetrics.includes("epa_per_play"));
  assert.ok(advancedCoverage.availableMetrics.includes("success_rate"));
  assert.ok(advancedCoverage.availableMetrics.includes("air_yards_per_attempt"));
  assert.ok(advancedCoverage.availableMetrics.includes("yards_after_catch_per_completion"));
  assert.ok(advancedCoverage.availableMetrics.includes("win_probability_added"));
  assert.ok(coverage.player.find(group => group.id === "passing").availableMetrics.includes("completions"));
  assert.equal(coverage.player.find(group => group.id === "rating").missingMetrics.includes("rating"), true);
  assert.ok(coverage.eventTypes.find(event => event.eventType === "kickoff").status === "present");
  assert.ok(coverage.eventTypes.find(event => event.eventType === "completion").status === "present");
});


test("NFL schedule joins exact game identity and converts Eastern kickoff to UTC", () => {
  const schedule = parseNflverseScheduleCsv([
    "game_id,gameday,gametime,away_team,home_team",
    "2026_01_KC_BAL,2026-09-10,20:20,BAL,KC"
  ].join("\n"));
  const base = buildNflverseMatchRecords(parseNflverseCsv(csv), 2026, "https://source.example/pbp.csv")[0];
  const joined = enrichNflverseRecordsWithSchedule([base], schedule);
  assert.equal(joined.matched, 1);
  assert.equal(joined.records[0].eventStart, "2026-09-11T00:20:00.000Z");
  assert.deepEqual(joined.records[0].kickoffLocal, {
    date: "2026-09-10", time: "20:20", timeZone: "America/New_York"
  });
});

test("NFL schedule parser joins a current upstream 2026 game ID and Eastern kickoff sample", () => {
  const sourceLikePbpRows = parseNflverseCsv(csv).map(row => ({
    ...row, game_id: "2026_08_CAR_GB", game_date: "2026-10-29",
    home_team: "GB", away_team: "CAR"
  }));
  const match = buildNflverseMatchRecords(sourceLikePbpRows, 2026, "https://source.example/pbp.csv")[0];
  const schedule = parseNflverseScheduleCsv([
    "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score",
    "2026_08_CAR_GB,2026,REG,8,2026-10-29,Thursday,20:15,CAR,0,GB,0"
  ].join("\n"));
  const joined = enrichNflverseRecordsWithSchedule([match], schedule);
  assert.equal(joined.matched, 1);
  assert.equal(joined.records[0].eventStart, "2026-10-30T00:15:00.000Z");
  assert.equal(joined.records[0].homeTeam, "Green Bay Packers");
  assert.equal(joined.records[0].awayTeam, "Carolina Panthers");
});

test("NFL schedule kickoff conversion handles DST and rejects ambiguous or nonexistent local times", () => {
  const baseFor = date => buildNflverseMatchRecords(
    parseNflverseCsv(csv).map(row => ({ ...row, game_date: date })),
    2026, "https://source.example/pbp.csv"
  )[0];
  const scheduleFor = (date, time) => parseNflverseScheduleCsv([
    "game_id,gameday,gametime,away_team,home_team",
    "2026_01_KC_BAL," + date + "," + time + ",BAL,KC"
  ].join("\n"));
  const summer = enrichNflverseRecordsWithSchedule([baseFor("2026-07-15")], scheduleFor("2026-07-15", "13:00"));
  assert.equal(summer.records[0].eventStart, "2026-07-15T17:00:00.000Z");
  const winter = enrichNflverseRecordsWithSchedule([baseFor("2026-12-15")], scheduleFor("2026-12-15", "13:00"));
  assert.equal(winter.records[0].eventStart, "2026-12-15T18:00:00.000Z");
  const springGap = enrichNflverseRecordsWithSchedule([baseFor("2026-03-08")], scheduleFor("2026-03-08", "02:30"));
  assert.equal(springGap.matched, 0);
  const fallFold = enrichNflverseRecordsWithSchedule([baseFor("2026-11-01")], scheduleFor("2026-11-01", "01:30"));
  assert.equal(fallFold.matched, 0);
  const afterFold = enrichNflverseRecordsWithSchedule([baseFor("2026-11-01")], scheduleFor("2026-11-01", "03:30"));
  assert.equal(afterFold.records[0].eventStart, "2026-11-01T08:30:00.000Z");
});

test("NFL schedule join leaves mismatched identity and conflicting schedule IDs date-only", () => {
  const base = buildNflverseMatchRecords(parseNflverseCsv(csv), 2026, "https://source.example/pbp.csv")[0];
  const mismatch = parseNflverseScheduleCsv([
    "game_id,gameday,gametime,away_team,home_team",
    "2026_01_KC_BAL,2026-09-11,20:20,BAL,KC"
  ].join("\n"));
  assert.equal(enrichNflverseRecordsWithSchedule([base], mismatch).matched, 0);
  const conflicting = parseNflverseScheduleCsv([
    "game_id,gameday,gametime,away_team,home_team",
    "2026_01_KC_BAL,2026-09-10,20:20,BAL,KC",
    "2026_01_KC_BAL,2026-09-10,20:21,BAL,KC"
  ].join("\n"));
  const result = enrichNflverseRecordsWithSchedule([base], conflicting);
  assert.equal(result.matched, 0);
  assert.deepEqual(result.conflictingGameIds, ["2026_01_KC_BAL"]);
});

test("NFL source-row audit rejects impossible dates, malformed scores and conflicting game identities", () => {
  const valid = {
    game_id: "2026_01_KC_BAL", game_date: "2026-09-10", home_team: "KC", away_team: "BAL",
    home_score: "7", away_score: "0", play_id: "1"
  };
  const rows = [
    valid,
    { ...valid, game_id: "BAD_DATE", game_date: "2026-02-30" },
    { ...valid, game_id: "BAD_SCORE", home_score: "-1" },
    { ...valid, game_id: "CONFLICT", home_team: "KC" },
    { ...valid, game_id: "CONFLICT", home_team: "BUF" }
  ];
  const audit = auditNflverseRows(rows);
  assert.equal(audit.rowsSeen, 5);
  assert.equal(audit.rowsAccepted, 1);
  assert.equal(audit.rowsRejected, 4);
  assert.equal(audit.rejectedByReason.game_date_invalid, 1);
  assert.equal(audit.rejectedByReason.home_score_invalid, 1);
  assert.equal(audit.rejectedByReason.game_identity_conflict, 2);
  assert.deepEqual(audit.conflictingGames, ["CONFLICT"]);
  assert.equal(audit.gamesSeen, 4);
  assert.equal(audit.gamesAccepted, 1);
  assert.equal(audit.gamesRejected, 3);
});

test("NFL CSV parser fails closed on duplicate headers and mismatched column counts", () => {
  assert.throws(
    () => parseNflverseCsv("game_id,game_date,home_team,away_team,home_team\n1,2026-09-10,KC,BAL,KC"),
    /nflverse_csv_schema_duplicate_header/
  );
  assert.throws(
    () => parseNflverseCsv("game_id,game_date,home_team,away_team\n1,2026-09-10,KC"),
    /nflverse_csv_column_count_mismatch_at_row_2/
  );
  assert.throws(
    () => parseNflverseCsv("game_id,game_date,home_team,away_team\n1,2026-09-10,KC,BAL,EXTRA"),
    /nflverse_csv_column_count_mismatch_at_row_2/
  );
});

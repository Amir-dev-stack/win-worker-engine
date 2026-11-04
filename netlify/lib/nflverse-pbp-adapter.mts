import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";
import { assertProviderImportAllowed } from "./data-provider-registry.mts";

const PROVIDER_ID = "nflverse-pbp-data";
const LICENSE = "CC-BY-4.0";
const LICENSE_URL = "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
const ATTRIBUTION = "nflverse play-by-play and schedule data — CC BY 4.0. Attribute nflverse and any upstream provider stated by the release.";
const RELEASE_BASE = "https://github.com/nflverse/nflverse-data/releases/download/pbp";
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";
const MAX_CSV_CHARACTERS = 115_000_000;

const TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills",
  CAR: "Carolina Panthers", CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys", DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars", KC: "Kansas City Chiefs",
  LA: "Los Angeles Rams", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins", MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints",
  NYG: "New York Giants", NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks", SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers", TEN: "Tennessee Titans",
  WAS: "Washington Commanders", WSH: "Washington Commanders"
};

const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const flag = (value: unknown) => {
  const parsed = number(value);
  return parsed === 1 || String(value).toLowerCase() === "true";
};
const teamName = (value: unknown) => {
  const key = text(value).toUpperCase();
  return TEAM_NAMES[key] || key;
};
const increment = (target: Record<string, number>, key: string, amount = 1) => {
  target[key] = (target[key] || 0) + amount;
};
const addNumber = (target: Record<string, number>, key: string, value: unknown) => {
  const parsed = number(value);
  if (parsed !== null) target[key] = (target[key] || 0) + parsed;
};
const hasValue = (row: Record<string, string>, key: string) => text(row[key]) !== "";
const isGameEndRow = (row: Record<string, string>) =>
  text(row.play_type_nfl).toUpperCase() === "END_GAME" || text(row.desc).trim().toUpperCase() === "END GAME";

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validScoreCell(value: unknown) {
  const raw = text(value);
  return raw === "" || /^\d+$/.test(raw);
}

/**
 * Validate source rows before creating match records. Date-only source dates are
 * retained as dates; they are not promoted to verified kickoff timestamps.
 */
export function auditNflverseRows(rows: Record<string, string>[]) {
  const rejectedByReason: Record<string, number> = {};
  const gamesSeen = new Set<string>();
  const candidates: Array<{ row: Record<string, string>; gameId: string }> = [];
  const identitiesByGame = new Map<string, Set<string>>();
  let rowsRejected = 0;

  const reject = (reason: string) => {
    rowsRejected++;
    rejectedByReason[reason] = (rejectedByReason[reason] || 0) + 1;
  };

  rows.forEach(row => {
    const gameId = text(row.game_id);
    if (gameId) gamesSeen.add(gameId);
    const date = text(row.game_date);
    const home = text(row.home_team).toUpperCase();
    const away = text(row.away_team).toUpperCase();
    if (!gameId) { reject("game_id_missing"); return; }
    if (!validCalendarDate(date)) { reject("game_date_invalid"); return; }
    if (!/^[A-Z]{2,3}$/.test(home)) { reject("home_team_invalid"); return; }
    if (!/^[A-Z]{2,3}$/.test(away)) { reject("away_team_invalid"); return; }
    if (home === away) { reject("teams_not_distinct"); return; }
    if (!validScoreCell(row.home_score)) { reject("home_score_invalid"); return; }
    if (!validScoreCell(row.away_score)) { reject("away_score_invalid"); return; }

    const identity = [date, home, away].join("|");
    const identities = identitiesByGame.get(gameId) || new Set<string>();
    identities.add(identity);
    identitiesByGame.set(gameId, identities);
    candidates.push({ row, gameId });
  });

  const conflictingGames = new Set(
    [...identitiesByGame.entries()].filter(([, identities]) => identities.size > 1).map(([gameId]) => gameId)
  );
  const acceptedRows: Record<string, string>[] = [];
  for (const candidate of candidates) {
    if (conflictingGames.has(candidate.gameId)) {
      reject("game_identity_conflict");
      continue;
    }
    acceptedRows.push(candidate.row);
  }

  const acceptedGames = new Set(acceptedRows.map(row => text(row.game_id)));
  return {
    acceptedRows,
    rowsSeen: rows.length,
    rowsAccepted: acceptedRows.length,
    rowsRejected,
    rejectedByReason,
    gamesSeen: gamesSeen.size,
    gamesAccepted: acceptedGames.size,
    gamesRejected: Math.max(0, gamesSeen.size - acceptedGames.size),
    conflictingGames: [...conflictingGames].sort()
  };
}


function parseCsvRecords(raw: string): string[][] {
  if (typeof raw !== "string" || raw.length === 0) throw new Error("nflverse_csv_empty");
  if (raw.length > MAX_CSV_CHARACTERS) throw new Error("nflverse_csv_exceeds_size_guard");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) {
      if (char === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) { quoted = true; continue; }
    if (char === ",") { record.push(field); field = ""; continue; }
    if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some(value => value !== "")) records.push(record);
      record = []; field = "";
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error("nflverse_csv_unclosed_quote");
  if (field.length || record.length) {
    record.push(field.replace(/\r$/, ""));
    if (record.some(value => value !== "")) records.push(record);
  }
  if (records.length < 2) throw new Error("nflverse_csv_has_no_data_rows");
  const headers = records[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim());
  if (headers.some(header => !header)) throw new Error("nflverse_csv_schema_empty_header");
  if (new Set(headers).size !== headers.length) throw new Error("nflverse_csv_schema_duplicate_header");
  const dataRows = records.slice(1);
  for (let index = 0; index < dataRows.length; index++) {
    if (dataRows[index].length !== headers.length) {
      throw new Error("nflverse_csv_column_count_mismatch_at_row_" + String(index + 2));
    }
  }
  return [headers, ...dataRows];
}

function easternKickoffToUtc(date: string, time: string): string | null {
  if (!validCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  const localParts = (instant: number) =>
    Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  const candidates = new Set<number>();
  // A local wall-clock time can map to zero instants (spring gap), one (normal),
  // or two (fall fold). Sample both sides of any nearby DST transition.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = localAsUtc + hours * 60 * 60 * 1000;
    const parts = localParts(sample);
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offset = representedAsUtc - sample;
    const candidate = localAsUtc - offset;
    const check = localParts(candidate);
    if (Number(check.year) === year && Number(check.month) === month && Number(check.day) === day &&
        Number(check.hour) === hour && Number(check.minute) === minute) candidates.add(candidate);
  }
  if (candidates.size !== 1) return null;
  return new Date([...candidates][0]).toISOString();
}
export function parseNflverseScheduleCsv(raw: string): Record<string, string>[] {
  const [headers, ...dataRows] = parseCsvRecords(raw);
  const required = ["game_id", "gameday", "gametime", "away_team", "home_team"];
  const missing = required.filter(key => !headers.includes(key));
  if (missing.length) throw new Error("nflverse_schedule_schema_missing_" + missing.join("_"));
  return dataRows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
}

export function enrichNflverseRecordsWithSchedule(records: any[], scheduleRows: Record<string, string>[]) {
  const byId = new Map<string, Record<string, string>>();
  const conflicts = new Set<string>();
  for (const row of scheduleRows) {
    const id = text(row.game_id);
    if (!id) continue;
    const previous = byId.get(id);
    if (previous && [previous.gameday, previous.home_team, previous.away_team, previous.gametime].join("|") !==
      [row.gameday, row.home_team, row.away_team, row.gametime].join("|")) conflicts.add(id);
    else byId.set(id, row);
  }
  const enriched = records.map(record => {
    const id = text(record.eventId);
    const row = byId.get(id);
    if (!row || conflicts.has(id)) return record;
    const identityMatches = text(row.gameday) === text(record.eventDate) &&
      teamName(row.home_team) === record.homeTeam && teamName(row.away_team) === record.awayTeam;
    const kickoff = identityMatches ? easternKickoffToUtc(text(row.gameday), text(row.gametime)) : null;
    if (!kickoff) return record;
    return {
      ...record, eventStart: kickoff, eventTimePrecision: "scheduled_kickoff",
      kickoffLocal: { date: text(row.gameday), time: text(row.gametime), timeZone: "America/New_York" },
      kickoffSource: "nflverse-schedules", kickoffSourceLicence: LICENSE
    };
  });
  const matched = enriched.filter(record => record.eventTimePrecision === "scheduled_kickoff").length;
  return { records: enriched, matched, unmatched: records.length - matched, conflictingGameIds: [...conflicts].sort() };
}

export function parseNflverseCsv(raw: string): Record<string, string>[] {
  if (typeof raw !== "string" || raw.length === 0) throw new Error("nflverse_csv_empty");
  if (raw.length > MAX_CSV_CHARACTERS) throw new Error("nflverse_csv_exceeds_size_guard");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) {
      if (char === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0) { quoted = true; continue; }
    if (char === ",") { record.push(field); field = ""; continue; }
    if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some(value => value !== "")) records.push(record);
      record = []; field = "";
      continue;
    }
    field += char;
  }
  if (quoted) throw new Error("nflverse_csv_unclosed_quote");
  if (field.length || record.length) {
    record.push(field.replace(/\r$/, ""));
    if (record.some(value => value !== "")) records.push(record);
  }
  if (records.length < 2) throw new Error("nflverse_csv_has_no_data_rows");
  const headers = records[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim());
  if (headers.some(header => !header)) throw new Error("nflverse_csv_schema_empty_header");
  if (new Set(headers).size !== headers.length) throw new Error("nflverse_csv_schema_duplicate_header");
  const required = ["game_id", "game_date", "home_team", "away_team"];
  const missing = required.filter(key => !headers.includes(key));
  if (missing.length) throw new Error("nflverse_csv_schema_missing_" + missing.join("_"));
  const dataRows = records.slice(1);
  for (let index = 0; index < dataRows.length; index++) {
    if (dataRows[index].length !== headers.length) {
      throw new Error("nflverse_csv_column_count_mismatch_at_row_" + String(index + 2));
    }
  }
  return dataRows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
}

function newTeamStats() {
  return {
    offensive_plays: 0, total_yards: 0, first_downs: 0,
    pass_attempts: 0, completions: 0, incompletions: 0, passing_yards: 0, passing_touchdowns: 0,
    interceptions: 0, rush_attempts: 0, rushing_yards: 0, rushing_touchdowns: 0,
    third_down_attempts: 0, third_down_conversions: 0, fourth_down_attempts: 0, fourth_down_conversions: 0,
    turnovers: 0, fumbles_lost: 0, sacks_allowed: 0, penalties: 0, penalty_yards: 0,
    defensive_sacks: 0, defensive_interceptions: 0, defensive_fumble_recoveries: 0,
    solo_tackles: 0, assisted_tackles: 0,
    kickoffs: 0, punts: 0, field_goal_attempts: 0, field_goals_made: 0,
    extra_point_attempts: 0, extra_points_made: 0
  };
}

function newPlayerLine(id: string, name: string, team: string) {
  const statLine: Record<string, any> = {
    games: {},
    passing: {}, rushing: {}, receiving: {}, defense: {}, kicking: {}, returns: {}
  };
  return {
    player: { id, name },
    team: { name: teamName(team) },
    position: null,
    statistics: [statLine],
    _statLine: statLine
  };
}

function playerLine(players: Map<string, any>, idValue: unknown, nameValue: unknown, teamValue: unknown) {
  const id = text(idValue);
  const name = text(nameValue);
  const team = text(teamValue);
  if (!id || !name || !team) return null;
  const key = id + "|" + team;
  let line = players.get(key);
  if (!line) {
    line = newPlayerLine(id, name, team);
    players.set(key, line);
  }
  return line;
}

function eventTypes(row: Record<string, string>) {
  const types = new Set<string>();
  const playType = text(row.play_type).toLowerCase();
  if (isGameEndRow(row)) types.add("game_end");
  const passAttempt = flag(row.pass_attempt) || playType === "pass";
  if (playType === "kickoff" || flag(row.kickoff_attempt)) types.add("kickoff");
  if (playType === "kickoff" && (hasValue(row, "kickoff_returner_player_name") || hasValue(row, "return_yards"))) types.add("kickoff_return");
  if (playType === "punt" || flag(row.punt_attempt)) types.add("punt");
  if (playType === "punt" && (hasValue(row, "punt_returner_player_name") || hasValue(row, "return_yards"))) types.add("punt_return");
  if (playType === "field_goal" || flag(row.field_goal_attempt)) types.add("field_goal");
  if (playType === "extra_point" || flag(row.extra_point_attempt)) types.add("extra_point");
  if (passAttempt) {
    types.add("pass_attempt");
    if (flag(row.complete_pass)) types.add("completion");
    else if (hasValue(row, "complete_pass")) types.add("incompletion");
  }
  if (flag(row.rush_attempt) || playType === "run" || flag(row.qb_scramble)) types.add("rush");
  if (flag(row.sack)) types.add("sack");
  if (flag(row.interception)) types.add("interception");
  if (flag(row.fumble) || flag(row.fumble_lost)) types.add("fumble");
  if (flag(row.touchdown) || flag(row.pass_touchdown) || flag(row.rush_touchdown) || flag(row.return_touchdown)) types.add("touchdown");
  if (flag(row.penalty)) types.add("penalty");
  if (flag(row.timeout)) types.add("timeout");
  if (flag(row.safety)) types.add("safety");
  if (flag(row.quarter_end)) types.add("quarter_end");
  if (!types.size && playType) types.add(playType.replace(/[^a-z0-9_]+/g, "_"));
  if (!types.size) types.add("play");
  return [...types];
}

function buildPlayTimeline(rows: Record<string, string>[]) {
  const timeline: any[] = [];
  let previousQuarter = 0;
  for (const row of rows) {
    const quarter = number(row.qtr);
    if (quarter !== null && quarter > 0 && quarter !== previousQuarter) {
      timeline.push({
        type: "quarter_start", eventTypes: ["quarter_start"], quarter,
        clock: text(row.time) || null, playId: null, description: "Start of quarter " + quarter
      });
      previousQuarter = quarter;
    }
    const types = eventTypes(row);
    timeline.push({
      type: types[0], eventTypes: types,
      playId: number(row.play_id), quarter,
      clock: text(row.time) || text(row.game_clock) || null,
      down: number(row.down), yardsToGo: number(row.ydstogo),
      yardline100: number(row.yardline_100), yardsGained: number(row.yards_gained),
      possessionTeam: teamName(row.posteam) || null,
      defendingTeam: teamName(row.defteam) || null,
      scoringTeam: teamName(row.td_team) || null,
      scoreAfterPlay: { home: number(row.home_score), away: number(row.away_score) },
      description: text(row.desc) || null,
      playType: text(row.play_type) || null,
      passer: text(row.passer_player_name) || null,
      rusher: text(row.rusher_player_name) || null,
      receiver: text(row.receiver_player_name) || null,
      // Keep every non-empty provider-native field, including metrics not yet
      // normalised by WIN, so the original play evidence is not discarded.
      sourceFields: Object.fromEntries(Object.entries(row).filter(([, value]) => text(value) !== ""))
    });
    if (flag(row.quarter_end)) {
      timeline.push({
        type: "quarter_end", eventTypes: ["quarter_end"], quarter,
        clock: text(row.time) || null, playId: number(row.play_id),
        description: "End of quarter " + String(quarter)
      });
    }
  }
  return timeline;
}

export function buildNflverseMatchRecords(
  rows: Record<string, string>[],
  season: number,
  sourceUrl: string,
  retrievedAt = new Date().toISOString()
) {
  const audited = auditNflverseRows(rows);
  const games = new Map<string, any>();
  for (const row of audited.acceptedRows) {
    const gameId = text(row.game_id);
    const date = text(row.game_date);
    const home = text(row.home_team);
    const away = text(row.away_team);
    let game = games.get(gameId);
    if (!game) {
      game = {
        id: gameId, date, home, away, rows: [],
        teamStats: { [home]: newTeamStats(), [away]: newTeamStats() },
        playerStats: new Map<string, any>(),
        homeScore: null, awayScore: null, completedMarker: false, seasonType: text(row.season_type),
        week: number(row.week), gameType: text(row.game_type)
      };
      games.set(gameId, game);
    }
    game.rows.push(row);
    if (isGameEndRow(row)) game.completedMarker = true;
    if (number(row.home_score) !== null) game.homeScore = number(row.home_score);
    if (number(row.away_score) !== null) game.awayScore = number(row.away_score);

    const offense = text(row.posteam);
    const defense = text(row.defteam);
    const playType = text(row.play_type).toLowerCase();
    const passAttempt = flag(row.pass_attempt) || playType === "pass";
    const complete = flag(row.complete_pass);
    const rushAttempt = flag(row.rush_attempt) || playType === "run" || flag(row.qb_scramble);
    const yards = number(row.yards_gained);

    const offStats = game.teamStats[offense];
    if (offStats) {
      if (!["no_play", "timeout"].includes(playType)) increment(offStats, "offensive_plays");
      if (yards !== null && !["no_play", "timeout", "kickoff", "punt"].includes(playType)) addNumber(offStats, "total_yards", yards);
      if (flag(row.first_down)) increment(offStats, "first_downs");
      const down = number(row.down);
      if (down === 3) {
        increment(offStats, "third_down_attempts");
        if (flag(row.third_down_converted) || flag(row.first_down)) increment(offStats, "third_down_conversions");
      }
      if (down === 4) {
        increment(offStats, "fourth_down_attempts");
        if (flag(row.fourth_down_converted) || flag(row.first_down)) increment(offStats, "fourth_down_conversions");
      }
      if (passAttempt) {
        increment(offStats, "pass_attempts");
        if (complete) increment(offStats, "completions");
        else increment(offStats, "incompletions");
        addNumber(offStats, "passing_yards", row.passing_yards);
        if (flag(row.pass_touchdown)) increment(offStats, "passing_touchdowns");
        if (flag(row.interception)) { increment(offStats, "interceptions"); increment(offStats, "turnovers"); }
      }
      if (rushAttempt) {
        increment(offStats, "rush_attempts");
        addNumber(offStats, "rushing_yards", number(row.rushing_yards) !== null ? row.rushing_yards : row.yards_gained);
        if (flag(row.rush_touchdown)) increment(offStats, "rushing_touchdowns");
      }
      if (flag(row.fumble_lost)) { increment(offStats, "fumbles_lost"); increment(offStats, "turnovers"); }
      if (flag(row.sack)) increment(offStats, "sacks_allowed");
    }
    const defStats = game.teamStats[defense];
    if (defStats) {
      if (flag(row.sack)) increment(defStats, "defensive_sacks");
      if (flag(row.interception)) increment(defStats, "defensive_interceptions");
      if (hasValue(row, "fumble_recovery_1_player_id") || hasValue(row, "fumble_recovery_2_player_id")) increment(defStats, "defensive_fumble_recoveries");
    }
    if (flag(row.penalty)) {
      const penalizedTeam = text(row.penalty_team) || offense;
      const penaltyStats = game.teamStats[penalizedTeam];
      if (penaltyStats) {
        increment(penaltyStats, "penalties");
        addNumber(penaltyStats, "penalty_yards", row.penalty_yards);
      }
    }
    const kickingTeam = text(row.kicking_team) || offense;
    const specialStats = game.teamStats[kickingTeam];
    if (specialStats) {
      if (playType === "kickoff" || flag(row.kickoff_attempt)) increment(specialStats, "kickoffs");
      if (playType === "punt" || flag(row.punt_attempt)) increment(specialStats, "punts");
      if (playType === "field_goal" || flag(row.field_goal_attempt)) {
        increment(specialStats, "field_goal_attempts");
        if (text(row.field_goal_result).toLowerCase() === "made") increment(specialStats, "field_goals_made");
      }
      if (playType === "extra_point" || flag(row.extra_point_attempt)) {
        increment(specialStats, "extra_point_attempts");
        if (text(row.extra_point_result).toLowerCase() === "good" || text(row.extra_point_result).toLowerCase() === "made") increment(specialStats, "extra_points_made");
      }
    }

    const passer = playerLine(game.playerStats, row.passer_player_id, row.passer_player_name, offense);
    if (passer && passAttempt) {
      increment(passer._statLine.passing, "pass_attempts");
      if (complete) increment(passer._statLine.passing, "completions");
      addNumber(passer._statLine.passing, "passing_yards", row.passing_yards);
      if (flag(row.pass_touchdown)) increment(passer._statLine.passing, "passing_touchdowns");
      if (flag(row.interception)) increment(passer._statLine.passing, "interceptions");
    }
    if (passer && flag(row.sack)) increment(passer._statLine.passing, "sacks_taken");

    const rusher = playerLine(game.playerStats, row.rusher_player_id, row.rusher_player_name, offense);
    if (rusher && rushAttempt) {
      increment(rusher._statLine.rushing, "rush_attempts");
      addNumber(rusher._statLine.rushing, "rushing_yards", number(row.rushing_yards) !== null ? row.rushing_yards : row.yards_gained);
      if (flag(row.rush_touchdown)) increment(rusher._statLine.rushing, "rushing_touchdowns");
      if (flag(row.fumble_lost)) increment(rusher._statLine.rushing, "fumbles_lost");
    }
    const receiver = playerLine(game.playerStats, row.receiver_player_id, row.receiver_player_name, offense);
    if (receiver && passAttempt) {
      increment(receiver._statLine.receiving, "targets");
      if (complete) increment(receiver._statLine.receiving, "receptions");
      addNumber(receiver._statLine.receiving, "receiving_yards", row.receiving_yards ?? (complete ? row.yards_gained : null));
      if (flag(row.pass_touchdown)) increment(receiver._statLine.receiving, "receiving_touchdowns");
    }

    const tacklers = [
      ["solo_tackle_1_player_id", "solo_tackle_1_player_name", "solo_tackles"],
      ["solo_tackle_2_player_id", "solo_tackle_2_player_name", "solo_tackles"],
      ["assist_tackle_1_player_id", "assist_tackle_1_player_name", "assisted_tackles"],
      ["assist_tackle_2_player_id", "assist_tackle_2_player_name", "assisted_tackles"]
    ];
    for (const [idKey, nameKey, statKey] of tacklers) {
      const tackler = playerLine(game.playerStats, row[idKey], row[nameKey], defense);
      if (tackler) increment(tackler._statLine.defense, statKey);
    }
    const defenderEvents = [
      ["sack_player_id", "sack_player_name", "sacks"],
      ["half_sack_1_player_id", "half_sack_1_player_name", "half_sacks"],
      ["half_sack_2_player_id", "half_sack_2_player_name", "half_sacks"],
      ["interception_player_id", "interception_player_name", "interceptions"],
      ["fumble_recovery_1_player_id", "fumble_recovery_1_player_name", "fumble_recoveries"],
      ["fumble_recovery_2_player_id", "fumble_recovery_2_player_name", "fumble_recoveries"]
    ];
    for (const [idKey, nameKey, statKey] of defenderEvents) {
      const defender = playerLine(game.playerStats, row[idKey], row[nameKey], defense);
      if (defender) increment(defender._statLine.defense, statKey);
    }
    const kicker = playerLine(game.playerStats, row.field_goal_kicker_player_id, row.field_goal_kicker_player_name, kickingTeam);
    if (kicker && (playType === "field_goal" || flag(row.field_goal_attempt))) {
      increment(kicker._statLine.kicking, "field_goal_attempts");
      if (text(row.field_goal_result).toLowerCase() === "made") increment(kicker._statLine.kicking, "field_goals_made");
    }
    const returner = playerLine(
      game.playerStats,
      row.kickoff_returner_player_id || row.punt_returner_player_id,
      row.kickoff_returner_player_name || row.punt_returner_player_name,
      row.return_team
    );
    if (returner) {
      if (playType === "kickoff") {
        increment(returner._statLine.returns, "kickoff_returns");
        addNumber(returner._statLine.returns, "kickoff_return_yards", row.return_yards);
      } else if (playType === "punt") {
        increment(returner._statLine.returns, "punt_returns");
        addNumber(returner._statLine.returns, "punt_return_yards", row.return_yards);
      }
    }
  }

  return [...games.values()].filter(game => game.completedMarker && game.homeScore !== null && game.awayScore !== null).map(game => {
    const sortedRows = game.rows.slice().sort((a, b) => (number(a.play_id) || 0) - (number(b.play_id) || 0));
    const recordId = "nflverse-" + game.id;
    const homeName = teamName(game.home);
    const awayName = teamName(game.away);
    const teamStats = [game.home, game.away].map(abbr => ({
      team: teamName(abbr),
      side: abbr === game.home ? "home" : "away",
      ...game.teamStats[abbr]
    }));
    const playerStats = [...game.playerStats.values()].map(line => {
      const { _statLine, ...publicLine } = line;
      return publicLine;
    });
    const eventTimeline = buildPlayTimeline(sortedRows);
    return {
      id: recordId, eventId: game.id, sport: "american_football", season: String(season),
      competition: "NFL", gameType: game.gameType || game.seasonType || null,
      week: game.week, event: homeName + " vs " + awayName,
      homeTeam: homeName, awayTeam: awayName,
      sourceDataGrain: "one_row_per_play",
      sourceSchemaFields: Object.keys(game.rows[0] || {}),
      sourceSchemaFieldCount: Object.keys(game.rows[0] || {}).length,
      eventStart: null, eventDate: game.date, eventTimePrecision: "date_only",
      fullTimeScore: [game.homeScore, game.awayScore], status: "completed",
      teamStats, playerStats, events: eventTimeline,
      playerCount: playerStats.length, playCount: eventTimeline.filter(item => item.playId !== null).length,
      sourceProvider: PROVIDER_ID, sourceUrl, retrievedAt, sourceLicence: LICENSE,
      licenceReference: LICENSE_URL, attribution: ATTRIBUTION,
      rawChecksum: null, origin: "provider_historical_data"
    };
  });
}

export async function syncNflversePlayByPlayData(seasonInput?: number) {
  assertProviderImportAllowed(PROVIDER_ID, [
    "historical_match_play_by_play", "team_match_statistics", "player_match_statistics", "player_events", "results"
  ]);
  const currentYear = new Date().getUTCFullYear();
  const defaultSeason = new Date().getUTCMonth() >= 6 ? currentYear : currentYear - 1;
  const season = Number.isInteger(seasonInput) && Number(seasonInput) >= 1999 && Number(seasonInput) <= currentYear
    ? Number(seasonInput) : defaultSeason;
  const startedAt = new Date().toISOString();
  const sourceUrl = RELEASE_BASE + "/play_by_play_" + season + ".csv";
  const response = await fetch(sourceUrl, { headers: { "user-agent": USER_AGENT, accept: "text/csv" }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error("nflverse_pbp_http_" + response.status);
  const raw = await response.text();
  if (raw.length > MAX_CSV_CHARACTERS) throw new Error("nflverse_pbp_exceeds_size_guard");
  const rawChecksum = createHash("sha256").update(raw).digest("hex");
  const retrievedAt = new Date().toISOString();
  const rows = parseNflverseCsv(raw);
  const qualityAudit = auditNflverseRows(rows);
  const scheduleUrl = "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
  const scheduleResponse = await fetch(scheduleUrl, {
    headers: { "user-agent": USER_AGENT, accept: "text/csv" }, signal: AbortSignal.timeout(60000)
  });
  if (!scheduleResponse.ok) throw new Error("nflverse_schedule_http_" + scheduleResponse.status);
  const scheduleRaw = await scheduleResponse.text();
  const scheduleChecksum = createHash("sha256").update(scheduleRaw).digest("hex");
  const scheduleRows = parseNflverseScheduleCsv(scheduleRaw);
  const baseRecords = buildNflverseMatchRecords(qualityAudit.acceptedRows, season, sourceUrl, retrievedAt);
  const scheduleJoin = enrichNflverseRecordsWithSchedule(baseRecords, scheduleRows);
  const records = scheduleJoin.records.map(record => ({ ...record, rawChecksum, scheduleChecksum }));
  if (!records.length) throw new Error("nflverse_pbp_no_completed_matches_found");
  let saved = 0;
  let jsonPayloadBytesTotal = 0;
  let largestJsonPayloadBytes = 0;
  for (const record of records) {
    const datasetId = "nflverse-pbp-" + season + "-" + String(record.eventId).replace(/[^a-zA-Z0-9_-]/g, "");
    const datasetPayload = {
      id: datasetId, providerId: PROVIDER_ID, sport: "american_football", season: String(season),
      competition: "NFL", sourceUrl, sourceLicence: LICENSE, licenceReference: LICENSE_URL,
      attribution: ATTRIBUTION, retrievedAt, rawChecksum, totalRows: 1, scoredRows: 1,
      playCount: record.playCount, playerCount: record.playerCount,
      eventDate: record.eventDate, eventTimePrecision: record.eventTimePrecision,
      records: [record], origin: "provider_historical_data", lab: "model-lab"
    };
    // Measure the exact UTF-8 JSON payload before the Blob write. This is a
    // payload-size diagnostic, not a claim about provider file size or billed storage.
    const jsonPayloadBytes = Buffer.byteLength(JSON.stringify(datasetPayload), "utf8");
    jsonPayloadBytesTotal += jsonPayloadBytes;
    largestJsonPayloadBytes = Math.max(largestJsonPayloadBytes, jsonPayloadBytes);
    await put("library/model-lab/historical-event-datasets", datasetId, datasetPayload);
    saved++;
  }
  const summary = {
    id: "nflverse-pbp-" + season + "-" + startedAt.slice(0, 10),
    providerId: PROVIDER_ID, sport: "american_football", season: String(season),
    status: "completed", startedAt, completedAt: new Date().toISOString(),
    sourceUrl, sourceLicence: LICENSE, licenceReference: LICENSE_URL, attribution: ATTRIBUTION,
    rawChecksum, sourceReleaseAsset: "play_by_play_" + season + ".csv",
    scheduleUrl, scheduleChecksum, scheduleRows: scheduleRows.length,
    scheduleKickoffsMatched: scheduleJoin.matched, scheduleKickoffsUnmatched: scheduleJoin.unmatched,
    scheduleConflictingGameIds: scheduleJoin.conflictingGameIds,
    csvRows: rows.length, rowsSeen: qualityAudit.rowsSeen, rowsAccepted: qualityAudit.rowsAccepted,
    rowsRejected: qualityAudit.rowsRejected, rejectedByReason: qualityAudit.rejectedByReason,
    gamesSeen: qualityAudit.gamesSeen, gamesAccepted: qualityAudit.gamesAccepted,
    gamesRejected: qualityAudit.gamesRejected, conflictingGames: qualityAudit.conflictingGames,
    gamesNotConfirmedFinal: Math.max(0, qualityAudit.gamesAccepted - records.length),
    jsonPayloadBytesTotal, largestJsonPayloadBytes,
    averageJsonPayloadBytes: saved ? Math.round(jsonPayloadBytesTotal / saved) : 0,
    jsonPayloadMeasurement: "UTF-8 bytes of JSON.stringify(datasetPayload) immediately before each Blob write",
    dateOnlyEvents: records.filter(record => record.eventTimePrecision === "date_only").length,
    scheduledKickoffEvents: scheduleJoin.matched, matchesImported: saved,
    scoredMatches: saved, playsImported: records.reduce((total, record) => total + Number(record.playCount || 0), 0),
    playerLinesImported: records.reduce((total, record) => total + Number(record.playerCount || 0), 0),
    aiCalls: 0, sourceReportedNotIndependentlyVerified: true,
    note: "Play-by-play and derived team/player box-score counts are from the source dataset. Player ratings, confirmed snap participation, injuries, lineups and any field absent from the source are not invented."
  };
  await put("library/model-lab/provider-sync-runs", summary.id, summary);
  await put("scheduler-state", "nflverse-pbp-sync", {
    status: summary.status, lastCheck: summary.completedAt, providerId: PROVIDER_ID,
    season: String(season), matchesImported: saved, playsImported: summary.playsImported,
    playerLinesImported: summary.playerLinesImported, sourceUrl
  });
  return summary;
}


export async function getNflversePlayByPlaySyncStatus() {
  const state = await get<any>("scheduler-state", "nflverse-pbp-sync");
  const runs = await list<any>("library/model-lab/provider-sync-runs", 100);
  const recentRuns = runs.filter(run => run.providerId === PROVIDER_ID)
    .sort((a, b) => Date.parse(b.startedAt || "") - Date.parse(a.startedAt || ""))
    .slice(0, 5);
  return {
    providerId: PROVIDER_ID, status: state?.status || "not_yet_run",
    lastCheck: state?.lastCheck || null, totals: state || null, recentRuns
  };
}

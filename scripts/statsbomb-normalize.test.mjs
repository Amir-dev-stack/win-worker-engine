import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStatsBombMatch } from "../netlify/lib/statsbomb-normalize.mjs";

const match = {
  match_id: 12345,
  match_date: "2023-10-08",
  kick_off: "16:30:00.000",
  competition: { competition_id: 2, competition_name: "Premier League" },
  season: { season_id: 27, season_name: "2023/2024" },
  home_team: { name: "Home FC" },
  away_team: { name: "Away FC" },
  home_score: 1,
  away_score: 0,
  match_status: "available"
};

test("StatsBomb normalization preserves source identity and timezone-safe date semantics", () => {
  const row = normalizeStatsBombMatch(match, [], [], { sourceUrl: "https://github.com/hudl/open-data" });
  assert.equal(row.eventId, "statsbomb-12345");
  assert.equal(row.eventStart, "2023-10-08");
  assert.equal(row.eventStartPrecision, "date_only");
  assert.equal(row.kickoffLocalTime, "16:30:00.000");
  assert.equal(row.kickoffTimezone, null);
  assert.deepEqual(row.fullTimeScore, [1, 0]);
  assert.equal(row.sourceProvider, "statsbomb-open-data");
  assert.equal(row.modelLabOnly, true);
  assert.equal(row.details.statsbombEventSummary.ratingAvailable, false);
});

test("StatsBomb normalization derives event counts and player metrics only from supplied events", () => {
  const events = [
    {
      id: "e1", type: { name: "Shot" }, team: { name: "Home FC" },
      player: { id: 7, name: "A Player" },
      shot: { statsbomb_xg: 0.42, outcome: { name: "Goal" } }
    },
    {
      id: "e2", type: { name: "Pass" }, team: { name: "Home FC" },
      player: { id: 7, name: "A Player" }, pass: { goal_assist: true }
    },
    {
      id: "e3", type: { name: "Pressure" }, team: { name: "Away FC" },
      player: { id: 9, name: "B Player" }
    },
    {
      id: "e4", type: { name: "Foul Committed" }, team: { name: "Away FC" },
      player: { id: 9, name: "B Player" },
      foul_committed: { card: { name: "Yellow Card" } }
    }
  ];
  const row = normalizeStatsBombMatch(match, events, [
    { team_name: "Home FC", lineup: [{ player_id: 7, player_name: "A Player", positions: [{ position: "Forward" }] }] }
  ]);
  const home = row.details.playerStats.find(item => item.player === "A Player");
  const away = row.details.playerStats.find(item => item.player === "B Player");
  assert.equal(row.details.statsbombEventSummary.eventCount, 4);
  assert.equal(row.details.statsbombEventSummary.shots, 1);
  assert.equal(row.details.statsbombEventSummary.shotsOnTarget, 1);
  assert.equal(row.details.statsbombEventSummary.goals, 1);
  assert.equal(row.details.statsbombEventSummary.expectedGoals, 0.42);
  assert.equal(home.statistics.goals, 1);
  assert.equal(home.statistics.completedPasses, 1);
  assert.equal(home.statistics.keyPasses, 1);
  assert.equal(home.position, "Forward");
  assert.equal(away.statistics.pressures, 1);
  assert.equal(away.statistics.yellowCards, 1);
  assert.equal(row.attribution.includes("StatsBomb Open Data"), true);
});

test("StatsBomb normalization never invents a score or silently accepts malformed match identity", () => {
  const withoutScore = normalizeStatsBombMatch({ ...match, home_score: null, away_score: null }, [], []);
  assert.equal(withoutScore.fullTimeScore, null);
  assert.throws(() => normalizeStatsBombMatch({ ...match, match_date: "08/10/2023" }, [], []), /statsbomb_match_identity_invalid/);
});

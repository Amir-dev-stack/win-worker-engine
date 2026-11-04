import test from "node:test";
import assert from "node:assert/strict";
import {
  extractSportScoreMatchRows,
  normalizeSportScoreMatch,
  normalizeSportScorePayload
} from "../netlify/lib/sportscore-normalize.mjs";

test("normalizes a football match with source identity, score and competition", () => {
  const result = normalizeSportScorePayload({
    matches: [{
      id: 7420812,
      slug: "home-fc-vs-away-fc",
      home_team: { name: "Home FC" },
      away_team: { name: "Away FC" },
      competition: { name: "Premier League" },
      score: { home: 2, away: 1 },
      status: "finished",
      start_time: "2026-11-05T18:00:00Z"
    }]
  }, "football", "2026-11-05T19:00:00.000Z");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].event, "Home FC vs Away FC");
  assert.equal(result.matches[0].homeScore, 2);
  assert.equal(result.matches[0].awayScore, 1);
  assert.equal(result.matches[0].scoreAvailable, true);
  assert.equal(result.matches[0].competition, "Premier League");
  assert.equal(result.matches[0].sourceProvider, "sportscore-live");
  assert.equal(result.matches[0].resultIndependentlyVerified, false);
  assert.equal(result.fetchedAt, "2026-11-05T19:00:00.000Z");
  assert.equal(result.attribution.label, "Powered by SportScore");
  assert.equal(result.attribution.rel, "dofollow");
});

test("supports basketball, cricket and tennis with zero scores preserved", () => {
  for (const sport of ["basketball", "cricket", "tennis"]) {
    const item = normalizeSportScoreMatch({
      id: sport + "-match",
      home: "Side One",
      away: "Side Two",
      home_score: 0,
      away_score: 0,
      status: "live"
    }, sport);
    assert.equal(item.sport, sport);
    assert.equal(item.homeScore, 0);
    assert.equal(item.awayScore, 0);
    assert.equal(item.scoreAvailable, true);
  }
});

test("handles nested API envelopes and omits malformed or team-incomplete rows", () => {
  const rows = extractSportScoreMatchRows({
    data: { matches: [
      { homeTeam: { name: "One" }, awayTeam: { name: "Two" }, scores: { homeScore: 1, awayScore: 0 } },
      { homeTeam: { name: "Missing Away" } },
      null
    ] }
  });
  assert.equal(rows.length, 3);
  const normalized = normalizeSportScorePayload({ data: { matches: rows } }, "football", "2026-11-05T10:00:00.000Z");
  assert.equal(normalized.matches.length, 1);
  assert.equal(normalized.summary.rowsReceived, 3);
  assert.equal(normalized.summary.rowsSkipped, 2);
});

test("does not invent scores, kickoff times or independent result verification", () => {
  const item = normalizeSportScoreMatch({
    home_team: { name: "One" },
    away_team: { name: "Two" },
    status: "upcoming"
  }, "tennis");
  assert.equal(item.homeScore, null);
  assert.equal(item.awayScore, null);
  assert.equal(item.scoreAvailable, false);
  assert.equal(item.startsAt, null);
  assert.equal(item.timeSemantics, "source_supplied_unverified");
  assert.equal(item.resultIndependentlyVerified, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildApiFootballMatchDossier, getApiFootballReadiness } from "../netlify/lib/api-football-adapter.mts";
import { DATA_PROVIDER_REGISTRY, providerMayRunAutomatically } from "../netlify/lib/data-provider-registry.mts";

const fixturePayload = {
  response: [{
    fixture: { id: 12345, referee: "Referee A", timezone: "Europe/Warsaw", date: "2026-11-04T20:00:00+00:00", timestamp: 1793822400, status: { short: "FT", long: "Match Finished" }, venue: { name: "Stadium", city: "City" } },
    league: { id: 2, name: "UEFA Champions League", country: "World", season: 2026, round: "League stage - 4" },
    teams: { home: { id: 1, name: "Home FC" }, away: { id: 2, name: "Away FC" } },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 } }
  }]
};

test("API-Football dossier preserves fixture identity and normalizes team/player/event detail", () => {
  const dossier = buildApiFootballMatchDossier({
    fixturePayload,
    leaguePayload: { response: [{ league: { id: 2, name: "UEFA Champions League" }, country: { name: "World" }, seasons: [{ year: 2026, start: "2026-08-01", end: "2027-06-01", current: true, coverage: { fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true }, standings: true, injuries: true, predictions: true, odds: true } }] }] },
    eventsPayload: { response: [{ time: { elapsed: 12, extra: null }, team: { id: 1, name: "Home FC" }, player: { id: 10, name: "Player One" }, assist: { id: 11, name: "Player Two" }, type: "Goal", detail: "Normal Goal", comments: null }] },
    lineupsPayload: { response: [{ team: { id: 1, name: "Home FC" }, formation: "4-3-3", coach: { id: 77, name: "Coach" }, startXI: [{ player: { id: 10, name: "Player One", pos: "F" } }], substitutes: [{ player: { id: 12, name: "Sub" } }] }] },
    statisticsPayload: { response: [{ team: { id: 1, name: "Home FC" }, statistics: [{ type: "Total Shots", value: 14 }, { type: "Ball Possession", value: "61%" }, { type: "Expected Goals", value: null }] }] },
    playersPayload: { response: [{ team: { id: 1, name: "Home FC" }, players: [{ player: { id: 10, name: "Player One" }, statistics: [{ games: { minutes: 90, position: "F", rating: "8.1" }, shots: { total: 4, on: 2 }, goals: { total: 1, assists: 0 }, passes: { total: 20, key: 2, accuracy: "85%" }, tackles: { total: 1, interceptions: 0 }, duels: { total: 6, won: 4 }, dribbles: { attempts: 3, success: 2 }, fouls: { committed: 1, drawn: 2 }, cards: { yellow: 0, red: 0 }, penalty: { scored: 0, missed: 0 } }] }] }] },
    injuriesPayload: { response: [] },
    endpointAudit: [{ endpoint: "/fixtures", status: "success" }],
    enabledDomains: ["competition_coverage","match_events","lineups","team_match_statistics","half_time_team_statistics","player_match_statistics","player_ratings","results","injuries","predictions","pre_match_odds","competition_standings","head_to_head"],
    retrievedAt: "2026-11-04T19:00:00.000Z"
  }, { allowPlayerRatings: true, allowResults: true });
  assert.equal(dossier.id, "api-football-12345");
  assert.equal(dossier.fixture.home.name, "Home FC");
  assert.equal(dossier.fixture.goals.away, 1);
  assert.equal(dossier.competition.seasonCoverage.year, 2026);
  assert.equal(dossier.coverage.find(x => x.id === "competition_season_coverage").status, "available");
  assert.equal(dossier.teamStatistics[0].statistics[0].value, 14);
  assert.equal(dossier.events[0].type, "Goal");
  assert.equal(dossier.events[0].player.name, "Player One");
  assert.equal(dossier.lineups[0].formation, "4-3-3");
  assert.equal(dossier.playerStatistics[0].statistics[0].shots.on, 2);
  assert.equal(dossier.coverage.find(x => x.id === "player_ratings").status, "available");
  assert.equal(dossier.playerRatings[0].rating, "8.1");
  assert.equal(dossier.provenance.sourceReportedNotIndependentlyVerified, true);
  assert.ok(dossier.raw.players);

test("player ratings are not exposed unless the separate player_ratings domain is enabled", () => {
  const dossier = buildApiFootballMatchDossier({
    fixturePayload,
    playersPayload: { response: [{ team: { id: 1, name: "Home FC" }, players: [{ player: { id: 10, name: "Player One" }, statistics: [{ games: { minutes: 90, rating: "8.1" }, shots: { total: 2 } }] }] }] },
    enabledDomains: ["player_match_statistics"],
    retrievedAt: "2026-11-04T19:00:00.000Z"
  });
  assert.equal(dossier.playerStatistics[0].statistics[0].games.rating, null);
  assert.deepEqual(dossier.playerRatings, []);
  assert.equal(dossier.coverage.find(x => x.id === "player_ratings").status, "not_authorized_by_enabled_domain");
  assert.equal(dossier.raw.players.response[0].players[0].statistics[0].games.rating, undefined);
});

});

test("missing fields remain null and coverage false is not converted into zero statistics", () => {
  const dossier = buildApiFootballMatchDossier({
    fixturePayload,
    leaguePayload: { response: [{ league: { id: 2 }, seasons: [{ year: 2026, coverage: { fixtures: { events: false, lineups: false, statistics_fixtures: false, statistics_players: false }, standings: true, injuries: false, odds: false } }] }] },
    enabledDomains: ["competition_coverage","team_match_statistics","player_match_statistics"],
    retrievedAt: "2026-11-04T19:00:00.000Z"
  });
  assert.deepEqual(dossier.teamStatistics, []);
  assert.deepEqual(dossier.playerStatistics, []);
  assert.equal(dossier.coverage.find(x => x.id === "fixture_events").status, "not_in_competition_coverage");
  assert.equal(dossier.coverage.find(x => x.id === "player_match_statistics").status, "not_in_competition_coverage");
  assert.equal(dossier.fixture.referee, "Referee A");
  assert.equal(dossier.fixture.home.name, "Home FC");
});


test("result scores are redacted unless the separate results domain is enabled", () => {
  const dossier = buildApiFootballMatchDossier({ fixturePayload });
  assert.equal(dossier.fixture.goals, null);
  assert.equal(dossier.fixture.score, null);
  assert.equal(dossier.raw.fixture.response[0].goals, undefined);
  assert.equal(dossier.raw.fixture.response[0].score, undefined);
});

test("API-Football remains disabled until legal and credential approvals are configured", () => {
  const provider = DATA_PROVIDER_REGISTRY.find(x => x.id === "api-sports");
  assert.ok(provider);
  assert.equal(provider.accessMode, "licensed_api");
  assert.equal(provider.licenceReview, "required");
  assert.equal(provider.automationAllowed, false);
  assert.match(provider.licenceReference, /^https:\/\//);
  assert.ok(provider.dataDomains.includes("match_events"));
  assert.ok(provider.dataDomains.includes("player_ratings"));
  assert.equal(
    providerMayRunAutomatically(provider, {
      providerId: provider.id, status: "connected", verifiedAt: "2026-11-04T00:00:00.000Z",
      enabledDomains: provider.dataDomains, termsReference: provider.licenceReference
    }),
    false,
    "a configured API key cannot bypass the central rights-review state"
  );
  const readiness = getApiFootballReadiness();
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.includes("provider_terms_review_required"));
});

test("the authenticated API route and build manifest include the football connector", async () => {
  const [route, build, status] = await Promise.all([
    readFile(new URL("../netlify/functions/api-football-sync.mts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../netlify/functions/research-status.mts", import.meta.url), "utf8")
  ]);
  assert.match(route, /requireAuth/);
  assert.match(route, /syncApiFootballFixtureDossier/);
  assert.match(route, /path: "\/api\/football-data"/);
  assert.match(build, /netlify\/lib\/api-football-adapter\.mts/);
  assert.match(build, /netlify\/functions\/api-football-sync\.mts/);
  assert.match(status, /getApiFootballSyncStatus/);
});

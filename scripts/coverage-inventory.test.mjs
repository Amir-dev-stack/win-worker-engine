import assert from "node:assert/strict";
import test from "node:test";
import { buildCoverageInventory } from "../netlify/lib/coverage-inventory.mts";

const providers = [
  {
    id: "open-source", name: "Open Source", sports: ["football"], dataDomains: ["fixtures"],
    accessMode: "open_download", authentication: "none", licenceReview: "approved",
    automationAllowed: true, licenceReference: "https://example.test/licence"
  },
  {
    id: "rights-pending", name: "Rights Pending", sports: ["football"], dataDomains: ["lineups"],
    accessMode: "open_download", authentication: "none", licenceReview: "required",
    automationAllowed: false
  },
  {
    id: "commercial", name: "Commercial", sports: ["football"], dataDomains: ["injuries"],
    accessMode: "licensed_api", authentication: "api_key", licenceReview: "required",
    automationAllowed: false
  }
];

test("inventories explicit competition season team player and market identities", () => {
  const report = buildCoverageInventory([
    {
      sport: "football", competition: "Premier League", competitionId: "epl", season: "2026/27",
      homeTeam: "Arsenal", awayTeam: "Chelsea", playerName: "Player A", market: "1X2",
      retrievedAt: "2026-11-19T12:00:00Z"
    },
    {
      sport: "football", league: "Premier League", season: "2026/27",
      teams: [{ name: "Chelsea" }, { name: "Liverpool" }], markets: ["Totals", "1X2"]
    },
    { sport: "basketball", competition: "NBA", teams: ["Boston", "New York"], marketType: "moneyline" },
    { sport: "football", domain: "market rules" }
  ], providers);

  const dimension = id => report.dimensions.find(item => item.id === id);
  assert.equal(dimension("competitions").distinctObserved, 3);
  assert.equal(dimension("seasons").distinctObserved, 1);
  assert.equal(dimension("teams").distinctObserved, 5);
  assert.equal(dimension("players").distinctObserved, 1);
  assert.equal(dimension("markets").distinctObserved, 3);
  assert.equal(dimension("seasons").recordsWithoutIdentity, 2);
  assert.equal(dimension("competitions").recordsWithStableId, 1);
  assert.equal(dimension("competitions").latestObservedAt, "2026-11-19T12:00:00.000Z");
  assert.equal(dimension("competitions").recordsWithoutTimestamp, 2);
  assert.deepEqual(report.bySport.map(item => item.sportId), ["basketball", "football"]);
  assert.equal(report.bySport.find(item => item.sportId === "football").evidenceRecords, 3);
});

test("provider inventory distinguishes open candidates from live connections", () => {
  const report = buildCoverageInventory([], providers);
  assert.equal(report.providers.registryEntries, 3);
  assert.equal(report.providers.approvedOpenNoCredentialCount, 1);
  assert.equal(report.providers.liveVerifiedConnections, 0);
  assert.equal(report.providers.approvedOpenNoCredentialCandidates[0].connectionStatus, "registry_approved_not_live_verified");
  assert.match(report.providers.warning, /not proof of current connectivity/i);
});

test("domain gap matrix separates observed, approved-open, blocked and unknown coverage", () => {
  const report = buildCoverageInventory([
    { sport: "football", domain: "injury report", retrievedAt: "2026-11-19T10:00:00Z" }
  ], providers, ["football", "tennis"]);
  const football = report.domainMatrix.bySport.find(item => item.sportId === "football");
  const tennis = report.domainMatrix.bySport.find(item => item.sportId === "tennis");
  const domain = (sport, id) => sport.domains.find(item => item.id === id);
  assert.equal(domain(football, "fixtures").status, "approved_open_candidate_only");
  assert.equal(domain(football, "injuries").status, "observed_in_persisted_evidence");
  assert.equal(domain(football, "lineups").status, "blocked_candidate_only");
  assert.equal(domain(football, "tactics_matchups").status, "no_known_coverage");
  assert.equal(domain(tennis, "fixtures").status, "no_known_coverage");
  assert.deepEqual(domain(football, "fixtures").approvedOpenCandidateProviderIds, ["open-source"]);
  assert.deepEqual(domain(football, "lineups").blockedCandidateProviderIds, ["rights-pending"]);
});

test("empty or malformed evidence remains explicit and bounded", () => {
  const report = buildCoverageInventory([null, [], "bad"], []);
  assert.equal(report.evidenceRecords, 0);
  assert.equal(report.bySport.length, 0);
  assert.ok(report.dimensions.every(item => item.distinctObserved === 0 && item.recordsWithoutIdentity === 0));
});

test("dimension samples are bounded without changing distinct counts", () => {
  const evidence = Array.from({ length: 30 }, (_, index) => ({
    sport: "football", competition: `League ${index.toString().padStart(2, "0")}`
  }));
  const competition = buildCoverageInventory(evidence, []).dimensions.find(item => item.id === "competitions");
  assert.equal(competition.distinctObserved, 30);
  assert.equal(competition.sample.length, 20);
  assert.equal(competition.sampleTruncated, true);
});

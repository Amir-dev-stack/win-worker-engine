import test from "node:test";
import assert from "node:assert/strict";
import { assessWinFootballCoverageByCompetitionSeason } from "../netlify/lib/ml-football-season-coverage.mts";

const fixtures = [
  { eventId: "a1", competitionId: "league-a", season: "2025-26", kickoff: "2025-09-01T18:00:00.000Z" },
  { eventId: "a2", competitionId: "league-a", season: "2025-26", kickoff: "2025-09-08T18:00:00.000Z" },
  { eventId: "b1", competitionId: "league-b", season: "2025-6", kickoff: "2025-09-02T18:00:00.000Z" }
];
const results = fixtures.map(f => ({ eventId: f.eventId, resultAvailableAt: new Date(Date.parse(f.kickoff) + 7200000).toISOString() }));
const oddsSnapshots = [
  { eventId: "a1", marketId: "1x2", phase: "opening", capturedAt: "2025-09-01T10:00:00.000Z", decimalOdds: 2.1 },
  { eventId: "a1", marketId: "1x2", phase: "closing", capturedAt: "2025-09-01T17:55:00.000Z", decimalOdds: 2.0 },
  { eventId: "a2", marketId: "1x2", phase: "intermediate", capturedAt: "2025-09-08T12:00:00.000Z", decimalOdds: 2.2 },
  { eventId: "b1", marketId: "1x2", phase: "closing", capturedAt: "2025-09-02T18:00:00.000Z", decimalOdds: 1.9 }
];

test("groups historical coverage by competition and season and preserves explicit odds phases", () => {
  const report = assessWinFootballCoverageByCompetitionSeason({
    fixtures, results, oddsSnapshots, requiredMarketIds: ["1x2"]
  });
  assert.equal(report.groups.length, 2);
  const leagueA = report.groups.find(g => g.competitionId === "league-a");
  const leagueB = report.groups.find(g => g.competitionId === "league-b");
  assert.equal(leagueA?.assessment.resultCoveragePct, 100);
  assert.equal(leagueA?.phaseCoverage.opening.coveredEventMarkets, 1);
  assert.equal(leagueA?.phaseCoverage.intermediate.coveredEventMarkets, 1);
  assert.equal(leagueA?.phaseCoverage.closing.coveredEventMarkets, 1);
  assert.equal(leagueB?.phaseCoverage.closing.coveredEventMarkets, 0);
  assert.equal(report.trainingApprovalGranted, false);
});

test("does not assign ambiguous reused event IDs or malformed fixtures to a season", () => {
  const report = assessWinFootballCoverageByCompetitionSeason({
    fixtures: [...fixtures, { ...fixtures[0], competitionId: "league-c", season: "2025-26" },
      { eventId: "bad", competitionId: "league-a", season: "2025-26", kickoff: "2025-02-31T18:00:00.000Z" }],
    results: [...results, { eventId: "missing", resultAvailableAt: "2025-09-01T20:00:00.000Z" }],
    oddsSnapshots: [{ eventId: "missing", marketId: "1x2", phase: "closing", capturedAt: "2025-09-01T17:00:00.000Z", decimalOdds: 2 }],
    requiredMarketIds: ["1x2"]
  });
  assert.ok(report.reasons.includes("event_id_reused_across_competition_or_season:a1"));
  assert.equal(report.unassignedResultCount, 2);
  assert.equal(report.unassignedOddsSnapshotCount, 3);
  assert.equal(report.invalidFixtureCount, 1);
  assert.equal(report.completeForResearch, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { assessWinFootballHistoricalCoverage } from "../netlify/lib/ml-football-coverage-assessment.mts";

const fixtures = [
  { eventId: "m1", kickoff: "2026-10-01T18:00:00.000Z" },
  { eventId: "m2", kickoff: "2026-10-02T18:00:00.000Z" }
];
const results = [
  { eventId: "m1", resultAvailableAt: "2026-10-01T20:00:00.000Z" },
  { eventId: "m2", resultAvailableAt: "2026-10-02T20:00:00.000Z" }
];
const odds = [
  { eventId: "m1", marketId: "1x2", capturedAt: "2026-10-01T17:00:00.000Z", decimalOdds: 2.1 },
  { eventId: "m1", marketId: "over_2_5", capturedAt: "2026-10-01T17:00:00.000Z", decimalOdds: 1.9 },
  { eventId: "m2", marketId: "1x2", capturedAt: "2026-10-02T17:00:00.000Z", decimalOdds: 2.3 },
  { eventId: "m2", marketId: "over_2_5", capturedAt: "2026-10-02T18:00:00.000Z", decimalOdds: 1.8 }
];

test("coverage assessment reports complete fixture results and excludes post-kickoff odds", () => {
  const report = assessWinFootballHistoricalCoverage({
    fixtures, results, oddsSnapshots: odds, requiredMarketIds: ["1x2", "over_2_5"]
  });
  assert.equal(report.expectedFixtureCount, 2);
  assert.equal(report.resultCoveragePct, 100);
  assert.equal(report.preKickoffOddsCoveredCount, 3);
  assert.equal(report.preKickoffOddsCoveragePct, 75);
  assert.equal(report.postKickoffSnapshotCount, 1);
  assert.deepEqual(report.missingPreKickoffOdds, ["m2::over_2_5"]);
  assert.equal(report.completeForResearch, false);
  assert.equal(report.trainingApprovalGranted, false);
});

test("coverage assessment identifies missing results and rejects unknown or malformed observations", () => {
  const report = assessWinFootballHistoricalCoverage({
    fixtures, results: [results[0], { eventId: "unknown", resultAvailableAt: results[1].resultAvailableAt }],
    oddsSnapshots: [{ eventId: "m1", marketId: "unknown", capturedAt: odds[0].capturedAt, decimalOdds: 2 }],
    requiredMarketIds: ["1x2"]
  });
  assert.deepEqual(report.missingResultEventIds, ["m2"]);
  assert.equal(report.resultCoveragePct, 50);
  assert.equal(report.invalidSnapshotCount, 1);
  assert.ok(report.reasons.includes("result_event_not_in_expected_universe:unknown"));
  assert.ok(report.reasons.includes("historical_results_incomplete"));
});

test("coverage assessment fails closed for duplicate fixtures, impossible timestamps and bad prices", () => {
  const report = assessWinFootballHistoricalCoverage({
    fixtures: [...fixtures, fixtures[0], { eventId: "m3", kickoff: "2026-02-31T18:00:00.000Z" }],
    results: [{ eventId: "m1", resultAvailableAt: "2026-10-01T17:00:00.000Z" }],
    oddsSnapshots: [{ eventId: "m1", marketId: "1x2", capturedAt: odds[0].capturedAt, decimalOdds: 1 }],
    requiredMarketIds: ["1x2", "1x2"]
  });
  assert.ok(report.reasons.includes("fixture_duplicate:m1"));
  assert.ok(report.reasons.includes("fixture_kickoff_invalid:m3"));
  assert.ok(report.reasons.includes("result_available_before_kickoff:m1"));
  assert.ok(report.reasons.includes("market_id_duplicate:1x2"));
  assert.equal(report.trainingApprovalGranted, false);
});

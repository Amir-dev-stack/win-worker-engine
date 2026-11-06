import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export type WinFootballCoverageFixture = { eventId: string; kickoff: string };
export type WinFootballCoverageResult = { eventId: string; resultAvailableAt: string };
export type WinFootballCoverageOddsSnapshot = {
  eventId: string;
  marketId: string;
  capturedAt: string;
  decimalOdds: number;
};

export type WinFootballHistoricalCoverageAssessment = {
  expectedFixtureCount: number;
  resultCoveredCount: number;
  resultCoveragePct: number;
  missingResultEventIds: string[];
  expectedEventMarketCount: number;
  preKickoffOddsCoveredCount: number;
  preKickoffOddsCoveragePct: number;
  missingPreKickoffOdds: string[];
  postKickoffSnapshotCount: number;
  invalidSnapshotCount: number;
  completeForResearch: false;
  trainingApprovalGranted: false;
  reasons: string[];
};

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const pct = (covered: number, expected: number) =>
  expected === 0 ? 0 : Math.round((covered / expected) * 10000) / 100;

function uniqueById<T>(items: T[], getId: (item: T) => string, label: string, errors: string[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = getId(item);
    if (!nonEmpty(id)) { errors.push(label + "_id_required"); continue; }
    if (result.has(id)) errors.push(label + "_duplicate:" + id);
    else result.set(id, item);
  }
  return result;
}

/**
 * Compare an explicitly supplied fixture universe with normalized result and odds
 * observations. This computes descriptive coverage only: it cannot establish that
 * the expected universe is complete, that a publisher is independent, or that data
 * is licensed, connected, predictive, or approved for training.
 */
export function assessWinFootballHistoricalCoverage(args: {
  fixtures: WinFootballCoverageFixture[];
  results: WinFootballCoverageResult[];
  oddsSnapshots: WinFootballCoverageOddsSnapshot[];
  requiredMarketIds: string[];
}): WinFootballHistoricalCoverageAssessment {
  const errors: string[] = [];
  const fixtures = Array.isArray(args?.fixtures) ? args.fixtures : [];
  const results = Array.isArray(args?.results) ? args.results : [];
  const snapshots = Array.isArray(args?.oddsSnapshots) ? args.oddsSnapshots : [];
  const markets = Array.isArray(args?.requiredMarketIds) ? args.requiredMarketIds : [];
  if (!fixtures.length) errors.push("expected_fixture_universe_required");
  if (!markets.length) errors.push("required_market_universe_required");

  const fixtureMap = uniqueById(fixtures, x => x?.eventId, "fixture", errors);
  for (const fixture of fixtureMap.values()) {
    if (!isStrictIsoTimestamp(fixture.kickoff)) errors.push("fixture_kickoff_invalid:" + fixture.eventId);
  }
  const marketSet = new Set<string>();
  for (const market of markets) {
    if (!nonEmpty(market)) errors.push("market_id_required");
    else if (marketSet.has(market)) errors.push("market_id_duplicate:" + market);
    else marketSet.add(market);
  }

  const resultMap = new Map<string, WinFootballCoverageResult>();
  for (const result of results) {
    if (!nonEmpty(result?.eventId) || !isStrictIsoTimestamp(result?.resultAvailableAt)) {
      errors.push("result_observation_invalid");
      continue;
    }
    if (resultMap.has(result.eventId)) errors.push("result_observation_duplicate:" + result.eventId);
    else resultMap.set(result.eventId, result);
    const fixture = fixtureMap.get(result.eventId);
    if (!fixture) errors.push("result_event_not_in_expected_universe:" + result.eventId);
    else if (isStrictIsoTimestamp(fixture.kickoff) &&
      Date.parse(result.resultAvailableAt) < Date.parse(fixture.kickoff)) {
      errors.push("result_available_before_kickoff:" + result.eventId);
    }
  }

  const validPreKickoffMarkets = new Set<string>();
  let postKickoffSnapshotCount = 0;
  let invalidSnapshotCount = 0;
  for (const snapshot of snapshots) {
    const fixture = fixtureMap.get(snapshot?.eventId);
    if (!fixture || !marketSet.has(snapshot?.marketId) ||
        !isStrictIsoTimestamp(snapshot?.capturedAt) ||
        !Number.isFinite(snapshot?.decimalOdds) || snapshot.decimalOdds <= 1) {
      invalidSnapshotCount++;
      continue;
    }
    if (!isStrictIsoTimestamp(fixture.kickoff)) {
      invalidSnapshotCount++;
      continue;
    }
    if (Date.parse(snapshot.capturedAt) >= Date.parse(fixture.kickoff)) {
      postKickoffSnapshotCount++;
      continue;
    }
    validPreKickoffMarkets.add(snapshot.eventId + "::" + snapshot.marketId);
  }

  const missingResultEventIds = [...fixtureMap.keys()].filter(id => !resultMap.has(id)).sort();
  const expectedEventMarketCount = fixtureMap.size * marketSet.size;
  const missingPreKickoffOdds: string[] = [];
  for (const eventId of fixtureMap.keys()) {
    for (const marketId of marketSet) {
      const key = eventId + "::" + marketId;
      if (!validPreKickoffMarkets.has(key)) missingPreKickoffOdds.push(key);
    }
  }
  missingPreKickoffOdds.sort();
  const resultCoveredCount = fixtureMap.size - missingResultEventIds.length;
  const preKickoffOddsCoveredCount = expectedEventMarketCount - missingPreKickoffOdds.length;
  const reasons = [...new Set(errors)];
  if (missingResultEventIds.length) reasons.push("historical_results_incomplete");
  if (missingPreKickoffOdds.length) reasons.push("pre_kickoff_odds_incomplete");
  if (postKickoffSnapshotCount) reasons.push("post_kickoff_snapshots_excluded");
  if (invalidSnapshotCount) reasons.push("invalid_or_out_of_scope_snapshots_excluded");
  return {
    expectedFixtureCount: fixtureMap.size,
    resultCoveredCount,
    resultCoveragePct: pct(resultCoveredCount, fixtureMap.size),
    missingResultEventIds,
    expectedEventMarketCount,
    preKickoffOddsCoveredCount,
    preKickoffOddsCoveragePct: pct(preKickoffOddsCoveredCount, expectedEventMarketCount),
    missingPreKickoffOdds,
    postKickoffSnapshotCount,
    invalidSnapshotCount,
    completeForResearch: false,
    trainingApprovalGranted: false,
    reasons
  };
}

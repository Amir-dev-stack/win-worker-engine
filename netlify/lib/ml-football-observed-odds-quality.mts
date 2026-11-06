import type { ObservedMarket } from "./market-catalog.mts";
import {
  assessWinFootballOddsQuality,
  type WinFootballOddsQualityFixture,
  type WinFootballExpectedMarket
} from "./ml-football-odds-quality.mts";

/**
 * Read-only bridge from WIN's normalized observed-market schema into the
 * football pre-match odds-quality assessor. Market/outcome IDs remain explicit:
 * callers must provide the exact expected outcome catalogue for each market.
 */
export function assessWinObservedFootballOddsQuality(args: {
  fixtures: WinFootballOddsQualityFixture[];
  records: ObservedMarket[];
  expectedMarkets: WinFootballExpectedMarket[];
  maxSnapshotAgeMinutes?: number;
  expectedCadenceMinutes?: number;
  suspiciousRelativeMoveThreshold?: number;
  maxOutcomeTimestampSkewMinutes?: number;
}) {
  const records = Array.isArray(args?.records) ? args.records : [];
  const eligible = records.filter(row =>
    row?.sportId === "football" &&
    row?.live === false &&
    row?.eventTimeSemantics === "scheduled_event_start"
  );
  const snapshots = eligible.map(row => ({
    snapshotId: row.sourceRecordId,
    eventId: row.eventId,
    marketId: row.canonicalMarketId + "::" + row.period,
    outcomeId: [row.selectionType || "", row.selection || ""].join("::"),
    bookmakerId: row.bookmakerId,
    sourceId: row.providerId,
    capturedAt: row.observedAt,
    decimalOdds: row.oddsDecimal,
    line: row.line ?? null
  }));
  const expectedMarkets = (Array.isArray(args?.expectedMarkets) ? args.expectedMarkets : []).map(m => ({
    ...m,
    marketId: m.marketId.includes("::") ? m.marketId : m.marketId + "::full_event"
  }));
  const report = assessWinFootballOddsQuality({
    fixtures: args?.fixtures || [],
    snapshots,
    expectedMarkets,
    ...(args?.maxSnapshotAgeMinutes !== undefined ? { maxSnapshotAgeMinutes: args.maxSnapshotAgeMinutes } : {}),
    ...(args?.expectedCadenceMinutes !== undefined ? { expectedCadenceMinutes: args.expectedCadenceMinutes } : {}),
    ...(args?.suspiciousRelativeMoveThreshold !== undefined ? { suspiciousRelativeMoveThreshold: args.suspiciousRelativeMoveThreshold } : {}),
    ...(args?.maxOutcomeTimestampSkewMinutes !== undefined ? { maxOutcomeTimestampSkewMinutes: args.maxOutcomeTimestampSkewMinutes } : {})
  });
  return {
    ...report,
    inputRecordCount: records.length,
    excludedNonFootballLiveOrNonScheduledCount: records.length - eligible.length
  };
}

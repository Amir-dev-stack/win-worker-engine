import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export type WinFootballOddsQualityFixture = { eventId: string; kickoff: string };
export type WinFootballExpectedMarket = {
  marketId: string;
  outcomeIds: string[];
  minOverround?: number;
  maxOverround?: number;
};
export type WinFootballOddsQualitySnapshot = {
  snapshotId: string;
  eventId: string;
  marketId: string;
  outcomeId: string;
  bookmakerId: string;
  sourceId: string;
  capturedAt: string;
  decimalOdds: number;
  line?: string | number | null;
  availabilityStatus?: "open" | "suspended" | "closed" | "unknown";
};
export type WinFootballOddsQualityReport = {
  snapshotCount: number;
  validPreKickoffSnapshotCount: number;
  invalidSnapshotCount: number;
  duplicateSnapshotCount: number;
  staleSnapshotCount: number;
  postKickoffSnapshotCount: number;
  missingMarketOutcomeGroups: string[];
  incompleteMarketGroupCount: number;
  overroundOutOfBounds: Array<{ groupId: string; overround: number }>;
  incoherentMarketTimestampGroups: string[];
  suspiciousPriceMoves: Array<{ quoteId: string; fromSnapshotId: string; toSnapshotId: string; relativeMove: number }>;
  cadenceGaps: Array<{ quoteId: string; from: string; to: string; gapMinutes: number }>;
  conflictingTimestampQuotes: Array<{ quoteId: string; outcomeId: string; capturedAt: string; decimalOdds: number[] }>;
  marketGroupDiagnostics: Array<{ eventId: string; marketId: string; bookmakerId: string; sourceId: string; line: string | number | null; expectedOutcomeCount: number; observedOutcomeCount: number; missingOutcomeIds: string[]; earliestCapturedAt: string; latestCapturedAt: string; overround: number | null; overroundSkippedForTimestampSkew: boolean; overroundSkippedForConflictingTimestamp: boolean }>;
  bookmakerIds: string[];
  sourceIds: string[];
  availabilityStatusCounts: { open: number; suspended: number; closed: number; unknown: number };
  bookmakerIndependenceVerified: false;
  completeForResearch: false;
  trainingApprovalGranted: false;
  reasons: string[];
};

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const identity = (...parts: unknown[]) => JSON.stringify(parts);

/**
 * Offline quality diagnostics for explicitly identified football odds observations.
 * Cadence and freshness are evaluated only when the caller supplies their thresholds.
 * Bookmaker/source IDs are labels, not proof of publisher ownership or independence.
 */
export function assessWinFootballOddsQuality(args: {
  fixtures: WinFootballOddsQualityFixture[];
  snapshots: WinFootballOddsQualitySnapshot[];
  expectedMarkets: WinFootballExpectedMarket[];
  maxSnapshotAgeMinutes?: number;
  expectedCadenceMinutes?: number;
  suspiciousRelativeMoveThreshold?: number;
  maxOutcomeTimestampSkewMinutes?: number;
}): WinFootballOddsQualityReport {
  const reasons: string[] = [];
  const fixtures = new Map<string, WinFootballOddsQualityFixture>();
  for (const f of Array.isArray(args?.fixtures) ? args.fixtures : []) {
    if (!nonEmpty(f?.eventId) || !isStrictIsoTimestamp(f?.kickoff) || fixtures.has(f.eventId)) {
      reasons.push("fixture_identity_or_kickoff_invalid");
      continue;
    }
    fixtures.set(f.eventId, f);
  }
  const expectedMarkets = new Map<string, WinFootballExpectedMarket>();
  for (const m of Array.isArray(args?.expectedMarkets) ? args.expectedMarkets : []) {
    if (!nonEmpty(m?.marketId) || !Array.isArray(m.outcomeIds) || !m.outcomeIds.length ||
        m.outcomeIds.some(x => !nonEmpty(x)) || new Set(m.outcomeIds).size !== m.outcomeIds.length ||
        expectedMarkets.has(m.marketId)) {
      reasons.push("expected_market_definition_invalid");
      continue;
    }
    expectedMarkets.set(m.marketId, m);
  }
  const maxAge = args?.maxSnapshotAgeMinutes;
  const cadence = args?.expectedCadenceMinutes;
  const jumpThreshold = args?.suspiciousRelativeMoveThreshold ?? 0.25;
  const maxOutcomeSkew = args?.maxOutcomeTimestampSkewMinutes;
  const maxAgeValid = maxAge === undefined || (Number.isFinite(maxAge) && maxAge > 0);
  const cadenceValid = cadence === undefined || (Number.isFinite(cadence) && cadence > 0);
  const jumpValid = Number.isFinite(jumpThreshold) && jumpThreshold > 0 && jumpThreshold <= 10;
  const outcomeSkewValid = maxOutcomeSkew === undefined || (Number.isFinite(maxOutcomeSkew) && maxOutcomeSkew >= 0);
  if (!maxAgeValid) reasons.push("max_snapshot_age_invalid");
  if (!cadenceValid) reasons.push("expected_cadence_invalid");
  if (!jumpValid) reasons.push("suspicious_move_threshold_invalid");
  if (!outcomeSkewValid) reasons.push("outcome_timestamp_skew_invalid");

  let invalidSnapshotCount = 0;
  let duplicateSnapshotCount = 0;
  let staleSnapshotCount = 0;
  let postKickoffSnapshotCount = 0;
  const seen = new Set<string>();
  const valid: WinFootballOddsQualitySnapshot[] = [];
  for (const s of Array.isArray(args?.snapshots) ? args.snapshots : []) {
    const f = fixtures.get(s?.eventId);
    if (!f || !expectedMarkets.has(s?.marketId) ||
        !nonEmpty(s?.snapshotId) || !nonEmpty(s?.outcomeId) ||
        !nonEmpty(s?.bookmakerId) || !nonEmpty(s?.sourceId) ||
        !isStrictIsoTimestamp(s?.capturedAt) ||
        typeof s?.decimalOdds !== "number" || !Number.isFinite(s.decimalOdds) ||
        s.decimalOdds <= 1 || s.decimalOdds > 1000 ||
        !expectedMarkets.get(s.marketId)!.outcomeIds.includes(s.outcomeId)) {
      invalidSnapshotCount++;
      continue;
    }
    const duplicateKey = identity(s.sourceId, s.snapshotId);
    if (seen.has(duplicateKey)) {
      duplicateSnapshotCount++;
      continue;
    }
    seen.add(duplicateKey);
    if (Date.parse(s.capturedAt) >= Date.parse(f.kickoff)) {
      postKickoffSnapshotCount++;
      continue;
    }
    if (maxAgeValid && maxAge !== undefined &&
        Date.parse(f.kickoff) - Date.parse(s.capturedAt) > maxAge * 60000) {
      staleSnapshotCount++;
      continue;
    }
    valid.push(s);
  }

  const quoteKey = (s: WinFootballOddsQualitySnapshot) =>
    identity(s.eventId, s.marketId, s.bookmakerId, s.sourceId, s.line ?? null);
  const groups = new Map<string, WinFootballOddsQualitySnapshot[]>();
  for (const s of valid) {
    const key = quoteKey(s);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const missingMarketOutcomeGroups: string[] = [];
  const overroundOutOfBounds: Array<{ groupId: string; overround: number }> = [];
  const incoherentMarketTimestampGroups: string[] = [];
  const suspiciousPriceMoves: WinFootballOddsQualityReport["suspiciousPriceMoves"] = [];
  const cadenceGaps: WinFootballOddsQualityReport["cadenceGaps"] = [];
  const marketGroupDiagnostics: WinFootballOddsQualityReport["marketGroupDiagnostics"] = [];
  const conflictingTimestampQuotes: WinFootballOddsQualityReport["conflictingTimestampQuotes"] = [];
  for (const [quoteId, rows] of groups) {
    rows.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.snapshotId.localeCompare(b.snapshotId));
    const latestByOutcome = new Map<string, WinFootballOddsQualitySnapshot>();
    for (const row of rows) latestByOutcome.set(row.outcomeId, row);
    const market = expectedMarkets.get(rows[0].marketId)!;
    const sameTime = new Map<string, WinFootballOddsQualitySnapshot[]>();
    for (const row of rows) {
      const key = identity(row.outcomeId, row.capturedAt);
      if (!sameTime.has(key)) sameTime.set(key, []);
      sameTime.get(key)!.push(row);
    }
    const conflictingOutcomes = new Set<string>();
    for (const [key, sameTimeRows] of sameTime) {
      const prices = [...new Set(sameTimeRows.map(row => row.decimalOdds))].sort((a, b) => a - b);
      if (prices.length > 1) {
        const [outcomeId, capturedAt] = JSON.parse(key) as [string, string];
        conflictingOutcomes.add(outcomeId);
        conflictingTimestampQuotes.push({ quoteId, outcomeId, capturedAt, decimalOdds: prices });
      }
    }
    const missing = market.outcomeIds.filter(id => !latestByOutcome.has(id));
    const latestRows = [...latestByOutcome.values()];
    const allTimes = rows.map(row => Date.parse(row.capturedAt));
    const earliestCapturedAt = new Date(Math.min(...allTimes)).toISOString();
    const latestCapturedAt = new Date(Math.max(...allTimes)).toISOString();
    const times = latestRows.map(row => Date.parse(row.capturedAt));
    const skewMinutes = times.length ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
    const overroundSkippedForTimestampSkew = missing.length === 0 &&
      outcomeSkewValid && maxOutcomeSkew !== undefined && skewMinutes > maxOutcomeSkew;
    const overroundSkippedForConflictingTimestamp = conflictingOutcomes.size > 0;
    let overround: number | null = null;
    if (missing.length) missingMarketOutcomeGroups.push(quoteId + ":" + missing.join(","));
    else if (overroundSkippedForTimestampSkew) {
      incoherentMarketTimestampGroups.push(quoteId);
    } else if (overroundSkippedForConflictingTimestamp) {
      // Do not choose an arbitrary price when one source reports conflicting quotes at the same instant.
    } else {
      overround = latestRows.reduce((sum, row) => sum + 1 / row.decimalOdds, 0);
      const min = market.minOverround ?? 0.8;
      const max = market.maxOverround ?? 1.5;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= min ||
          overround < min || overround > max) overroundOutOfBounds.push({ groupId: quoteId, overround });
    }
    const [eventId, marketId, bookmakerId, sourceId, line] = JSON.parse(quoteId) as [string, string, string, string, string | number | null];
    marketGroupDiagnostics.push({
      eventId, marketId, bookmakerId, sourceId, line,
      expectedOutcomeCount: market.outcomeIds.length,
      observedOutcomeCount: latestByOutcome.size,
      missingOutcomeIds: missing,
      earliestCapturedAt, latestCapturedAt,
      overround,
      overroundSkippedForTimestampSkew,
      overroundSkippedForConflictingTimestamp
    });
    const timelines = new Map<string, WinFootballOddsQualitySnapshot[]>();
    for (const row of rows) {
      if (!timelines.has(row.outcomeId)) timelines.set(row.outcomeId, []);
      timelines.get(row.outcomeId)!.push(row);
    }
    for (const timeline of timelines.values()) {
      timeline.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
        a.snapshotId.localeCompare(b.snapshotId));
      for (let i = 1; i < timeline.length; i++) {
        const previous = timeline[i - 1];
        const current = timeline[i];
        const relativeMove = Math.abs(current.decimalOdds - previous.decimalOdds) / previous.decimalOdds;
        if (jumpValid && relativeMove >= jumpThreshold) {
          suspiciousPriceMoves.push({ quoteId, fromSnapshotId: previous.snapshotId, toSnapshotId: current.snapshotId, relativeMove });
        }
        const gapMinutes = (Date.parse(current.capturedAt) - Date.parse(previous.capturedAt)) / 60000;
        if (cadenceValid && cadence !== undefined && gapMinutes > cadence * 1.5) {
          cadenceGaps.push({ quoteId, from: previous.capturedAt, to: current.capturedAt, gapMinutes });
        }
      }
    }
  }
  if (invalidSnapshotCount) reasons.push("invalid_odds_snapshots");
  if (duplicateSnapshotCount) reasons.push("duplicate_snapshot_ids");
  if (staleSnapshotCount) reasons.push("stale_snapshots_excluded");
  if (postKickoffSnapshotCount) reasons.push("post_kickoff_snapshots_excluded");
  if (missingMarketOutcomeGroups.length) reasons.push("incomplete_market_outcome_groups");
  if (overroundOutOfBounds.length) reasons.push("market_overround_out_of_bounds");
  if (incoherentMarketTimestampGroups.length) reasons.push("market_outcome_timestamp_skew_exceeds_limit");
  if (conflictingTimestampQuotes.length) reasons.push("conflicting_same_timestamp_quotes_flagged");
  if (suspiciousPriceMoves.length) reasons.push("suspicious_price_moves_flagged_for_review");
  if (cadenceGaps.length) reasons.push("expected_cadence_gaps");
  const availabilityStatusCounts = { open: 0, suspended: 0, closed: 0, unknown: 0 };
  for (const snapshot of valid) availabilityStatusCounts[snapshot.availabilityStatus || "unknown"]++;
  if (availabilityStatusCounts.suspended || availabilityStatusCounts.closed || availabilityStatusCounts.unknown) {
    reasons.push("non_open_or_unknown_availability_snapshots_present");
  }
  return {
    snapshotCount: Array.isArray(args?.snapshots) ? args.snapshots.length : 0,
    validPreKickoffSnapshotCount: valid.length,
    invalidSnapshotCount, duplicateSnapshotCount, staleSnapshotCount, postKickoffSnapshotCount,
    missingMarketOutcomeGroups, incompleteMarketGroupCount: missingMarketOutcomeGroups.length,
    overroundOutOfBounds, incoherentMarketTimestampGroups, suspiciousPriceMoves, cadenceGaps,
    conflictingTimestampQuotes,
    marketGroupDiagnostics: marketGroupDiagnostics.sort((a, b) => a.eventId.localeCompare(b.eventId) || a.marketId.localeCompare(b.marketId) || a.bookmakerId.localeCompare(b.bookmakerId) || a.sourceId.localeCompare(b.sourceId)),
    bookmakerIds: [...new Set(valid.map(s => s.bookmakerId))].sort(),
    sourceIds: [...new Set(valid.map(s => s.sourceId))].sort(),
    availabilityStatusCounts,
    bookmakerIndependenceVerified: false,
    completeForResearch: false,
    trainingApprovalGranted: false,
    reasons: [...new Set(reasons)]
  };
}

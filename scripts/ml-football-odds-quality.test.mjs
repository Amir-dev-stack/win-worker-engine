import test from "node:test";
import assert from "node:assert/strict";
import { assessWinFootballOddsQuality } from "../netlify/lib/ml-football-odds-quality.mts";

const fixtures = [{ eventId: "match-1", kickoff: "2026-11-10T18:00:00.000Z" }];
const expectedMarkets = [{ marketId: "1x2", outcomeIds: ["home", "draw", "away"], minOverround: 0.95, maxOverround: 1.2 }];
const snapshots = [
  { snapshotId: "h1", eventId: "match-1", marketId: "1x2", outcomeId: "home", bookmakerId: "book-a", sourceId: "feed-a", capturedAt: "2026-11-10T17:00:00.000Z", decimalOdds: 2.0 },
  { snapshotId: "d1", eventId: "match-1", marketId: "1x2", outcomeId: "draw", bookmakerId: "book-a", sourceId: "feed-a", capturedAt: "2026-11-10T17:00:00.000Z", decimalOdds: 3.4 },
  { snapshotId: "a1", eventId: "match-1", marketId: "1x2", outcomeId: "away", bookmakerId: "book-a", sourceId: "feed-a", capturedAt: "2026-11-10T17:00:00.000Z", decimalOdds: 4.0 }
];

test("validates pre-kickoff 1X2 completeness and reports bookmaker/source labels without claiming independence", () => {
  const report = assessWinFootballOddsQuality({ fixtures, snapshots, expectedMarkets });
  assert.equal(report.validPreKickoffSnapshotCount, 3);
  assert.equal(report.incompleteMarketGroupCount, 0);
  assert.equal(report.overroundOutOfBounds.length, 0);
  assert.deepEqual(report.bookmakerIds, ["book-a"]);
  assert.deepEqual(report.sourceIds, ["feed-a"]);
  assert.equal(report.bookmakerIndependenceVerified, false);
  assert.equal(report.trainingApprovalGranted, false);
});

test("flags incomplete outcomes, duplicate IDs, stale and post-kickoff observations", () => {
  const report = assessWinFootballOddsQuality({
    fixtures, expectedMarkets, maxSnapshotAgeMinutes: 120,
    snapshots: [
      ...snapshots.slice(0, 2),
      { ...snapshots[2], snapshotId: "duplicate", capturedAt: "2026-11-10T17:30:00.000Z" },
      { ...snapshots[0], snapshotId: "other-book-home", bookmakerId: "book-b", sourceId: "feed-b" },
      { ...snapshots[2], snapshotId: "duplicate", capturedAt: "2026-11-10T17:35:00.000Z" },
      { ...snapshots[2], snapshotId: "stale", capturedAt: "2026-11-10T10:00:00.000Z" },
      { ...snapshots[2], snapshotId: "after", capturedAt: "2026-11-10T18:00:00.000Z" }
    ]
  });
  assert.equal(report.duplicateSnapshotCount, 1);
  assert.equal(report.staleSnapshotCount, 1);
  assert.equal(report.postKickoffSnapshotCount, 1);
  assert.equal(report.incompleteMarketGroupCount, 1);
});

test("flags implausible overround and suspicious moves without deleting observations", () => {
  const report = assessWinFootballOddsQuality({
    fixtures, expectedMarkets,
    snapshots: [
      ...snapshots,
      { ...snapshots[0], snapshotId: "h2", capturedAt: "2026-11-10T17:20:00.000Z", decimalOdds: 1.2 }
    ],
    suspiciousRelativeMoveThreshold: 0.2
  });
  assert.equal(report.suspiciousPriceMoves.length, 1);
  assert.ok(report.overroundOutOfBounds.length >= 1);
  assert.equal(report.validPreKickoffSnapshotCount, 4);
});

test("cadence gaps are evaluated only when an expected cadence is supplied", () => {
  const extended = [
    ...snapshots,
    { ...snapshots[0], snapshotId: "h2", capturedAt: "2026-11-10T16:40:00.000Z", decimalOdds: 2.05 }
  ];
  const withoutContract = assessWinFootballOddsQuality({ fixtures, expectedMarkets, snapshots: extended });
  const withContract = assessWinFootballOddsQuality({
    fixtures, expectedMarkets, snapshots: extended, expectedCadenceMinutes: 10
  });
  assert.equal(withoutContract.cadenceGaps.length, 0);
  assert.equal(withContract.cadenceGaps.length, 1);
});

test("rejects malformed prices, timestamps, identities and unknown outcomes", () => {
  const report = assessWinFootballOddsQuality({
    fixtures, expectedMarkets,
    snapshots: [
      { ...snapshots[0], snapshotId: "bad-price", decimalOdds: 1 },
      { ...snapshots[0], snapshotId: "bad-time", capturedAt: "2026-02-31T17:00:00.000Z" },
      { ...snapshots[0], snapshotId: "bad-outcome", outcomeId: "draw-no-bet" },
      { ...snapshots[0], snapshotId: "no-book", bookmakerId: "" }
    ]
  });
  assert.equal(report.invalidSnapshotCount, 4);
  assert.equal(report.validPreKickoffSnapshotCount, 0);
});

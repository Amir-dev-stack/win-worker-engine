import test from "node:test";
import assert from "node:assert/strict";
import { assessWinObservedFootballOddsQuality } from "../netlify/lib/ml-football-observed-odds-quality.mts";

const fixtures = [{ eventId: "fixture-1", kickoff: "2026-11-10T18:00:00.000Z" }];
const records = [
  { providerId: "feed-one", bookmakerId: "book-one", sportId: "football", eventId: "fixture-1", providerMarketName: "1X2", canonicalMarketId: "1x2", period: "full_event", selectionType: "home", selection: "Home", selectionName: "Home", oddsDecimal: 2, observedAt: "2026-11-10T17:00:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: false, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "row-home" },
  { providerId: "feed-one", bookmakerId: "book-one", sportId: "football", eventId: "fixture-1", providerMarketName: "1X2", canonicalMarketId: "1x2", period: "full_event", selectionType: "draw", selection: "Draw", selectionName: "Draw", oddsDecimal: 3.4, observedAt: "2026-11-10T17:00:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: false, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "row-draw" },
  { providerId: "feed-one", bookmakerId: "book-one", sportId: "football", eventId: "fixture-1", providerMarketName: "1X2", canonicalMarketId: "1x2", period: "full_event", selectionType: "away", selection: "Away", selectionName: "Away", oddsDecimal: 4, observedAt: "2026-11-10T17:00:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: false, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "row-away" },
  { providerId: "feed-one", bookmakerId: "book-one", sportId: "football", eventId: "fixture-1", providerMarketName: "1X2", canonicalMarketId: "1x2", period: "full_event", selectionType: "home", selection: "Home", selectionName: "Home", oddsDecimal: 1.9, observedAt: "2026-11-10T18:01:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: true, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "live-row" },
  { providerId: "feed-one", bookmakerId: "exchange-one", bookmakerType: "prediction_market", sportId: "football", eventId: "fixture-1", providerMarketName: "1X2", canonicalMarketId: "1x2", period: "full_event", selectionType: "home", selection: "Home", selectionName: "Home", oddsDecimal: 1.8, observedAt: "2026-11-10T17:00:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: false, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "prediction-row" },
  { providerId: "feed-one", bookmakerId: "book-one", sportId: "basketball", eventId: "other", providerMarketName: "moneyline", canonicalMarketId: "moneyline", period: "full_event", selectionType: "home", selection: "Home", selectionName: "Home", oddsDecimal: 1.7, observedAt: "2026-11-10T17:00:00.000Z", startsAt: "2026-11-10T18:00:00.000Z", live: false, eventTimeSemantics: "scheduled_event_start", sourceRecordId: "basketball-row" }
];
const expectedMarkets = [{ marketId: "1x2", outcomeIds: ["home::Home", "draw::Draw", "away::Away"], minOverround: 0.95, maxOverround: 1.2 }];

test("maps normalized observed football rows and enforces prediction-market exclusion", () => {
  const report = assessWinObservedFootballOddsQuality({ fixtures, records, expectedMarkets });
  assert.equal(report.inputRecordCount, 6);
  assert.equal(report.excludedNonFootballLiveOrNonScheduledCount, 3);
  assert.equal(report.validPreKickoffSnapshotCount, 3);
  assert.equal(report.incompleteMarketGroupCount, 0);
  assert.deepEqual(report.bookmakerIds, ["book-one"]);
  assert.deepEqual(report.sourceIds, ["feed-one"]);
  assert.equal(report.bookmakerIndependenceVerified, false);
});

test("preserves explicit market periods and requires exact expected outcome identifiers", () => {
  const report = assessWinObservedFootballOddsQuality({
    fixtures,
    records: records.slice(0, 3).map(row => ({ ...row, period: "first_half" })),
    expectedMarkets: [{ marketId: "1x2::first_half", outcomeIds: ["home::Home", "draw::Draw", "away::Away"] }]
  });
  assert.equal(report.validPreKickoffSnapshotCount, 3);
  assert.equal(report.incompleteMarketGroupCount, 0);
});


test("preserves open, suspended, closed and unknown bookmaker availability", () => {
  const statusRows = records.slice(0, 3).map((row, index) => ({
    ...row,
    availabilityStatus: ["open", "suspended", "closed"][index]
  }));
  statusRows.push({
    ...statusRows[0],
    sourceRecordId: "row-home-unknown",
    observedAt: "2026-11-10T16:59:00.000Z",
    availabilityStatus: "unknown"
  });
  const report = assessWinObservedFootballOddsQuality({ fixtures, records: statusRows, expectedMarkets });
  assert.equal(report.validPreKickoffSnapshotCount, 4);
  assert.deepEqual(report.availabilityStatusCounts, { open: 1, suspended: 1, closed: 1, unknown: 1 });
  assert.ok(report.reasons.includes("non_open_or_unknown_availability_snapshots_present"));
});

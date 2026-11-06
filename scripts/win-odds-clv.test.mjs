import test from "node:test";
import assert from "node:assert/strict";
import { calculateWinClosingLineValue, WinCLVError } from "../netlify/lib/win-odds-clv.mts";

const kickoffAt = "2026-11-10T18:00:00.000Z";
const predictionCutoff = "2026-11-10T17:00:00.000Z";
const decisionQuote = {
  quoteId: "decision-1", sourceId: "feed-a", sourceRecordId: "raw-decision-1",
  sourceRevision: "a".repeat(40), licenceId: "CC-BY-4.0", snapshotRole: "decision",
  eventId: "event-1", marketId: "1x2", selectionId: "home", period: "full_event",
  line: null, bookmakerId: "book-a", venueType: "sportsbook", priceType: "decimal_back",
  decimalOdds: 2.2, sourceObservedAt: "2026-11-10T16:59:00.000Z",
  ingestedAt: "2026-11-10T16:59:05.000Z", eventStartAt: kickoffAt,
  availabilityStatus: "open", live: false
};
const closingQuote = {
  ...decisionQuote, quoteId: "close-1", sourceRecordId: "raw-close-1", snapshotRole: "closing",
  decimalOdds: 2.0, sourceObservedAt: "2026-11-10T17:55:00.000Z",
  ingestedAt: "2026-11-10T17:55:05.000Z"
};

test("computes price CLV only for the exact same pre-match bookmaker selection", () => {
  const result = calculateWinClosingLineValue({
    decisionQuote, closingQuote, predictionCutoff, kickoffAt, evaluationMode: "live"
  });
  assert.equal(result.oddsRatioClv, 0.1);
  assert.ok(Math.abs(result.impliedProbabilityDelta - (0.5 - 1 / 2.2)) < 1e-12);
  assert.equal(result.evidenceOnly, true);
  assert.equal(result.profitabilityClaimed, false);
});

test("rejects a decision quote observed or ingested after the prediction cutoff", () => {
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote: { ...decisionQuote, ingestedAt: "2026-11-10T17:01:00.000Z" },
    closingQuote, predictionCutoff, kickoffAt, evaluationMode: "retrospective"
  }), e => e instanceof WinCLVError && e.code === "clv_decision_quote_not_available_at_cutoff");
});

test("rejects mismatched bookmaker, source, market, selection or line", () => {
  for (const patch of [
    { bookmakerId: "book-b" }, { sourceId: "feed-b" }, { marketId: "totals" },
    { selectionId: "draw" }, { line: 2.5 }
  ]) {
    assert.throws(() => calculateWinClosingLineValue({
      decisionQuote, closingQuote: { ...closingQuote, ...patch },
      predictionCutoff, kickoffAt, evaluationMode: "live"
    }), e => e instanceof WinCLVError && e.code === "clv_quote_identity_mismatch");
  }
});

test("requires the source to identify the official decision and closing snapshots", () => {
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote: { ...decisionQuote, snapshotRole: "closing" }, closingQuote,
    predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_snapshot_role_invalid");
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote, closingQuote: { ...closingQuote, snapshotRole: "decision" },
    predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_snapshot_role_invalid");
});

test("rejects closing prices that are not strictly after the decision cutoff", () => {
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote, closingQuote: { ...closingQuote, sourceObservedAt: predictionCutoff },
    predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_closing_quote_not_after_decision");
});

test("rejects suspended, closed, unknown, live and post-kickoff observations", () => {
  for (const patch of [
    { availabilityStatus: "suspended" }, { availabilityStatus: "closed" },
    { availabilityStatus: "unknown" }, { live: true },
    { sourceObservedAt: kickoffAt }
  ]) {
    assert.throws(() => calculateWinClosingLineValue({
      decisionQuote, closingQuote: { ...closingQuote, ...patch },
      predictionCutoff, kickoffAt, evaluationMode: "retrospective"
    }));
  }
});

test("retrospective backfills can use source-timestamped close quotes without pretending they were ingested live", () => {
  const result = calculateWinClosingLineValue({
    decisionQuote, closingQuote: { ...closingQuote, ingestedAt: "2026-11-11T09:00:00.000Z" },
    predictionCutoff, kickoffAt, evaluationMode: "retrospective"
  });
  assert.equal(result.evaluationMode, "retrospective");
  assert.equal(result.oddsRatioClv, 0.1);
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote, closingQuote: { ...closingQuote, ingestedAt: "2026-11-11T09:00:00.000Z" },
    predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_live_close_ingested_after_kickoff");
});

test("rejects prediction-market prices and fair-probability inputs", () => {
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote: { ...decisionQuote, venueType: "prediction_market" },
    closingQuote, predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_quote_invalid");
  assert.throws(() => calculateWinClosingLineValue({
    decisionQuote: { ...decisionQuote, priceType: "fair_probability" },
    closingQuote, predictionCutoff, kickoffAt, evaluationMode: "live"
  }), e => e instanceof WinCLVError && e.code === "clv_quote_invalid");
});

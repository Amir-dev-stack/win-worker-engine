import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWinOddsQuote, WinOddsQuoteNormalizationError } from "../netlify/lib/win-odds-quote-normalizer.mts";

const base = {
  sourceId: "licensed-feed-a", sourceRecordId: "record-17",
  sourceRevision: "a".repeat(40), licenceId: "licence-reviewed-by-owner",
  snapshotRole: "decision", eventId: "event-1", marketId: "1x2",
  selectionId: "home", period: "full_event", line: null, bookmakerId: "book-a",
  venueType: "sportsbook", priceType: "decimal_back", decimalOdds: 2.1,
  sourceObservedAt: "2026-11-10T16:59:00.000Z",
  ingestedAt: "2026-11-10T16:59:05.000Z",
  eventStartAt: "2026-11-10T18:00:00.000Z", availabilityStatus: "open", live: false
};

test("normalizes a fully attributed source quote and derives a stable immutable identity", () => {
  const a = normalizeWinOddsQuote(base);
  const b = normalizeWinOddsQuote(base);
  assert.match(a.quoteId, /^winq_[a-f0-9]{64}$/);
  assert.equal(a.quoteId, b.quoteId);
  assert.equal(a.sourceRevision, base.sourceRevision);
  assert.equal(a.snapshotRole, "decision");
});

test("does not infer missing source, licence, revision or snapshot role", () => {
  for (const patch of [
    { sourceId: "" }, { licenceId: "" }, { sourceRevision: "unknown" },
    { snapshotRole: undefined }
  ]) {
    assert.throws(() => normalizeWinOddsQuote({ ...base, ...patch }),
      e => e instanceof WinOddsQuoteNormalizationError);
  }
});

test("rejects non-executable prices, unknown availability and live/post-kickoff observations", () => {
  for (const patch of [
    { priceType: "fair_probability" }, { venueType: "prediction_market" },
    { availabilityStatus: "unknown" }, { live: true },
    { sourceObservedAt: "2026-11-10T18:00:00.000Z" },
    { decimalOdds: 1 }, { decimalOdds: Infinity }
  ]) {
    assert.throws(() => normalizeWinOddsQuote({ ...base, ...patch }),
      e => e instanceof WinOddsQuoteNormalizationError);
  }
});

test("rejects malformed timestamps and ingestion earlier than source observation", () => {
  assert.throws(() => normalizeWinOddsQuote({ ...base, sourceObservedAt: "2026-02-31T10:00:00.000Z" }),
    e => e.code === "quote_timestamp_invalid");
  assert.throws(() => normalizeWinOddsQuote({ ...base, ingestedAt: "2026-11-10T16:58:00.000Z" }),
    e => e.code === "ingestion_precedes_source_observation");
});

test("a source record revision or price change produces a different quote identity", () => {
  assert.notEqual(normalizeWinOddsQuote(base).quoteId,
    normalizeWinOddsQuote({ ...base, sourceRevision: "b".repeat(40) }).quoteId);
  assert.notEqual(normalizeWinOddsQuote(base).quoteId,
    normalizeWinOddsQuote({ ...base, decimalOdds: 2.2 }).quoteId);
});

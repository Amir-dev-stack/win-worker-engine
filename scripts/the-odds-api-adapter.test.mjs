import test from "node:test";
import assert from "node:assert/strict";
import { parseOddsApiV4EventOdds, OddsApiAdapterError } from "../netlify/lib/the-odds-api-adapter.mts";

const ingestedAt = "2026-11-07T12:05:00.000Z";
const sample = () => [{
  id: "event-1", sport_key: "soccer_epl",
  commence_time: "2026-11-07T18:00:00.000Z",
  home_team: "Home FC", away_team: "Away FC",
  bookmakers: [{
    key: "book-a", title: "Book A", last_update: "2026-11-07T12:00:00.000Z",
    markets: [{
      key: "h2h", last_update: "2026-11-07T12:01:00.000Z",
      outcomes: [{ name: "Home FC", price: 2.1 }, { name: "Away FC", price: 3.4 }]
    }]
  }]
}];

test("parses event, bookmaker, market, selection, price and source timestamp", () => {
  const rows = parseOddsApiV4EventOdds(sample(), ingestedAt);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eventId, "event-1");
  assert.equal(rows[0].bookmakerId, "book-a");
  assert.equal(rows[0].marketId, "h2h");
  assert.equal(rows[0].selectionName, "Home FC");
  assert.equal(rows[0].decimalOdds, 2.1);
  assert.equal(rows[0].sourceObservedAt, "2026-11-07T12:01:00.000Z");
});

test("uses bookmaker timestamp only when market timestamp is absent", () => {
  const payload = sample();
  delete payload[0].bookmakers[0].markets[0].last_update;
  assert.equal(parseOddsApiV4EventOdds(payload, ingestedAt)[0].sourceObservedAt,
    "2026-11-07T12:00:00.000Z");
});

test("fails closed when both source timestamps are absent or malformed", () => {
  const payload = sample();
  payload[0].bookmakers[0].markets[0].last_update = "not-a-date";
  payload[0].bookmakers[0].last_update = "also-not-a-date";
  assert.throws(() => parseOddsApiV4EventOdds(payload, ingestedAt),
    (e) => e instanceof OddsApiAdapterError && e.code === "odds_api_source_timestamp_missing_or_invalid");
});

test("never invents an open status or executable WIN quote", () => {
  const rows = parseOddsApiV4EventOdds(sample(), ingestedAt);
  assert.equal(rows[0].availabilityStatus, "unknown");
  assert.equal(rows[0].quoteEligible, false);
  assert.equal(rows[0].ineligibilityReason, "provider_does_not_expose_open_status");
});

test("rejects malformed prices, invalid lines, stale post-kickoff data and future ingestion clocks", () => {
  const badPrice = sample(); badPrice[0].bookmakers[0].markets[0].outcomes[0].price = 1;
  assert.throws(() => parseOddsApiV4EventOdds(badPrice, ingestedAt), /odds_api_outcome_invalid/);
  const badLine = sample(); badLine[0].bookmakers[0].markets[0].outcomes[0].point = "2.5";
  assert.throws(() => parseOddsApiV4EventOdds(badLine, ingestedAt), /odds_api_line_invalid/);
  const late = sample(); late[0].bookmakers[0].markets[0].last_update = "2026-11-07T18:00:00.000Z";
  assert.throws(() => parseOddsApiV4EventOdds(late, "2026-11-07T18:01:00.000Z"), /odds_api_observation_not_pre_match/);
  assert.throws(() => parseOddsApiV4EventOdds(sample(), "2026-11-07T11:00:00.000Z"),
    /odds_api_ingestion_precedes_source_timestamp/);
});

test("canonical source fingerprint is stable and changes with price", () => {
  const first = parseOddsApiV4EventOdds(sample(), ingestedAt)[0];
  const second = parseOddsApiV4EventOdds(sample(), ingestedAt)[0];
  assert.equal(first.sourceRevision, second.sourceRevision);
  const changed = sample(); changed[0].bookmakers[0].markets[0].outcomes[0].price = 2.2;
  assert.notEqual(first.sourceRevision, parseOddsApiV4EventOdds(changed, ingestedAt)[0].sourceRevision);
  assert.match(first.sourceRevision, /^[a-f0-9]{40}$/);
});

import { createHash } from "node:crypto";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

/**
 * Offline parser for The Odds API v4 event-odds response.
 *
 * This intentionally produces observations, not executable WIN quotes:
 * The public response shape does not provide a dependable per-outcome
 * suspended/open status. availabilityStatus therefore remains "unknown"
 * and no observation is passed to normalizeWinOddsQuote().
 */
export type OddsApiObservationV1 = {
  providerId: "the-odds-api";
  sourceRecordId: string;
  sourceRevision: string;
  eventId: string;
  sportKey: string;
  eventStartAt: string;
  homeTeam: string;
  awayTeam: string;
  bookmakerId: string;
  bookmakerTitle: string;
  marketId: string;
  selectionId: string;
  selectionName: string;
  selectionDescription: string | null;
  line: number | null;
  decimalOdds: number;
  sourceObservedAt: string;
  ingestedAt: string;
  availabilityStatus: "unknown";
  live: false;
  rawObservation: unknown;
  quoteEligible: false;
  ineligibilityReason: "provider_does_not_expose_open_status";
};

export class OddsApiAdapterError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "OddsApiAdapterError";
    this.code = code;
  }
}

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const iso = (v: unknown): v is string =>
  typeof v === "string" && isStrictIsoTimestamp(v);

function stableRevision(value: unknown): string {
  // A canonical payload fingerprint, NOT a provider-issued revision identifier.
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

function stableId(parts: unknown[]): string {
  return "oddsapi_" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function parseOddsApiV4EventOdds(
  payload: unknown,
  ingestedAt: string
): OddsApiObservationV1[] {
  if (!iso(ingestedAt)) throw new OddsApiAdapterError("ingestion_timestamp_invalid");
  if (!Array.isArray(payload)) throw new OddsApiAdapterError("odds_api_payload_must_be_event_array");

  const output: OddsApiObservationV1[] = [];
  for (const event of payload as any[]) {
    if (!event || typeof event !== "object" ||
        !nonEmpty(event.id) || !nonEmpty(event.sport_key) ||
        !iso(event.commence_time) || !nonEmpty(event.home_team) ||
        !nonEmpty(event.away_team) || !Array.isArray(event.bookmakers)) {
      throw new OddsApiAdapterError("odds_api_event_identity_or_schedule_invalid");
    }

    for (const bookmaker of event.bookmakers) {
      if (!bookmaker || !nonEmpty(bookmaker.key) || !nonEmpty(bookmaker.title) ||
          !Array.isArray(bookmaker.markets)) {
        throw new OddsApiAdapterError("odds_api_bookmaker_invalid");
      }
      for (const market of bookmaker.markets) {
        if (!market || !nonEmpty(market.key) || !Array.isArray(market.outcomes)) {
          throw new OddsApiAdapterError("odds_api_market_invalid");
        }
        const observedAt = iso(market.last_update) ? market.last_update :
          iso(bookmaker.last_update) ? bookmaker.last_update : null;
        if (!observedAt) throw new OddsApiAdapterError("odds_api_source_timestamp_missing_or_invalid");
        if (Date.parse(ingestedAt) < Date.parse(observedAt)) {
          throw new OddsApiAdapterError("odds_api_ingestion_precedes_source_timestamp");
        }
        if (Date.parse(observedAt) >= Date.parse(event.commence_time)) {
          throw new OddsApiAdapterError("odds_api_observation_not_pre_match");
        }

        for (const outcome of market.outcomes) {
          if (!outcome || !nonEmpty(outcome.name) ||
              typeof outcome.price !== "number" || !Number.isFinite(outcome.price) ||
              outcome.price <= 1 || outcome.price > 1000) {
            throw new OddsApiAdapterError("odds_api_outcome_invalid");
          }
          if (outcome.point !== undefined && outcome.point !== null &&
              (typeof outcome.point !== "number" || !Number.isFinite(outcome.point))) {
            throw new OddsApiAdapterError("odds_api_line_invalid");
          }
          const rawObservation = { event, bookmaker, market, outcome };
          const sourceRecordId = [
            event.id, bookmaker.key, market.key, outcome.name,
            outcome.description ?? "", outcome.point ?? ""
          ].join(":");
          output.push({
            providerId: "the-odds-api",
            sourceRecordId,
            sourceRevision: stableRevision(rawObservation),
            eventId: String(event.id),
            sportKey: String(event.sport_key),
            eventStartAt: event.commence_time,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            bookmakerId: bookmaker.key,
            bookmakerTitle: bookmaker.title,
            marketId: market.key,
            selectionId: stableId([event.id, market.key, outcome.name, outcome.description ?? null, outcome.point ?? null]),
            selectionName: outcome.name,
            selectionDescription: nonEmpty(outcome.description) ? outcome.description : null,
            line: typeof outcome.point === "number" ? outcome.point : null,
            decimalOdds: outcome.price,
            sourceObservedAt: observedAt,
            ingestedAt,
            availabilityStatus: "unknown",
            live: false,
            rawObservation,
            quoteEligible: false,
            ineligibilityReason: "provider_does_not_expose_open_status"
          });
        }
      }
    }
  }
  return output;
}

import { createHash } from "node:crypto";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";
import type { WinCLVQuote } from "./win-odds-clv.mts";

/**
 * Converts a source-declared bookmaker observation into WIN's immutable quote
 * contract. This is deliberately a normalizer, not a provider connector:
 * callers must supply provenance, licence, timestamps and source-declared role.
 */
export type WinOddsQuoteInputV1 = Omit<WinCLVQuote, "quoteId"> & {
  quoteId?: string;
};

export class WinOddsQuoteNormalizationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "WinOddsQuoteNormalizationError";
    this.code = code;
  }
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function stableQuoteId(input: WinOddsQuoteInputV1): string {
  const identity = [
    input.sourceId, input.sourceRecordId, input.sourceRevision, input.licenceId,
    input.snapshotRole, input.eventId, input.marketId, input.selectionId,
    input.period, input.line ?? null, input.bookmakerId, input.venueType,
    input.priceType, input.decimalOdds, input.sourceObservedAt, input.eventStartAt
  ];
  return "winq_" + createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function normalizeWinOddsQuote(input: WinOddsQuoteInputV1): WinCLVQuote {
  if (!input || typeof input !== "object") throw new WinOddsQuoteNormalizationError("quote_input_invalid");
  const required = [
    "sourceId", "sourceRecordId", "sourceRevision", "licenceId", "eventId",
    "marketId", "selectionId", "period", "bookmakerId"
  ] as const;
  if (!required.every(key => nonEmpty(input[key]))) {
    throw new WinOddsQuoteNormalizationError("quote_provenance_incomplete");
  }
  if (!/^[a-f0-9]{40}$/i.test(input.sourceRevision)) {
    throw new WinOddsQuoteNormalizationError("source_revision_invalid");
  }
  if (!["decision", "closing"].includes(input.snapshotRole)) {
    throw new WinOddsQuoteNormalizationError("snapshot_role_must_be_source_declared");
  }
  if (!["sportsbook", "exchange"].includes(input.venueType) || input.priceType !== "decimal_back") {
    throw new WinOddsQuoteNormalizationError("executable_back_price_required");
  }
  if (typeof input.decimalOdds !== "number" || !Number.isFinite(input.decimalOdds) ||
      input.decimalOdds <= 1 || input.decimalOdds > 1000) {
    throw new WinOddsQuoteNormalizationError("decimal_odds_invalid");
  }
  if (!isStrictIsoTimestamp(input.sourceObservedAt) ||
      !isStrictIsoTimestamp(input.ingestedAt) ||
      !isStrictIsoTimestamp(input.eventStartAt)) {
    throw new WinOddsQuoteNormalizationError("quote_timestamp_invalid");
  }
  if (Date.parse(input.ingestedAt) < Date.parse(input.sourceObservedAt)) {
    throw new WinOddsQuoteNormalizationError("ingestion_precedes_source_observation");
  }
  if (Date.parse(input.sourceObservedAt) >= Date.parse(input.eventStartAt) || input.live !== false) {
    throw new WinOddsQuoteNormalizationError("prematch_observation_required");
  }
  if (input.availabilityStatus !== "open") {
    throw new WinOddsQuoteNormalizationError("quote_must_be_open");
  }
  if (input.line !== null && input.line !== undefined &&
      !((typeof input.line === "string" && input.line.trim().length > 0) ||
        (typeof input.line === "number" && Number.isFinite(input.line)))) {
    throw new WinOddsQuoteNormalizationError("market_line_invalid");
  }
  const quoteId = nonEmpty(input.quoteId) ? input.quoteId : stableQuoteId(input);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(quoteId)) {
    throw new WinOddsQuoteNormalizationError("quote_id_invalid");
  }
  return { ...input, quoteId };
}

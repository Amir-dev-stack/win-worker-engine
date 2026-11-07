import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

/**
 * Price-level CLV contract. Decision and closing quotes must refer to the exact
 * same event, market, selection, line, period, bookmaker and source.
 * Decimal back odds are compared only; fair probabilities are not CLV prices.
 */
export type WinCLVQuote = {
  quoteId: string;
  sourceId: string;
  sourceRecordId: string;
  sourceRevision: string;
  licenceId: string;
  snapshotRole: "decision" | "closing";
  eventId: string;
  marketId: string;
  selectionId: string;
  period: string;
  line: string | number | null;
  bookmakerId: string;
  venueType: "sportsbook" | "exchange" | "prediction_market" | "unknown";
  priceType: "decimal_back";
  decimalOdds: number;
  sourceObservedAt: string;
  ingestedAt: string;
  eventStartAt: string;
  availabilityStatus: "open" | "suspended" | "closed" | "unknown";
  live: boolean;
};

export type WinCLVResult = {
  version: "win.odds.clv.v1";
  eventId: string;
  marketId: string;
  selectionId: string;
  bookmakerId: string;
  sourceId: string;
  predictionCutoff: string;
  kickoffAt: string;
  decisionQuoteId: string;
  closingQuoteId: string;
  decisionOdds: number;
  closingOdds: number;
  oddsRatioClv: number;
  impliedProbabilityDelta: number;
  decisionQuoteObservedAt: string;
  closingQuoteObservedAt: string;
  evaluationMode: "live" | "retrospective";
  evidenceOnly: true;
  profitabilityClaimed: false;
};

export class WinCLVError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "WinCLVError"; this.code = code; }
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

function validateQuote(quote: WinCLVQuote, kickoffAt: string) {
  if (!quote || !["quoteId","sourceId","sourceRecordId","sourceRevision","licenceId","eventId","marketId","selectionId","period","bookmakerId"].every(key => nonEmpty((quote as any)[key])) ||
      !["sportsbook","exchange"].includes(quote.venueType) ||
      !/^[a-f0-9]{40}$/i.test(quote.sourceRevision) ||
      !["decision","closing"].includes(quote.snapshotRole) ||
      quote.priceType !== "decimal_back" ||
      typeof quote.decimalOdds !== "number" || !Number.isFinite(quote.decimalOdds) ||
      quote.decimalOdds <= 1 || quote.decimalOdds > 1000 ||
      !isStrictIsoTimestamp(quote.sourceObservedAt) ||
      !isStrictIsoTimestamp(quote.ingestedAt) ||
      !isStrictIsoTimestamp(quote.eventStartAt) ||
      Date.parse(quote.eventStartAt) !== Date.parse(kickoffAt) ||
      !["open","suspended","closed","unknown"].includes(quote.availabilityStatus) ||
      quote.live !== false) {
    throw new WinCLVError("clv_quote_invalid");
  }
  if (Date.parse(quote.ingestedAt) < Date.parse(quote.sourceObservedAt)) throw new WinCLVError("clv_ingestion_precedes_source_observation");
  if (quote.availabilityStatus !== "open") throw new WinCLVError("clv_quote_not_open");
  if (Date.parse(quote.sourceObservedAt) >= Date.parse(kickoffAt)) {
    throw new WinCLVError("clv_quote_not_pre_kickoff");
  }
}

function identity(quote: WinCLVQuote) {
  return JSON.stringify([
    quote.sourceId, quote.eventId, quote.marketId, quote.selectionId,
    quote.period, quote.line ?? null, quote.bookmakerId, quote.venueType, quote.priceType,
    quote.sourceRevision, quote.licenceId
  ]);
}

/**
 * Computes retrospective or live CLV from two source-timestamped decimal prices.
 * Positive oddsRatioClv means the decision price was better than the close.
 * Positive impliedProbabilityDelta means the close implies a higher chance
 * than the probability paid for at decision time.
 */
export function calculateWinClosingLineValue(args: {
  decisionQuote: WinCLVQuote;
  closingQuote: WinCLVQuote;
  predictionCutoff: string;
  kickoffAt: string;
  evaluationMode: "live" | "retrospective";
}): WinCLVResult {
  const { decisionQuote, closingQuote, predictionCutoff, kickoffAt, evaluationMode } = args || ({} as any);
  if (!isStrictIsoTimestamp(predictionCutoff) || !isStrictIsoTimestamp(kickoffAt) ||
      !["live","retrospective"].includes(evaluationMode) ||
      Date.parse(predictionCutoff) >= Date.parse(kickoffAt)) {
    throw new WinCLVError("clv_evaluation_clock_invalid");
  }
  validateQuote(decisionQuote, kickoffAt);
  validateQuote(closingQuote, kickoffAt);
  if (decisionQuote.snapshotRole !== "decision" || closingQuote.snapshotRole !== "closing") {
    throw new WinCLVError("clv_snapshot_role_invalid");
  }
  if (identity(decisionQuote) !== identity(closingQuote)) {
    throw new WinCLVError("clv_quote_identity_mismatch");
  }
  if (Date.parse(decisionQuote.sourceObservedAt) > Date.parse(predictionCutoff) ||
      Date.parse(decisionQuote.ingestedAt) > Date.parse(predictionCutoff)) {
    throw new WinCLVError("clv_decision_quote_not_available_at_cutoff");
  }
  if (Date.parse(closingQuote.sourceObservedAt) <= Date.parse(predictionCutoff) ||
      Date.parse(closingQuote.sourceObservedAt) <= Date.parse(decisionQuote.sourceObservedAt)) {
    throw new WinCLVError("clv_closing_quote_not_after_decision");
  }
  if (evaluationMode === "live" && Date.parse(closingQuote.ingestedAt) > Date.parse(kickoffAt)) {
    throw new WinCLVError("clv_live_close_ingested_after_kickoff");
  }
  const oddsRatioClv = decisionQuote.decimalOdds / closingQuote.decimalOdds - 1;
  const impliedProbabilityDelta = 1 / closingQuote.decimalOdds - 1 / decisionQuote.decimalOdds;
  if (!Number.isFinite(oddsRatioClv) || !Number.isFinite(impliedProbabilityDelta)) {
    throw new WinCLVError("clv_calculation_non_finite");
  }
  return {
    version: "win.odds.clv.v1",
    eventId: decisionQuote.eventId,
    marketId: decisionQuote.marketId,
    selectionId: decisionQuote.selectionId,
    bookmakerId: decisionQuote.bookmakerId,
    sourceId: decisionQuote.sourceId,
    predictionCutoff,
    kickoffAt,
    decisionQuoteId: decisionQuote.quoteId,
    closingQuoteId: closingQuote.quoteId,
    decisionOdds: decisionQuote.decimalOdds,
    closingOdds: closingQuote.decimalOdds,
    oddsRatioClv,
    impliedProbabilityDelta,
    decisionQuoteObservedAt: decisionQuote.sourceObservedAt,
    closingQuoteObservedAt: closingQuote.sourceObservedAt,
    evaluationMode,
    evidenceOnly: true,
    profitabilityClaimed: false
  };
}

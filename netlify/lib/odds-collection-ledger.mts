import { createHash } from "node:crypto";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export type OddsCollectionOutcomeV1 = "success" | "empty" | "rate_limited" | "provider_error" | "quota_exhausted" | "not_attempted";
export type OddsCollectionAttemptV1 = {
  version: "win.odds-collection-attempt.v1";
  attemptId: string; providerId: string; licenceId: string;
  requestFamily: { sport: string; markets: string[]; regions: string[] };
  plannedAt: string; requestedAt: string | null; ingestedAt: string;
  outcome: OddsCollectionOutcomeV1;
  usage: { totalUsed: number | null; remaining: number | null; lastRequest: number | null; estimatedCredits: number; actualCredits: number | null; estimateVariance: number | null; reconciliation: "matched" | "under_estimate" | "over_estimate" | "unknown" };
  response: { correlationId: string; responseSha256: string | null; returnedRecords: number; oldestSourceObservedAt: string | null; newestSourceObservedAt: string | null };
  control: { stopFurtherCollection: boolean; stopReason: string | null; requiresOwnerReview: boolean };
  secretsPersisted: false; immutable: true;
};
export class OddsCollectionLedgerError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "OddsCollectionLedgerError"; this.code = code; }
}
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const timestamp = (v: unknown): v is string => typeof v === "string" && isStrictIsoTimestamp(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const sha256 = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
function readHeader(headers: Record<string, unknown>, name: string): number | null {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  if (key === undefined) return null;
  const raw = headers[key];
  if (typeof raw !== "string" && typeof raw !== "number") throw new OddsCollectionLedgerError("provider_usage_header_invalid");
  const parsed = typeof raw === "number" ? raw : (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new OddsCollectionLedgerError("provider_usage_header_invalid");
  return parsed;
}
export function buildOddsCollectionAttempt(input: {
  providerId: string; licenceId: string;
  requestFamily: { sport: string; markets: string[]; regions: string[] };
  plannedAt: string; requestedAt: string | null; ingestedAt: string;
  outcome: OddsCollectionOutcomeV1; headers?: Record<string, unknown>;
  estimatedCredits: number; correlationId: string; responseSha256?: string | null;
  returnedRecords: number; oldestSourceObservedAt?: string | null;
  newestSourceObservedAt?: string | null; reserveCredits: number;
}): OddsCollectionAttemptV1 {
  if (!input || !nonEmpty(input.providerId) || !nonEmpty(input.licenceId) ||
      !input.requestFamily || !nonEmpty(input.requestFamily.sport) ||
      !Array.isArray(input.requestFamily.markets) || input.requestFamily.markets.length === 0 ||
      !input.requestFamily.markets.every(nonEmpty) ||
      !Array.isArray(input.requestFamily.regions) || input.requestFamily.regions.length === 0 ||
      !input.requestFamily.regions.every(nonEmpty) ||
      !timestamp(input.plannedAt) || !timestamp(input.ingestedAt) ||
      (input.requestedAt !== null && !timestamp(input.requestedAt)) ||
      (input.requestedAt !== null && Date.parse(input.requestedAt) < Date.parse(input.plannedAt)) ||
      Date.parse(input.ingestedAt) < Date.parse(input.requestedAt ?? input.plannedAt) ||
      !["success", "empty", "rate_limited", "provider_error", "quota_exhausted", "not_attempted"].includes(input.outcome) ||
      !count(input.estimatedCredits) || !count(input.returnedRecords) || !count(input.reserveCredits) ||
      !nonEmpty(input.correlationId) || (input.responseSha256 != null && !sha256(input.responseSha256)) ||
      (input.oldestSourceObservedAt != null && !timestamp(input.oldestSourceObservedAt)) ||
      (input.newestSourceObservedAt != null && !timestamp(input.newestSourceObservedAt))) {
    throw new OddsCollectionLedgerError("collection_attempt_input_invalid");
  }
  if (input.oldestSourceObservedAt && input.newestSourceObservedAt && Date.parse(input.oldestSourceObservedAt) > Date.parse(input.newestSourceObservedAt))
    throw new OddsCollectionLedgerError("source_timestamp_range_invalid");
  if (input.outcome === "not_attempted" && input.requestedAt !== null) throw new OddsCollectionLedgerError("not_attempted_cannot_have_request_timestamp");
  if (input.outcome !== "not_attempted" && input.requestedAt === null) throw new OddsCollectionLedgerError("attempted_outcome_requires_request_timestamp");
  if (input.outcome === "empty" && input.returnedRecords !== 0) throw new OddsCollectionLedgerError("empty_outcome_has_records");
  if (input.outcome === "success" && input.returnedRecords === 0) throw new OddsCollectionLedgerError("success_outcome_requires_records");
  const headers = input.headers ?? {};
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) throw new OddsCollectionLedgerError("provider_usage_headers_invalid");
  if (input.newestSourceObservedAt && Date.parse(input.newestSourceObservedAt) > Date.parse(input.ingestedAt)) throw new OddsCollectionLedgerError("source_timestamp_after_ingestion");
  const totalUsed = readHeader(headers, "x-requests-used");
  const remaining = readHeader(headers, "x-requests-remaining");
  const lastRequest = readHeader(headers, "x-requests-last");
  const actualCredits = lastRequest;
  const estimateVariance = actualCredits === null ? null : actualCredits - input.estimatedCredits;
  const reconciliation = actualCredits === null ? "unknown" : actualCredits === input.estimatedCredits ? "matched" : actualCredits < input.estimatedCredits ? "under_estimate" : "over_estimate";
  let stopReason: string | null = null;
  if (input.outcome === "rate_limited") stopReason = "provider_rate_limited";
  else if (input.outcome === "quota_exhausted") stopReason = "provider_quota_exhausted";
  else if (input.outcome === "provider_error") stopReason = "provider_error_requires_review";
  else if (input.outcome === "not_attempted") stopReason = "attempt_not_executed";
  else if (remaining === null || lastRequest === null || totalUsed === null) stopReason = "provider_usage_headers_incomplete";
  else if (remaining < input.reserveCredits) stopReason = "provider_quota_below_protected_reserve";
  else if (actualCredits > input.estimatedCredits) stopReason = "actual_usage_exceeded_estimate";
  const attemptId = "winca_" + createHash("sha256").update([input.providerId, input.licenceId, input.correlationId].join("|")).digest("hex");
  const requiresOwnerReview = stopReason !== null || reconciliation === "unknown" || reconciliation === "over_estimate";
  return {
    version: "win.odds-collection-attempt.v1", attemptId, providerId: input.providerId, licenceId: input.licenceId,
    requestFamily: { sport: input.requestFamily.sport, markets: [...input.requestFamily.markets], regions: [...input.requestFamily.regions] },
    plannedAt: input.plannedAt, requestedAt: input.requestedAt, ingestedAt: input.ingestedAt, outcome: input.outcome,
    usage: { totalUsed, remaining, lastRequest, estimatedCredits: input.estimatedCredits, actualCredits, estimateVariance, reconciliation },
    response: { correlationId: input.correlationId, responseSha256: input.responseSha256 ?? null, returnedRecords: input.returnedRecords,
      oldestSourceObservedAt: input.oldestSourceObservedAt ?? null, newestSourceObservedAt: input.newestSourceObservedAt ?? null },
    control: { stopFurtherCollection: stopReason !== null, stopReason, requiresOwnerReview },
    secretsPersisted: false, immutable: true
  };
}

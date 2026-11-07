import test from "node:test";
import assert from "node:assert/strict";
import { buildOddsCollectionAttempt, OddsCollectionLedgerError } from "../netlify/lib/odds-collection-ledger.mts";
const base = () => ({
  providerId:"the-odds-api", licenceId:"terms-review-pending",
  requestFamily:{sport:"football",markets:["h2h"],regions:["eu"]},
  plannedAt:"2026-11-07T10:00:00.000Z", requestedAt:"2026-11-07T10:00:01.000Z", ingestedAt:"2026-11-07T10:00:02.000Z",
  outcome:"success", headers:{"x-requests-used":"121","x-requests-remaining":"379","x-requests-last":"1"},
  estimatedCredits:1, correlationId:"poll-0001", responseSha256:"a".repeat(64), returnedRecords:4,
  oldestSourceObservedAt:"2026-11-07T09:59:00.000Z", newestSourceObservedAt:"2026-11-07T10:00:00.000Z", reserveCredits:50
});
test("records actual usage and keeps a healthy poll eligible to continue", () => {
  const row=buildOddsCollectionAttempt(base());
  assert.equal(row.usage.totalUsed,121); assert.equal(row.usage.remaining,379); assert.equal(row.usage.actualCredits,1);
  assert.equal(row.usage.reconciliation,"matched"); assert.equal(row.control.stopFurtherCollection,false);
  assert.equal(row.secretsPersisted,false); assert.equal(row.immutable,true);
});
test("stops at or below the protected reserve", () => {
  for (const remaining of ["50","49"]) {
    const input=base(); input.headers["x-requests-remaining"]=remaining;
    assert.equal(buildOddsCollectionAttempt(input).control.stopReason,"provider_quota_below_protected_reserve");
  }
});
test("stops when actual usage exceeds estimate", () => {
  const input=base(); input.headers["x-requests-last"]="3";
  const row=buildOddsCollectionAttempt(input); assert.equal(row.usage.reconciliation,"over_estimate");
  assert.equal(row.control.stopReason,"actual_usage_exceeded_estimate");
});
test("missing usage headers are unknown, never zero", () => {
  const input=base(); delete input.headers["x-requests-last"];
  const row=buildOddsCollectionAttempt(input); assert.equal(row.usage.actualCredits,null);
  assert.equal(row.control.stopReason,"provider_usage_headers_incomplete");
});
test("rate limit, provider error and quota exhaustion stop collection", () => {
  for (const [outcome,reason] of [["rate_limited","provider_rate_limited"],["provider_error","provider_error_requires_review"],["quota_exhausted","provider_quota_exhausted"]]) {
    assert.equal(buildOddsCollectionAttempt({...base(),outcome}).control.stopReason,reason);
  }
});
test("not-attempted rows do not claim a request occurred", () => {
  const row=buildOddsCollectionAttempt({...base(),outcome:"not_attempted",requestedAt:null,returnedRecords:0,headers:{}});
  assert.equal(row.requestedAt,null); assert.equal(row.usage.actualCredits,null); assert.equal(row.control.stopFurtherCollection,true);
});
test("attempt identity is stable for an idempotency key and changes for a new poll", () => {
  const first=buildOddsCollectionAttempt(base()); assert.equal(first.attemptId,buildOddsCollectionAttempt(base()).attemptId);
  const changed=base(); changed.correlationId="poll-0002";
  assert.notEqual(first.attemptId,buildOddsCollectionAttempt(changed).attemptId);
});
test("rejects malformed headers, invalid dates, contradictory outcomes and bad hashes", () => {
  const h=base(); h.headers["x-requests-last"]="1.5";
  assert.throws(()=>buildOddsCollectionAttempt(h),e=>e instanceof OddsCollectionLedgerError);
  const d=base(); d.ingestedAt="2026-02-31T10:00:02.000Z";
  assert.throws(()=>buildOddsCollectionAttempt(d),e=>e instanceof OddsCollectionLedgerError);
  const o=base(); o.outcome="empty";
  assert.throws(()=>buildOddsCollectionAttempt(o),/empty_outcome_has_records/);
  const x=base(); x.responseSha256="bad";
  assert.throws(()=>buildOddsCollectionAttempt(x),e=>e instanceof OddsCollectionLedgerError);
});
test("rejects identifiers that could carry credentials or arbitrary secret text", () => {
  const x=base(); x.correlationId="Bearer_secret_value";
  assert.throws(()=>buildOddsCollectionAttempt(x),e=>e instanceof OddsCollectionLedgerError);
});
test("source timestamps must be chronological and no later than ingestion", () => {
  const x=base(); x.oldestSourceObservedAt="2026-11-07T10:00:03.000Z";
  assert.throws(()=>buildOddsCollectionAttempt(x),/source_timestamp_range_invalid/);
  const future=base(); future.newestSourceObservedAt="2026-11-07T10:00:03.000Z";
  assert.throws(()=>buildOddsCollectionAttempt(future),/source_timestamp_after_ingestion/);
});

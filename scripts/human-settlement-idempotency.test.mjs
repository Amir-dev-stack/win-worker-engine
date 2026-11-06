import test from "node:test";
import assert from "node:assert/strict";
import { humanSettlementSubmissionId } from "../netlify/functions/human-coupon-settlements.mts";

test("human settlement submission identity is deterministic for the duplicate tuple", () => {
  const first = humanSettlementSubmissionId("coupon-1", "https://example.com/result", "won");
  const retry = humanSettlementSubmissionId("coupon-1", "https://example.com/result", "won");
  assert.equal(first, retry);
  assert.match(first, /^human-settlement-[a-f0-9]{64}$/);
});

test("human settlement submission identity separates coupon, evidence and outcome", () => {
  const base = humanSettlementSubmissionId("coupon-1", "https://example.com/result", "won");
  assert.notEqual(base, humanSettlementSubmissionId("coupon-2", "https://example.com/result", "won"));
  assert.notEqual(base, humanSettlementSubmissionId("coupon-1", "https://example.com/other", "won"));
  assert.notEqual(base, humanSettlementSubmissionId("coupon-1", "https://example.com/result", "lost"));
});

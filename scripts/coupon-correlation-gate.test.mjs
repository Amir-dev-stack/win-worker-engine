import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCouponCorrelation } from "../netlify/lib/coupon-correlation-gate.mts";

test("single-leg candidate passes the correlation gate when event identity is present", () => {
  const result = evaluateCouponCorrelation([{ eventId: "event-1", market: "moneyline", selection: "home" }]);
  assert.equal(result.status, "passed");
  assert.equal(result.approved, true);
  assert.deepEqual(result.blockers, []);
});

test("same-event multi-leg candidates are blocked without a joint model", () => {
  const result = evaluateCouponCorrelation([
    { eventId: "event-1", market: "moneyline", selection: "home" },
    { eventId: "event-1", market: "total", selection: "over" }
  ]);
  assert.equal(result.status, "blocked");
  assert.equal(result.approved, false);
  assert.ok(result.blockers.includes("same_event_joint_probability_not_modelled"));
  assert.deepEqual(result.repeatedEventIds, ["event-1"]);
});

test("different-event accumulators are also blocked until cross-event dependence is modelled", () => {
  const result = evaluateCouponCorrelation([
    { eventId: "event-1" },
    { eventId: "event-2" }
  ]);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("cross_event_dependence_not_modelled"));
});

test("missing event identity cannot be hidden by a descriptive event name", () => {
  const result = evaluateCouponCorrelation([
    { event: "Home vs Away", market: "moneyline", selection: "home" },
    { eventId: "event-2", event: "Other vs Teams" }
  ]);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("stable_event_identity_required_for_correlation_review"));
});

test("empty coupon candidates fail closed", () => {
  const result = evaluateCouponCorrelation([]);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("coupon_legs_required"));
});

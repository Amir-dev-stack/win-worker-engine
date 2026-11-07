import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCouponCorrelation } from "../netlify/lib/coupon-correlation-gate.mts";

test("single-leg candidate passes with its marginal probability available", () => {
  const result = evaluateCouponCorrelation([{ eventId: "event-1", market: "moneyline", selection: "home" }]);
  assert.equal(result.status, "passed");
  assert.equal(result.approved, true);
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.jointProbabilityAvailable, true);
  assert.deepEqual(result.blockers, []);
});

test("same-event multi-leg coupon remains draftable but joint probability is unavailable", () => {
  const result = evaluateCouponCorrelation([{ eventId: "event-1" }, { eventId: "event-1" }]);
  assert.equal(result.status, "advisory");
  assert.equal(result.approved, false);
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.jointProbabilityAvailable, false);
  assert.ok(result.blockers.includes("same_event_joint_probability_not_modelled"));
  assert.deepEqual(result.repeatedEventIds, ["event-1"]);
});

test("different-event accumulator remains draftable without claiming independent legs", () => {
  const result = evaluateCouponCorrelation([{ eventId: "event-1" }, { eventId: "event-2" }]);
  assert.equal(result.status, "advisory");
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.jointProbabilityAvailable, false);
  assert.ok(result.blockers.includes("cross_event_dependence_not_modelled"));
  assert.equal(result.probabilityStatus, "marginal_only_joint_unavailable");
});

test("missing event identity warns about joint probability but does not suppress the coupon draft", () => {
  const result = evaluateCouponCorrelation([{ event: "Home vs Away" }, { eventId: "event-2" }]);
  assert.equal(result.status, "advisory");
  assert.equal(result.couponDraftAllowed, true);
  assert.equal(result.jointProbabilityAvailable, false);
  assert.ok(result.blockers.includes("stable_event_identity_required_for_joint_probability_assessment"));
});

test("empty coupon candidates cannot be drafted", () => {
  const result = evaluateCouponCorrelation([]);
  assert.equal(result.status, "blocked");
  assert.equal(result.couponDraftAllowed, false);
  assert.ok(result.blockers.includes("coupon_legs_required"));
});

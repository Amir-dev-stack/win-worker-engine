/**
 * Advisory dependence assessment for coupon candidates.
 *
 * WIN does not yet have an independently validated joint-probability model.
 * That limitation must not suppress a coupon draft: the user decides whether
 * to bet. Multi-leg coupons may be drafted with marginal-only evidence, while
 * the joint win probability remains explicitly unavailable.
 */
export const WIN_COUPON_CORRELATION_GATE_VERSION = "win.coupon.correlation-gate.v2" as const;

type CouponLeg = { eventId?: unknown; event?: unknown; market?: unknown; selection?: unknown; };

function stableId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 180 ? normalized : null;
}

export function evaluateCouponCorrelation(legs: unknown) {
  if (!Array.isArray(legs) || legs.length === 0) {
    return {
      version: WIN_COUPON_CORRELATION_GATE_VERSION,
      status: "blocked" as const,
      approved: false,
      approvalScope: "joint_probability_assessment_only" as const,
      couponDraftAllowed: false,
      jointProbabilityAvailable: false,
      probabilityStatus: "unavailable" as const,
      method: "no_joint_probability_model" as const,
      blockers: ["coupon_legs_required"],
      warnings: [],
      eventCount: 0,
      repeatedEventIds: []
    };
  }
  const normalized = (legs as CouponLeg[]).map(leg => stableId(leg?.eventId));
  const missingIdentity = normalized.some(id => id === null);
  const counts = new Map<string, number>();
  for (const id of normalized) if (id) counts.set(id, (counts.get(id) || 0) + 1);
  const repeatedEventIds = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (missingIdentity) blockers.push("stable_event_identity_required_for_joint_probability_assessment");
  if (repeatedEventIds.length) blockers.push("same_event_joint_probability_not_modelled");
  if (legs.length > 1 && repeatedEventIds.length === 0) blockers.push("cross_event_dependence_not_modelled");
  if (blockers.length) warnings.push(...blockers);
  const singleLeg = legs.length === 1 && !missingIdentity;
  return {
    version: WIN_COUPON_CORRELATION_GATE_VERSION,
    status: singleLeg ? "passed" as const : "advisory" as const,
    approved: singleLeg,
    approvalScope: "joint_probability_assessment_only" as const,
    couponDraftAllowed: true,
    jointProbabilityAvailable: singleLeg,
    probabilityStatus: singleLeg ? "single_leg_marginal" as const : "marginal_only_joint_unavailable" as const,
    method: "no_joint_probability_model" as const,
    eventCount: counts.size,
    repeatedEventIds,
    blockers,
    warnings,
    explanation: singleLeg
      ? "Single-leg candidate; its marginal probability is also its coupon probability."
      : "Coupon draft is allowed. WIN must show available leg-level probabilities and disclose that a calibrated joint coupon probability is unavailable; the user decides whether to bet."
  };
}

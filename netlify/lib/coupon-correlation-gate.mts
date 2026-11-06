/**
 * Fail-closed correlation gate for coupon candidates.
 *
 * WIN currently has no independently validated joint-probability model for
 * multi-leg coupons. Free-text LLM correlation notes are not quantitative
 * evidence and must never authorize a multi-leg coupon.
 */
export const WIN_COUPON_CORRELATION_GATE_VERSION = "win.coupon.correlation-gate.v1" as const;

type CouponLeg = { eventId?: unknown; event?: unknown; market?: unknown; selection?: unknown; };

function stableId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 180 ? normalized : null;
}

export function evaluateCouponCorrelation(legs: unknown) {
  if (!Array.isArray(legs) || legs.length === 0) {
    return { version: WIN_COUPON_CORRELATION_GATE_VERSION, status: "blocked" as const,
      approved: false, method: "no_joint_probability_model" as const,
      blockers: ["coupon_legs_required"], eventCount: 0, repeatedEventIds: [] };
  }
  const normalized = (legs as CouponLeg[]).map(leg => stableId(leg?.eventId));
  const missingIdentity = normalized.some(id => id === null);
  const counts = new Map<string, number>();
  for (const id of normalized) if (id) counts.set(id, (counts.get(id) || 0) + 1);
  const repeatedEventIds = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const blockers: string[] = [];
  if (missingIdentity) blockers.push("stable_event_identity_required_for_correlation_review");
  if (repeatedEventIds.length) blockers.push("same_event_joint_probability_not_modelled");
  if (legs.length > 1 && repeatedEventIds.length === 0) blockers.push("cross_event_dependence_not_modelled");
  return {
    version: WIN_COUPON_CORRELATION_GATE_VERSION,
    status: blockers.length ? "blocked" as const : "passed" as const,
    approved: blockers.length === 0,
    method: "no_joint_probability_model" as const,
    eventCount: counts.size, repeatedEventIds, blockers,
    explanation: legs.length === 1 && blockers.length === 0
      ? "Single-leg candidate; no joint probability calculation is required."
      : "Multi-leg candidates remain blocked until WIN has independently validated joint-probability evidence. LLM notes and multiplying marginal probabilities are not accepted as correlation proof."
  };
}

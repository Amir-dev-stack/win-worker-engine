import type { WinFootballResultEvidenceRecordV1 } from "./ml-football-result-reconciliation.mts";

/**
 * Reviewed publisher/feed identity, curated in server-owned source code.
 * An empty catalogue is intentional: provider names or submitted group labels
 * are not evidence of independent upstream ownership.
 */
export type WinReviewedSourceIdentityV1 = {
  identityVersion: "win.source.identity.v1";
  providerId: string;
  upstreamOwnerId: string;
  feedProductId: string;
  independenceGroup: string;
  reviewerId: string;
  reviewedAt: string;
  reviewExpiresAt: string;
  evidenceUrl: string;
  evidenceSha256: string;
};

const REVIEWED_SOURCE_IDENTITIES: readonly WinReviewedSourceIdentityV1[] = [];

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const hash256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

export function validateWinReviewedSourceIdentity(
  identity: WinReviewedSourceIdentityV1,
  now: string
): string[] {
  const errors: string[] = [];
  if (!identity || identity.identityVersion !== "win.source.identity.v1") errors.push("identity_version_invalid");
  for (const field of ["providerId", "upstreamOwnerId", "feedProductId", "independenceGroup", "reviewerId"] as const) {
    if (!nonEmpty(identity?.[field])) errors.push(field + "_required");
  }
  if (!isStrictClock(now)) errors.push("validation_time_invalid");
  if (!isStrictClock(identity?.reviewedAt)) errors.push("reviewed_at_invalid");
  if (!isStrictClock(identity?.reviewExpiresAt)) errors.push("review_expiry_invalid");
  if (isStrictClock(now) && isStrictClock(identity?.reviewedAt) &&
      Date.parse(identity.reviewedAt) > Date.parse(now)) errors.push("review_is_from_future");
  if (isStrictClock(now) && isStrictClock(identity?.reviewExpiresAt) &&
      Date.parse(identity.reviewExpiresAt) <= Date.parse(now)) errors.push("review_expired");
  if (isStrictClock(identity?.reviewedAt) && isStrictClock(identity?.reviewExpiresAt) &&
      Date.parse(identity.reviewExpiresAt) <= Date.parse(identity.reviewedAt)) errors.push("review_window_invalid");
  if (typeof identity?.evidenceUrl !== "string" || !/^https:\/\//i.test(identity.evidenceUrl) ||
      /[?#]/.test(identity.evidenceUrl) || /[\\s]/.test(identity.evidenceUrl)) errors.push("review_evidence_url_invalid");
  if (!hash256(identity?.evidenceSha256)) errors.push("review_evidence_hash_invalid");
  return [...new Set(errors)];
}

function isStrictClock(value: unknown): value is string {
  return typeof value === "string" &&
    /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() ===
      (value.includes(".") ? value : value.replace("Z", ".000Z"));
}


export function validateWinReviewedSourceIdentityCatalogue(
  catalogue: readonly WinReviewedSourceIdentityV1[],
  now: string
): string[] {
  const errors: string[] = [];
  const providerIds = new Set<string>();
  const ownerGroups = new Map<string, string>();
  const groupOwners = new Map<string, string>();
  for (const identity of catalogue) {
    errors.push(...validateWinReviewedSourceIdentity(identity, now));
    if (providerIds.has(identity.providerId)) errors.push("duplicate_provider_id:" + identity.providerId);
    providerIds.add(identity.providerId);
    const knownGroup = ownerGroups.get(identity.upstreamOwnerId);
    if (knownGroup && knownGroup !== identity.independenceGroup) {
      errors.push("upstream_owner_mapped_to_multiple_groups:" + identity.upstreamOwnerId);
    }
    ownerGroups.set(identity.upstreamOwnerId, identity.independenceGroup);
    const knownOwner = groupOwners.get(identity.independenceGroup);
    if (knownOwner && knownOwner !== identity.upstreamOwnerId) {
      errors.push("independence_group_maps_to_multiple_owners:" + identity.independenceGroup);
    }
    groupOwners.set(identity.independenceGroup, identity.upstreamOwnerId);
  }
  return [...new Set(errors)];
}

export function resolveWinReviewedSourceIdentity(providerId: string, now: string) {
  if (!nonEmpty(providerId)) return null;
  if (validateWinReviewedSourceIdentityCatalogue(REVIEWED_SOURCE_IDENTITIES, now).length) return null;
  const identity = REVIEWED_SOURCE_IDENTITIES.find(item => item.providerId === providerId);
  if (!identity || validateWinReviewedSourceIdentity(identity, now).length) return null;
  return { ...identity };
}

export function validateWinFootballSourcePairIdentity(
  primary: WinFootballResultEvidenceRecordV1,
  corroborating: WinFootballResultEvidenceRecordV1,
  now: string
): { verified: boolean; reasons: string[]; primaryIdentity: WinReviewedSourceIdentityV1 | null;
  corroboratingIdentity: WinReviewedSourceIdentityV1 | null } {
  const primaryIdentity = resolveWinReviewedSourceIdentity(primary?.providerId, now);
  const corroboratingIdentity = resolveWinReviewedSourceIdentity(corroborating?.providerId, now);
  const reasons: string[] = [];
  if (!primaryIdentity) reasons.push("primary_provider_identity_unreviewed");
  if (!corroboratingIdentity) reasons.push("corroborating_provider_identity_unreviewed");
  if (primaryIdentity && primary?.independenceGroup !== primaryIdentity.independenceGroup) {
    reasons.push("primary_independence_group_not_registry_bound");
  }
  if (corroboratingIdentity && corroborating?.independenceGroup !== corroboratingIdentity.independenceGroup) {
    reasons.push("corroborating_independence_group_not_registry_bound");
  }
  if (primaryIdentity && corroboratingIdentity) {
    if (primaryIdentity.upstreamOwnerId === corroboratingIdentity.upstreamOwnerId) {
      reasons.push("providers_share_upstream_owner");
    }
    if (primaryIdentity.independenceGroup === corroboratingIdentity.independenceGroup) {
      reasons.push("providers_share_independence_group");
    }
    if (primaryIdentity.providerId === corroboratingIdentity.providerId) {
      reasons.push("providers_must_differ");
    }
  }
  return { verified: reasons.length === 0, reasons: [...new Set(reasons)],
    primaryIdentity, corroboratingIdentity };
}

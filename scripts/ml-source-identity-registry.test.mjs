import test from "node:test";
import assert from "node:assert/strict";
import {
  validateWinReviewedSourceIdentity,
  resolveWinReviewedSourceIdentity,
  validateWinFootballSourcePairIdentity
} from "../netlify/lib/ml-source-identity-registry.mts";

const now = "2026-11-06T12:00:00.000Z";
const identity = {
  identityVersion: "win.source.identity.v1",
  providerId: "provider-a",
  upstreamOwnerId: "publisher-a",
  feedProductId: "football-results-v1",
  independenceGroup: "publisher-a",
  reviewerId: "reviewer-1",
  reviewedAt: "2026-10-01T12:00:00.000Z",
  reviewExpiresAt: "2027-10-01T12:00:00.000Z",
  evidenceUrl: "https://example.org/provider-ownership",
  evidenceSha256: "a".repeat(64)
};

test("reviewed source identity metadata requires pinned evidence and a live review window", () => {
  assert.deepEqual(validateWinReviewedSourceIdentity(identity, now), []);
  assert.ok(validateWinReviewedSourceIdentity({ ...identity, evidenceSha256: "bad" }, now)
    .includes("review_evidence_hash_invalid"));
  assert.ok(validateWinReviewedSourceIdentity({ ...identity, evidenceUrl: "http://example.org/proof" }, now)
    .includes("review_evidence_url_invalid"));
  assert.ok(validateWinReviewedSourceIdentity({ ...identity, reviewExpiresAt: "2026-11-06T12:00:00.000Z" }, now)
    .includes("review_expired"));
  assert.ok(validateWinReviewedSourceIdentity({ ...identity, reviewedAt: "2026-12-01T00:00:00.000Z" }, now)
    .includes("review_is_from_future"));
});

test("unpopulated server catalogue never treats caller-declared provider groups as verified", () => {
  assert.equal(resolveWinReviewedSourceIdentity("provider-a", now), null);
  const result = validateWinFootballSourcePairIdentity(
    { providerId: "provider-a", independenceGroup: "publisher-a" },
    { providerId: "provider-b", independenceGroup: "publisher-b" },
    now
  );
  assert.equal(result.verified, false);
  assert.deepEqual(result.reasons, [
    "primary_provider_identity_unreviewed",
    "corroborating_provider_identity_unreviewed"
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { DATA_PROVIDER_REGISTRY } from "../netlify/lib/data-provider-registry.mts";
import { getWinSourceReviewQueue } from "../netlify/lib/ml-source-review-queue.mts";

const RESULT_DOMAIN_PATTERN = /(^|_)(results?|settled_results?|match_results?)(_|$)/i;

test("source review queue includes every registered provider with result data", () => {
  const expected = DATA_PROVIDER_REGISTRY
    .filter(provider => provider.dataDomains.some(domain => RESULT_DOMAIN_PATTERN.test(domain)))
    .map(provider => provider.id)
    .sort();
  const actual = getWinSourceReviewQueue().map(entry => entry.providerId).sort();
  assert.deepEqual(actual, expected);
});

test("queue entries stay unreviewed and never invent source ownership or independence", () => {
  const queue = getWinSourceReviewQueue();
  assert.ok(queue.length > 0);
  for (const entry of queue) {
    assert.equal(entry.reviewStatus, "unreviewed");
    assert.equal(entry.identityVerified, false);
    assert.equal(entry.upstreamOwnerId, null);
    assert.equal(entry.feedProductId, null);
    assert.equal(entry.independenceGroup, null);
    assert.ok(entry.evidenceRequired.includes("primary_publisher_ownership_evidence"));
    assert.ok(entry.evidenceRequired.includes("exact_feed_or_dataset_product_identity"));
  }
});

test("football result candidates are the first review track; other sports remain queued for later", () => {
  const queue = getWinSourceReviewQueue();
  assert.ok(queue.some(entry => entry.rolloutTrack === "football_first"));
  assert.ok(queue.some(entry => entry.rolloutTrack === "later_sport"));
  assert.ok(queue.filter(entry => entry.sportIds.includes("football"))
    .every(entry => entry.rolloutTrack === "football_first"));
});

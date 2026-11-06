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

import { getWinFootballSourceInventory } from "../netlify/lib/ml-source-review-queue.mts";

test("football source inventory covers all registered football providers and their declared domains", () => {
  const expected = DATA_PROVIDER_REGISTRY.filter(provider => provider.sports.includes("football"))
    .map(provider => provider.id).sort();
  const inventory = getWinFootballSourceInventory();
  assert.deepEqual(inventory.map(entry => entry.providerId).sort(), expected);
  for (const entry of inventory) {
    const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === entry.providerId);
    assert.deepEqual(entry.dataDomains, [...provider.dataDomains].sort());
    assert.equal(entry.connectionStatus, "registry_only_not_connected");
    assert.equal(entry.trainingStatus, "not_approved");
  }
});

test("football inventory separates odds, results, context and prediction data without asserting readiness", () => {
  const inventory = getWinFootballSourceInventory();
  const allAreas = new Set(inventory.flatMap(entry => entry.coverageAreas));
  assert.ok(allAreas.has("fixtures_and_results"));
  assert.ok(allAreas.has("odds_and_markets"));
  assert.ok(allAreas.has("team_and_player_statistics"));
  assert.ok(allAreas.has("predictions_and_probabilities"));
  const locked = inventory.find(entry => entry.providerId === "football-data-co-uk");
  assert.equal(locked.licenceReview, "required");
  assert.equal(locked.automationAllowed, false);
  assert.ok(locked.coverageAreas.includes("odds_and_markets"));
});

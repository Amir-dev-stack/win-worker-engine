import assert from "node:assert/strict";
import test from "node:test";
import { resolveEvidenceConflict } from "../netlify/lib/evidence-conflict-resolution.mts";

const options = {
  asOf: "2026-11-20T12:00:00.000Z",
  maxAgeMs: 24 * 60 * 60 * 1000,
  minIndependentProviders: 2,
  providerPriority: ["official-feed", "archive-feed", "secondary-feed"]
};

function observation(overrides = {}) {
  const base = {
    observationId: "obs-official-1",
    providerId: "official-feed",
    providerEventId: "event-9001",
    canonicalEventId: "win-event-42",
    sportId: "football",
    competitionId: "competition-7",
    homeParticipantId: "team-home",
    awayParticipantId: "team-away",
    eventTime: "2026-11-20T09:00:00.000Z",
    retrievedAt: "2026-11-20T10:00:00.000Z",
    sourceId: "official-results",
    sourceVersion: "v2026-11-20",
    origin: "observed_record",
    licence: {
      rightsStatus: "approved",
      licenceId: "licence-official-v1",
      attributionRequired: true,
      attributionPresent: true
    },
    claim: { type: "event_result", status: "final", homeScore: 2, awayScore: 1 }
  };
  return {
    ...base,
    ...overrides,
    licence: { ...base.licence, ...(overrides.licence ?? {}) },
    claim: { ...base.claim, ...(overrides.claim ?? {}) }
  };
}

test("resolves only identical fresh claims from independent approved providers", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({
      observationId: "obs-archive-1",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88"
    })
  ], options);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.resolution, { type: "event_result", status: "final", homeScore: 2, awayScore: 1 });
  assert.deepEqual(result.providers, ["archive-feed", "official-feed"]);
  assert.equal(result.provenance.length, 2);
  assert.equal(result.provenance[0].providerId, "official-feed");
  assert.deepEqual(result.diagnostics, []);
});

test("stale, undated and impossible retrieval times are excluded fail-closed", () => {
  const result = resolveEvidenceConflict([
    observation({ observationId: "obs-stale", retrievedAt: "2026-11-18T10:00:00.000Z" }),
    observation({ observationId: "obs-undated", providerId: "archive-feed", providerEventId: "match-abc", retrievedAt: "not-a-date" }),
    observation({ observationId: "obs-pre-event", providerId: "secondary-feed", providerEventId: "fixture-1", retrievedAt: "2026-11-20T08:00:00.000Z" })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.equal(result.providerCount, 0);
  assert.deepEqual(result.diagnostics, ["NO_ELIGIBLE_EVIDENCE", "STALE_OBSERVATION", "TIMESTAMP_CONFLICT", "UNDATED_OBSERVATION"]);
  assert.equal(result.rejected.length, 3);
});

test("exact duplicates and provider replays cannot manufacture independent support", () => {
  const first = observation();
  const replay = observation({ observationId: "obs-official-replay" });
  const result = resolveEvidenceConflict([first, { ...first }, replay], options);
  assert.equal(result.status, "unresolved");
  assert.equal(result.providerCount, 1);
  assert.deepEqual(result.deduplicatedObservationIds, ["obs-official-1", "obs-official-replay"]);
  assert.deepEqual(result.missingEvidence, ["MISSING_INDEPENDENT_EVIDENCE"]);
});

test("a reused observation id with different content is rejected as a conflicting replay", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({ claim: { homeScore: 3, awayScore: 1 } })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.ok(result.diagnostics.includes("CONFLICTING_REPLAY"));
  assert.equal(result.provenance.length, 0);
});

test("contradictory final results stay unresolved even with a unique priority winner", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({
      observationId: "obs-archive-1",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88",
      claim: { homeScore: 1, awayScore: 2 }
    })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.ok(result.diagnostics.includes("CONTRADICTORY_RESULT"));
  assert.deepEqual(result.preferredCandidate.claim, { type: "event_result", status: "final", homeScore: 2, awayScore: 1 });
  assert.equal(result.policy.conflictRule, "conflicts_remain_unresolved_priority_is_advisory");
});

test("conflicting settlements are never selected by majority or source priority", () => {
  const settlement = {
    type: "market_settlement",
    marketId: "full-time-result",
    selectionId: "home-win",
    outcome: "won"
  };
  const result = resolveEvidenceConflict([
    observation({ claim: settlement }),
    observation({
      observationId: "obs-archive-settlement",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-settlements",
      sourceVersion: "snapshot-88",
      claim: { ...settlement, outcome: "lost" }
    })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.ok(result.diagnostics.includes("CONFLICTING_SETTLEMENT"));
  assert.equal(result.resolution, null);
});

test("equal-priority contradictory claims expose a tie without a preferred candidate", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({
      observationId: "obs-archive-1",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88",
      claim: { homeScore: 0, awayScore: 0 }
    })
  ], { ...options, providerPriority: [] });
  assert.equal(result.status, "unresolved");
  assert.equal(result.preferredCandidate, null);
  assert.ok(result.diagnostics.includes("PRIORITY_TIE"));
});

test("provider-scoped alias collisions fail closed as ambiguous identity", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({
      observationId: "obs-official-alias-collision",
      canonicalEventId: "win-event-99",
      homeParticipantId: "different-home"
    }),
    observation({
      observationId: "obs-archive-1",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88"
    })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.ok(result.diagnostics.includes("AMBIGUOUS_IDENTITY"));
  assert.deepEqual(result.rejected.filter(item => item.diagnostics.includes("AMBIGUOUS_IDENTITY")).map(item => item.observationId), ["obs-official-1", "obs-official-alias-collision"]);
});

test("different event timestamps for one canonical event remain ambiguous", () => {
  const result = resolveEvidenceConflict([
    observation(),
    observation({
      observationId: "obs-archive-time-conflict",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88",
      eventTime: "2026-11-20T09:05:00.000Z"
    })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.ok(result.diagnostics.includes("AMBIGUOUS_IDENTITY"));
});

test("rights-unknown and registry-candidate rows never become evidence", () => {
  const result = resolveEvidenceConflict([
    observation({ licence: { rightsStatus: "unknown", licenceId: null } }),
    observation({
      observationId: "obs-candidate",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "registry-entry",
      sourceVersion: "candidate-v1",
      origin: "registry_candidate"
    })
  ], options);
  assert.equal(result.status, "unresolved");
  assert.equal(result.providerCount, 0);
  assert.ok(result.diagnostics.includes("RIGHTS_UNKNOWN"));
  assert.ok(result.diagnostics.includes("CANDIDATE_NOT_EVIDENCE"));
  assert.ok(result.diagnostics.includes("NO_ELIGIBLE_EVIDENCE"));
});

test("resolution output is invariant to input ordering", () => {
  const rows = [
    observation(),
    observation({
      observationId: "obs-secondary-1",
      providerId: "secondary-feed",
      providerEventId: "secondary-77",
      sourceId: "secondary-results",
      sourceVersion: "v4"
    }),
    observation({
      observationId: "obs-archive-1",
      providerId: "archive-feed",
      providerEventId: "match-abc",
      sourceId: "archive-results",
      sourceVersion: "snapshot-88"
    })
  ];
  assert.deepEqual(resolveEvidenceConflict(rows, options), resolveEvidenceConflict([...rows].reverse(), options));
});

test("malformed audit inputs also produce order-invariant redacted diagnostics", () => {
  const rows = [null, { observationId: "unsafe/id", eventTime: "bad" }, observation()];
  assert.deepEqual(resolveEvidenceConflict(rows, options), resolveEvidenceConflict([...rows].reverse(), options));
  const result = resolveEvidenceConflict(rows, options);
  assert.equal(result.rejected[0].observationId, "invalid-observation");
  assert.equal(JSON.stringify(result).includes("unsafe/id"), false);
});

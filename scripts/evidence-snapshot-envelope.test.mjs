import assert from "node:assert/strict";
import test from "node:test";
import { createSnapshotEnvelope, validateSnapshotBatch } from "../netlify/lib/evidence-snapshot-envelope.mts";

const options = {
  asOf: "2026-11-20T18:00:00.000Z",
  maxBatchSize: 20,
  maxAgeMs: {
    schedule: 24 * 60 * 60 * 1000,
    result: 7 * 24 * 60 * 60 * 1000,
    odds: 4 * 60 * 60 * 1000
  }
};

function scheduleDraft(overrides = {}) {
  const base = {
    kind: "schedule",
    providerId: "official-feed",
    providerEventId: "event-9001",
    canonicalEventId: "win-event-42",
    sportId: "football",
    competitionId: "competition-7",
    homeParticipantId: "team-home",
    awayParticipantId: "team-away",
    eventTime: "2026-11-20T15:00:00.000Z",
    timePrecision: "millisecond",
    timezoneBasis: "utc",
    retrievedAt: "2026-11-20T11:00:00.000Z",
    sourceId: "official-schedule",
    sourceVersion: "v2026-11-20",
    sourceRevision: 1,
    origin: "observed_record",
    licence: {
      rightsStatus: "approved",
      licenceId: "licence-official-v1",
      attributionRequired: true,
      attributionPresent: true
    },
    payload: {
      status: "scheduled",
      scheduledStart: "2026-11-20T15:00:00.000Z",
      venueId: "venue-12"
    }
  };
  return {
    ...base,
    ...overrides,
    licence: { ...base.licence, ...(overrides.licence ?? {}) },
    payload: { ...base.payload, ...(overrides.payload ?? {}) }
  };
}

function resultDraft(overrides = {}) {
  return scheduleDraft({
    kind: "result",
    retrievedAt: "2026-11-20T16:00:00.000Z",
    sourceId: "official-results",
    payload: { status: "final", homeScore: 2, awayScore: 1 },
    ...overrides
  });
}

function oddsDraft(overrides = {}) {
  return scheduleDraft({
    kind: "odds",
    sourceId: "bookmaker-snapshot",
    retrievedAt: "2026-11-20T14:01:00.000Z",
    payload: {
      bookmakerId: "book-1",
      marketId: "full-time-result",
      selectionId: "home-win",
      decimalOdds: 1.91,
      observedAt: "2026-11-20T14:00:00.000Z",
      live: false
    },
    ...overrides
  });
}

test("creates deterministic deeply frozen content-addressed envelopes", () => {
  const first = createSnapshotEnvelope(scheduleDraft());
  const reordered = createSnapshotEnvelope({ ...scheduleDraft(), payload: { venueId: "venue-12", scheduledStart: "2026-11-20T15:00:00.000Z", status: "scheduled" } });
  assert.equal(first.snapshotId, reordered.snapshotId);
  assert.equal(first.payloadHash, reordered.payloadHash);
  assert.match(first.snapshotId, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.payload), true);
  assert.throws(() => { first.payload.status = "cancelled"; }, /read only|Cannot assign/u);
});

test("requires exact timezone-qualified event time and declared precision", () => {
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ eventTime: "2026-11-20", payload: { scheduledStart: "2026-11-20" } })), /timestamp/u);
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ timezoneBasis: "explicit_offset" })), /timestamp/u);
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ timePrecision: "second", eventTime: "2026-11-20T15:00:00.125Z", payload: { scheduledStart: "2026-11-20T15:00:00.125Z" } })), /precision/u);
});

test("rejects temporally invalid results and post-event or live odds", () => {
  assert.throws(() => createSnapshotEnvelope(resultDraft({ retrievedAt: "2026-11-20T14:59:00.000Z" })), /result snapshot/u);
  assert.throws(() => createSnapshotEnvelope(oddsDraft({ payload: { observedAt: "2026-11-20T15:00:00.000Z" } })), /odds snapshot/u);
  assert.throws(() => createSnapshotEnvelope(oddsDraft({ payload: { live: true } })), /odds snapshot/u);
});

test("rejects registry candidates, unknown rights and missing attribution before hashing", () => {
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ origin: "registry_candidate" })), /not evidence/u);
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ licence: { rightsStatus: "unknown", licenceId: null } })), /rights/u);
  assert.throws(() => createSnapshotEnvelope(scheduleDraft({ licence: { attributionPresent: false } })), /rights/u);
});

test("accepts typed schedule, result and pre-event odds envelopes in stable order", () => {
  const rows = [createSnapshotEnvelope(oddsDraft()), createSnapshotEnvelope(scheduleDraft()), createSnapshotEnvelope(resultDraft())];
  const forward = validateSnapshotBatch(rows, options);
  const reverse = validateSnapshotBatch([...rows].reverse(), options);
  assert.equal(forward.status, "accepted");
  assert.equal(forward.accepted.length, 3);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.retryDisposition, "do_not_retry_automatically");
});

test("oversized batches fail without partial truncation or automatic replay", () => {
  const row = createSnapshotEnvelope(scheduleDraft());
  const result = validateSnapshotBatch([row, row], { ...options, maxBatchSize: 1 });
  assert.equal(result.status, "rejected");
  assert.deepEqual(result.diagnostics, ["BATCH_LIMIT_EXCEEDED"]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.retryDisposition, "split_batch_no_automatic_replay");
});

test("exact replays are deduplicated and cannot inflate accepted evidence", () => {
  const row = createSnapshotEnvelope(scheduleDraft());
  const result = validateSnapshotBatch([row, row, row], options);
  assert.equal(result.status, "accepted");
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.deduplicatedSnapshotIds, [row.snapshotId]);
});

test("payload or metadata tampering is quarantined with redacted evidence", () => {
  const row = createSnapshotEnvelope(resultDraft());
  const tampered = { ...row, payload: { ...row.payload, homeScore: 9 } };
  const result = validateSnapshotBatch([tampered], options);
  assert.equal(result.status, "rejected");
  assert.deepEqual(result.diagnostics, ["TAMPERED_SNAPSHOT"]);
  assert.equal(result.rejected[0].snapshotId, row.snapshotId);
});

test("provider alias collisions quarantine every conflicting identity", () => {
  const first = createSnapshotEnvelope(scheduleDraft());
  const second = createSnapshotEnvelope(scheduleDraft({ canonicalEventId: "win-event-99", homeParticipantId: "team-other", sourceRevision: 2, retrievedAt: "2026-11-20T11:10:00.000Z" }));
  const result = validateSnapshotBatch([first, second], options);
  assert.equal(result.status, "rejected");
  assert.ok(result.diagnostics.includes("AMBIGUOUS_IDENTITY"));
  assert.equal(result.rejected.length, 2);
});

test("same source revision with different content is an explicit conflict", () => {
  const first = createSnapshotEnvelope(scheduleDraft());
  const second = createSnapshotEnvelope(scheduleDraft({ payload: { status: "postponed" } }));
  const result = validateSnapshotBatch([first, second], options);
  assert.equal(result.status, "rejected");
  assert.ok(result.diagnostics.includes("REVISION_CONFLICT"));
  assert.equal(result.accepted.length, 0);
});

test("higher source revisions must have strictly later retrieval times", () => {
  const first = createSnapshotEnvelope(scheduleDraft({ retrievedAt: "2026-11-20T11:30:00.000Z" }));
  const second = createSnapshotEnvelope(scheduleDraft({ sourceRevision: 2, retrievedAt: "2026-11-20T11:20:00.000Z", payload: { status: "postponed" } }));
  const result = validateSnapshotBatch([second, first], options);
  assert.equal(result.status, "rejected");
  assert.ok(result.diagnostics.includes("NON_MONOTONIC_REVISION"));
  assert.equal(result.accepted.length, 0);
});

test("stale and future retrievals are excluded while independent valid rows survive", () => {
  const valid = createSnapshotEnvelope(scheduleDraft());
  const stale = createSnapshotEnvelope(scheduleDraft({ providerId: "archive-feed", providerEventId: "archive-1", sourceId: "archive-schedule", retrievedAt: "2026-11-10T10:00:00.000Z" }));
  const future = createSnapshotEnvelope(scheduleDraft({ providerId: "secondary-feed", providerEventId: "secondary-1", sourceId: "secondary-schedule", retrievedAt: "2026-11-20T18:01:00.000Z" }));
  const result = validateSnapshotBatch([future, valid, stale], options);
  assert.equal(result.status, "partial");
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.diagnostics, ["FUTURE_RETRIEVAL", "STALE_SNAPSHOT"]);
});

test("batch rejects candidate and rights-unknown envelopes without echoing payloads", () => {
  const valid = createSnapshotEnvelope(scheduleDraft());
  const candidate = { ...valid, origin: "registry_candidate" };
  const unknownRights = { ...valid, licence: { ...valid.licence, rightsStatus: "unknown", licenceId: null } };
  const result = validateSnapshotBatch([candidate, unknownRights], options);
  assert.equal(result.status, "rejected");
  assert.deepEqual(result.diagnostics, ["CANDIDATE_NOT_EVIDENCE", "RIGHTS_NOT_APPROVED"]);
  assert.equal(JSON.stringify(result.rejected).includes("venue-12"), false);
});

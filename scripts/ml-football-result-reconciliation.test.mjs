import test from "node:test";
import assert from "node:assert/strict";
import { reconcileWinFootballResultEvidence } from "../netlify/lib/ml-football-result-reconciliation.mts";

const primary = {
  evidenceVersion: "win.football.result-evidence.v1",
  providerId: "provider-a",
  independenceGroup: "publisher-a",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  sourceRecordId: "a-100",
  recordSha256: "a".repeat(64),
  retrievedAt: "2026-11-01T22:00:00.000Z",
  resultAvailableAt: "2026-11-01T20:00:00.000Z",
  eventId: "win-event-1",
  competitionId: "league-1",
  kickoff: "2026-11-01T18:00:00.000Z",
  homeTeamId: "team-home",
  awayTeamId: "team-away",
  scoreBasis: "regulation_time",
  homeGoals: 2,
  awayGoals: 1
};
const corroborating = {
  ...primary,
  providerId: "provider-b",
  independenceGroup: "publisher-b",
  sourceRecordId: "b-900",
  recordSha256: "b".repeat(64)
};

test("two source-diverse matching results produce a hashed audit classification only", () => {
  const result = reconcileWinFootballResultEvidence(primary, corroborating);
  assert.equal(result.status, "source_diverse_match");
  assert.deepEqual(result.reasons, []);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.trainingApprovalGranted, false);
});

test("different scores are flagged as a conflict rather than silently selecting a winner", () => {
  const result = reconcileWinFootballResultEvidence(primary, {
    ...corroborating, homeGoals: 3
  });
  assert.equal(result.status, "source_diverse_conflict");
  assert.deepEqual(result.reasons, ["regulation_score_mismatch"]);
  assert.equal(result.trainingApprovalGranted, false);
});

test("same provider or declared independence group cannot corroborate itself", () => {
  const sameProvider = reconcileWinFootballResultEvidence(primary, {
    ...corroborating, providerId: primary.providerId
  });
  assert.equal(sameProvider.status, "unverifiable");
  assert.ok(sameProvider.reasons.includes("providers_must_differ"));
  const sameGroup = reconcileWinFootballResultEvidence(primary, {
    ...corroborating, independenceGroup: primary.independenceGroup
  });
  assert.equal(sameGroup.status, "unverifiable");
  assert.ok(sameGroup.reasons.includes("independence_groups_must_differ"));
});

test("event identity mismatch is not reconciled even when the score matches", () => {
  const result = reconcileWinFootballResultEvidence(primary, {
    ...corroborating, homeTeamId: "different-team"
  });
  assert.equal(result.status, "unverifiable");
  assert.ok(result.reasons.includes("event_identity_mismatch:homeTeamId"));
});

test("bad provenance, chronology and score basis fail closed", () => {
  const result = reconcileWinFootballResultEvidence(primary, {
    ...corroborating,
    sourceRevision: "main",
    recordSha256: "not-a-hash",
    resultAvailableAt: "2026-11-01T17:00:00.000Z",
    scoreBasis: "includes_extra_time"
  });
  assert.equal(result.status, "unverifiable");
  assert.ok(result.reasons.includes("corroborating_source_revision_invalid"));
  assert.ok(result.reasons.includes("corroborating_record_hash_invalid"));
  assert.ok(result.reasons.includes("corroborating_result_precedes_kickoff"));
  assert.ok(result.reasons.includes("corroborating_score_basis_invalid"));
  assert.equal(result.evidenceSha256, null);
});

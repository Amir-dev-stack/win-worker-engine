import assert from "node:assert/strict";
import test from "node:test";
import { createSnapshotEnvelope } from "../netlify/lib/evidence-snapshot-envelope.mts";
import { buildTeamStrengthSnapshot } from "../netlify/lib/team-strength-snapshot.mts";

const hash = character => character.repeat(64);
const options = {
  asOf: "2026-11-20T18:00:00.000Z",
  sportId: "football",
  competitionId: "league-1",
  seasonId: "2026-27",
  seasonStart: "2026-08-01T00:00:00.000Z",
  teamIds: ["team-a", "team-b"],
  maxResultRecords: 100,
  maxResultAgeMs: 400 * 24 * 60 * 60 * 1000,
  minSampleSize: 2,
  recentWindow: 2,
  maxAvailabilityRecords: 20,
  availabilityEvidence: []
};

function result({ eventId, eventTime, home, away, homeScore, awayScore, providerId = "provider-1", competitionId = "league-1", canonicalEventId = eventId, retrievedAt }) {
  return createSnapshotEnvelope({
    kind: "result",
    providerId,
    providerEventId: `${providerId}-${eventId}`,
    canonicalEventId,
    sportId: "football",
    competitionId,
    homeParticipantId: home,
    awayParticipantId: away,
    eventTime,
    timePrecision: "millisecond",
    timezoneBasis: "utc",
    retrievedAt: retrievedAt ?? new Date(Date.parse(eventTime) + 2 * 60 * 60 * 1000).toISOString(),
    sourceId: "official-results",
    sourceVersion: "v1",
    sourceRevision: 1,
    origin: "observed_record",
    licence: {
      rightsStatus: "approved",
      licenceId: "approved-results-v1",
      attributionRequired: true,
      attributionPresent: true
    },
    payload: { status: "final", homeScore, awayScore }
  });
}

function seasonResults() {
  return [
    result({ eventId: "m1", eventTime: "2026-10-01T18:00:00.000Z", home: "team-a", away: "team-c", homeScore: 2, awayScore: 0 }),
    result({ eventId: "m2", eventTime: "2026-10-02T18:00:00.000Z", home: "team-d", away: "team-a", homeScore: 2, awayScore: 0 }),
    result({ eventId: "m3", eventTime: "2026-10-03T18:00:00.000Z", home: "team-b", away: "team-c", homeScore: 1, awayScore: 0 }),
    result({ eventId: "m4", eventTime: "2026-10-04T18:00:00.000Z", home: "team-c", away: "team-b", homeScore: 0, awayScore: 2 }),
    result({ eventId: "m5", eventTime: "2026-10-05T18:00:00.000Z", home: "team-d", away: "team-c", homeScore: 1, awayScore: 0 }),
    result({ eventId: "m6", eventTime: "2026-10-06T18:00:00.000Z", home: "team-d", away: "team-c", homeScore: 3, awayScore: 0 })
  ];
}

function availability(overrides = {}) {
  return {
    evidenceId: "availability-a",
    teamId: "team-a",
    sourceSnapshotId: hash("a"),
    observedAt: "2026-11-20T16:00:00.000Z",
    availableAt: "2026-11-20T16:01:00.000Z",
    status: "confirmed_lineup",
    expectedStartingSlots: 11,
    confirmedStartingSlots: 11,
    confirmedAbsences: 1,
    questionablePlayers: 0,
    ...overrides
  };
}

test("builds a deterministic deeply frozen point-in-time strength snapshot", () => {
  const rows = seasonResults();
  const forward = buildTeamStrengthSnapshot(rows, options);
  const reverse = buildTeamStrengthSnapshot([...rows].reverse(), options);
  assert.deepEqual(forward, reverse);
  assert.match(forward.strengthSnapshotId, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(forward), true);
  assert.equal(Object.isFrozen(forward.teams), true);
  assert.throws(() => { forward.teams[0].fullSeason.played = 99; }, /read only|Cannot assign/u);
});

test("calculates season, home, away and bounded recent form", () => {
  const snapshot = buildTeamStrengthSnapshot(seasonResults(), options);
  const teamA = snapshot.teams.find(team => team.teamId === "team-a");
  const teamB = snapshot.teams.find(team => team.teamId === "team-b");
  assert.equal(snapshot.status, "descriptive_ready");
  assert.deepEqual(teamA.fullSeason, { played: 2, wins: 1, draws: 0, losses: 1, points: 3, pointsPerGame: 1.5, goalsFor: 2, goalsAgainst: 2, goalDifferencePerGame: 0 });
  assert.equal(teamA.home.wins, 1);
  assert.equal(teamA.away.losses, 1);
  assert.equal(teamB.fullSeason.pointsPerGame, 3);
  assert.deepEqual(teamB.recent.eventIds, ["m4", "m3"]);
  assert.equal(teamA.predictiveConfidence, null);
});

test("reports transparent opponent context without claiming calibration", () => {
  const snapshot = buildTeamStrengthSnapshot(seasonResults(), options);
  const teamA = snapshot.teams.find(team => team.teamId === "team-a");
  const teamB = snapshot.teams.find(team => team.teamId === "team-b");
  assert.ok(teamA.opponentContext.averageOpponentPpg > teamB.opponentContext.averageOpponentPpg);
  assert.ok(teamA.opponentContext.scheduleAdjustment > teamB.opponentContext.scheduleAdjustment);
  assert.equal(teamA.opponentContext.method, "descriptive_ppg_plus_half_schedule_delta_v1");
  assert.equal(teamA.opponentContext.adjustmentFactor, 0.5);
  assert.equal(teamA.opponentContext.calibrated, false);
});

test("quarantines contradictory scores for one canonical event", () => {
  const rows = seasonResults();
  rows.push(result({ eventId: "provider-two-m1", canonicalEventId: "m1", providerId: "provider-2", eventTime: "2026-10-01T18:00:00.000Z", home: "team-a", away: "team-c", homeScore: 1, awayScore: 0 }));
  const snapshot = buildTeamStrengthSnapshot(rows, options);
  assert.deepEqual(snapshot.evidence.conflictedEventIds, ["m1"]);
  assert.ok(snapshot.diagnostics.includes("CONFLICTING_EVENT_RESULT"));
  assert.equal(snapshot.evidence.resolvedMatches, 5);
  assert.equal(snapshot.teams.find(team => team.teamId === "team-a").fullSeason.played, 1);
});

test("quarantines canonical event identity collisions", () => {
  const rows = seasonResults();
  rows.push(result({ eventId: "provider-two-m1", canonicalEventId: "m1", providerId: "provider-2", eventTime: "2026-10-01T18:00:00.000Z", home: "team-a", away: "team-d", homeScore: 2, awayScore: 0 }));
  const snapshot = buildTeamStrengthSnapshot(rows, options);
  assert.deepEqual(snapshot.evidence.conflictedEventIds, ["m1"]);
  assert.ok(snapshot.diagnostics.includes("CONFLICTING_EVENT_IDENTITY"));
});

test("deduplicates agreeing multi-provider results without manufacturing matches", () => {
  const rows = seasonResults();
  rows.push(result({ eventId: "provider-two-m1", canonicalEventId: "m1", providerId: "provider-2", eventTime: "2026-10-01T18:00:00.000Z", home: "team-a", away: "team-c", homeScore: 2, awayScore: 0 }));
  const snapshot = buildTeamStrengthSnapshot(rows, options);
  assert.equal(snapshot.evidence.resolvedMatches, 6);
  assert.equal(snapshot.evidence.agreeingDuplicateSnapshots, 1);
  assert.deepEqual(snapshot.evidence.providerIds, ["provider-1", "provider-2"]);
  assert.equal(snapshot.teams.find(team => team.teamId === "team-a").fullSeason.played, 2);
});

test("excludes future-retrieved, stale and out-of-scope result evidence", () => {
  const futureRetrieved = result({ eventId: "future-retrieval", eventTime: "2026-11-19T18:00:00.000Z", home: "team-a", away: "team-b", homeScore: 1, awayScore: 0, retrievedAt: "2026-11-21T00:00:00.000Z" });
  const old = result({ eventId: "old", eventTime: "2025-01-01T18:00:00.000Z", home: "team-a", away: "team-b", homeScore: 1, awayScore: 0 });
  const otherCompetition = result({ eventId: "other", competitionId: "league-2", eventTime: "2026-10-10T18:00:00.000Z", home: "team-a", away: "team-b", homeScore: 1, awayScore: 0 });
  const snapshot = buildTeamStrengthSnapshot([futureRetrieved, old, otherCompetition], { ...options, maxResultAgeMs: 30 * 24 * 60 * 60 * 1000 });
  assert.equal(snapshot.evidence.resolvedMatches, 0);
  assert.equal(snapshot.status, "insufficient_evidence");
  assert.ok(snapshot.diagnostics.includes("NO_ELIGIBLE_RESULTS"));
  assert.deepEqual(snapshot.evidence.snapshotBatchDiagnostics, ["FUTURE_RETRIEVAL", "STALE_SNAPSHOT"]);
});

test("full-season aggregates enforce the explicit season boundary", () => {
  const priorSeason = result({ eventId: "prior-season", eventTime: "2026-07-31T18:00:00.000Z", home: "team-a", away: "team-b", homeScore: 5, awayScore: 0 });
  const snapshot = buildTeamStrengthSnapshot([...seasonResults(), priorSeason], options);
  assert.equal(snapshot.seasonId, "2026-27");
  assert.equal(snapshot.seasonStart, "2026-08-01T00:00:00.000Z");
  assert.equal(snapshot.evidence.resolvedMatches, 6);
  assert.equal(snapshot.teams.find(team => team.teamId === "team-a").fullSeason.goalsFor, 2);
});

test("reports confirmed, uncertain and missing availability without changing strength", () => {
  const evidence = [availability(), availability({ evidenceId: "availability-b", teamId: "team-b", sourceSnapshotId: hash("b"), status: "provisional", confirmedStartingSlots: 8, confirmedAbsences: 0, questionablePlayers: 2 })];
  const withEvidence = buildTeamStrengthSnapshot(seasonResults(), { ...options, availabilityEvidence: evidence });
  const withoutEvidence = buildTeamStrengthSnapshot(seasonResults(), options);
  const teamA = withEvidence.teams.find(team => team.teamId === "team-a");
  const teamB = withEvidence.teams.find(team => team.teamId === "team-b");
  assert.equal(teamA.availability.status, "confirmed");
  assert.equal(teamB.availability.status, "uncertain");
  assert.equal(withoutEvidence.teams[0].availability.status, "not_provided");
  assert.equal(teamA.fullSeason.pointsPerGame, withoutEvidence.teams.find(team => team.teamId === "team-a").fullSeason.pointsPerGame);
});

test("invalid or future availability fails closed without inventing squad health", () => {
  const future = availability({ availableAt: "2026-11-21T00:00:00.000Z" });
  const malformed = availability({ evidenceId: "bad", expectedStartingSlots: 11, confirmedStartingSlots: 12 });
  const snapshot = buildTeamStrengthSnapshot(seasonResults(), { ...options, availabilityEvidence: [future, malformed] });
  const teamA = snapshot.teams.find(team => team.teamId === "team-a");
  assert.equal(teamA.availability.status, "not_provided");
  assert.deepEqual(teamA.availability.latestEvidence, null);
  assert.ok(snapshot.diagnostics.includes("INVALID_AVAILABILITY"));
});

test("changed availability replay is conflicted and not selected", () => {
  const original = availability();
  const changed = availability({ confirmedAbsences: 2 });
  const forward = buildTeamStrengthSnapshot(seasonResults(), { ...options, availabilityEvidence: [original, changed] });
  const reverse = buildTeamStrengthSnapshot([...seasonResults()].reverse(), { ...options, availabilityEvidence: [changed, original] });
  assert.deepEqual(forward, reverse);
  assert.equal(forward.teams.find(team => team.teamId === "team-a").availability.status, "conflicted");
  assert.ok(forward.diagnostics.includes("AVAILABILITY_CONFLICT"));
});

test("insufficient samples are explicit and never become predictive confidence", () => {
  const snapshot = buildTeamStrengthSnapshot([seasonResults()[0]], options);
  assert.equal(snapshot.status, "insufficient_evidence");
  assert.ok(snapshot.diagnostics.includes("INSUFFICIENT_SAMPLE"));
  assert.equal(snapshot.teams.find(team => team.teamId === "team-a").evidenceStatus, "insufficient_sample");
  assert.equal(snapshot.teams.find(team => team.teamId === "team-a").predictiveConfidence, null);
});

test("availability input has an independent hard cap", () => {
  const snapshot = buildTeamStrengthSnapshot(seasonResults(), { ...options, maxAvailabilityRecords: 1, availabilityEvidence: [availability(), availability({ evidenceId: "second" })] });
  assert.equal(snapshot.status, "rejected");
  assert.deepEqual(snapshot.diagnostics, ["AVAILABILITY_LIMIT_EXCEEDED"]);
  assert.deepEqual(snapshot.teams, []);
});

test("result input inherits the bounded snapshot batch contract", () => {
  const snapshot = buildTeamStrengthSnapshot(seasonResults().slice(0, 2), { ...options, maxResultRecords: 1 });
  assert.equal(snapshot.evidence.resolvedMatches, 0);
  assert.deepEqual(snapshot.evidence.snapshotBatchDiagnostics, ["BATCH_LIMIT_EXCEEDED"]);
  assert.equal(snapshot.status, "insufficient_evidence");
});

test("configuration and identities fail closed", () => {
  assert.throws(() => buildTeamStrengthSnapshot({}, options), /array/u);
  assert.throws(() => buildTeamStrengthSnapshot([], { ...options, asOf: "2026-02-30T00:00:00.000Z" }), /identity/u);
  assert.throws(() => buildTeamStrengthSnapshot([], { ...options, seasonStart: options.asOf }), /season/u);
  assert.throws(() => buildTeamStrengthSnapshot([], { ...options, teamIds: ["team-a", "team-a"] }), /identity/u);
  assert.throws(() => buildTeamStrengthSnapshot([], { ...options, minSampleSize: 0 }), /bounds/u);
  assert.throws(() => buildTeamStrengthSnapshot([], { ...options, availabilityEvidence: {} }), /array/u);
});

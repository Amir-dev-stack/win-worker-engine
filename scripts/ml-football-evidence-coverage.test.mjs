import test from "node:test";
import assert from "node:assert/strict";
import { assessWinFootballEvidenceCoverage } from "../netlify/lib/ml-football-evidence-coverage.mts";

const competitionId = "league-a";
const season = "2025-26";
const fixtures = [
  { eventId:"a1", competitionId, season, kickoff:"2025-09-01T18:00:00.000Z", homeTeamId:"team-1", awayTeamId:"team-2", sourceId:"fixture-source" },
  { eventId:"a2", competitionId, season, kickoff:"2025-09-08T18:00:00.000Z", homeTeamId:"team-3", awayTeamId:"team-4", sourceId:"fixture-source" }
];
const results = fixtures.map(f => ({ eventId:f.eventId, resultAvailableAt:new Date(Date.parse(f.kickoff) + 7200000).toISOString() }));
const oddsSnapshots = fixtures.map(f => ({ eventId:f.eventId, marketId:"1x2", phase:"closing", capturedAt:new Date(Date.parse(f.kickoff) - 60000).toISOString(), decimalOdds:2 }));
const evidenceFor = (eventId, teamId, playerId, kind, status="confirmed", observedAt="2025-08-31T12:00:00.000Z") =>
  ({ eventId, teamId, playerId, kind, status, observedAt, competitionId, season, sourceId:"offline-fixture",
    ...(kind === "historical_stats" ? { sourceEventId:"prior-event", sourceEventKickoff:"2025-08-30T18:00:00.000Z", availableAt:"2025-08-30T20:00:00.000Z" } : {}) });
const completeEvidence = [
  evidenceFor("a1", "team-1", "p1", "lineup"),
  evidenceFor("a1", "team-1", "p1", "availability"),
  evidenceFor("a1", "team-1", "p1", "historical_stats"),
  evidenceFor("a2", "team-3", "p2", "lineup"),
  evidenceFor("a2", "team-3", "p2", "availability"),
  evidenceFor("a2", "team-3", "p2", "historical_stats")
];
const assess = overrides => assessWinFootballEvidenceCoverage({
  competitionId, season, fixtures, results, oddsSnapshots,
  requiredMarketIds:["1x2"], playerEvidence:completeEvidence, ...overrides
});

test("reports coverage only for the explicit synthetic input universe while withholding approvals", () => {
  const report = assess({});
  assert.deepEqual(report.coveragePct, { results:100, preKickoffOdds:100, teamIdentity:100, playerIdentity:100, lineup:100, availability:100, playerStats:100 });
  assert.equal(report.completeForResearch, false);
  assert.equal(report.trainingApprovalGranted, false);
  assert.equal(report.coverageScope, "explicit_synthetic_input_universe");
  assert.ok(report.fixtures.every(f => f.predictiveUseBlocked));
});

test("reports missing match and player evidence with exact blocked reasons", () => {
  const report = assess({ results:[results[0]], playerEvidence:completeEvidence.filter(e => e.eventId === "a1") });
  const second = report.fixtures.find(f => f.eventId === "a2");
  assert.equal(report.coveragePct.results, 50);
  assert.equal(report.coveragePct.playerStats, 50);
  assert.deepEqual(second?.blockedReasons, ["result_missing", "player_identity_missing", "lineup_missing", "availability_missing", "player_stats_missing"]);
});

test("rejects malformed, post-kickoff and out-of-order evidence timestamps", () => {
  const report = assess({ playerEvidence:[
    evidenceFor("a1", "team-1", "p1", "lineup", "confirmed", "not-a-time"),
    evidenceFor("a1", "team-1", "p1", "availability", "confirmed", fixtures[0].kickoff),
    evidenceFor("a1", "team-1", "p1", "historical_stats", "confirmed", "2025-09-01T19:00:00.000Z")
  ] });
  assert.equal(report.excludedEvidenceCount, 3);
  assert.ok(report.reasons.includes("player_evidence_timestamp_invalid:a1"));
  assert.ok(report.reasons.includes("post_kickoff_player_evidence_excluded:a1"));
  assert.equal(report.coveragePct.playerIdentity, 0);
});

test("blocks transfer or league changes from the selected competition-season", () => {
  const moved = evidenceFor("a1", "team-1", "p1", "lineup");
  moved.competitionId = "league-b";
  moved.season = "2026-27";
  const report = assess({ playerEvidence:[moved] });
  assert.ok(report.reasons.includes("transfer_or_league_context_mismatch:a1"));
  assert.equal(report.coveragePct.lineup, 0);
});

test("treats missing or multiple player IDs as ambiguous and unknown", () => {
  const unknown = evidenceFor("a1", "team-1", undefined, "lineup");
  const ambiguous = { ...evidenceFor("a2", "team-3", "p2", "lineup"), providerPlayerIds:["candidate-1", "candidate-2"] };
  const report = assess({ playerEvidence:[unknown, ambiguous] });
  assert.equal(report.excludedEvidenceCount, 2);
  assert.ok(report.reasons.includes("player_identity_ambiguous_or_untrusted:a1"));
  assert.ok(report.reasons.includes("player_identity_ambiguous_or_untrusted:a2"));
  assert.equal(report.coveragePct.playerIdentity, 0);
});

test("rejects results published before kickoff or for mismatched teams", () => {
  const report = assess({ results:[
    { eventId:"a1", resultAvailableAt:"2025-09-01T17:59:00.000Z", homeTeamId:"team-1", awayTeamId:"team-2" },
    { eventId:"a2", resultAvailableAt:"2025-09-08T20:00:00.000Z", homeTeamId:"wrong-team", awayTeamId:"team-4" }
  ] });
  assert.equal(report.coveragePct.results, 0);
  assert.ok(report.reasons.includes("result_before_kickoff_excluded:a1"));
  assert.ok(report.reasons.includes("result_team_mismatch:a2"));
});

test("detects duplicate fixtures, team mismatches and post-kickoff odds look-ahead", () => {
  const report = assess({
    fixtures:[...fixtures, { ...fixtures[0] }],
    oddsSnapshots:[...oddsSnapshots.slice(1), { eventId:"a1", marketId:"1x2", phase:"closing", capturedAt:fixtures[0].kickoff, decimalOdds:2 }],
    playerEvidence:[evidenceFor("a1", "wrong-team", "p1", "lineup")]
  });
  assert.ok(report.reasons.includes("duplicate_fixture:a1"));
  assert.equal(report.coveragePct.preKickoffOdds, 50);
  assert.ok(report.fixtures.find(f => f.eventId === "a1")?.blockedReasons.includes("pre_kickoff_odds_missing"));
  assert.equal(report.coveragePct.playerIdentity, 0);
});

test("keeps uncertain lineup and availability blocked from predictive use", () => {
  const report = assess({ playerEvidence:[
    evidenceFor("a1", "team-1", "p1", "lineup", "likely"),
    evidenceFor("a1", "team-1", "p1", "availability", "unknown")
  ] });
  const first = report.fixtures.find(f => f.eventId === "a1");
  assert.ok(first?.blockedReasons.includes("lineup_uncertain"));
  assert.ok(first?.blockedReasons.includes("availability_uncertain"));
  assert.equal(first?.predictiveUseBlocked, true);
});

test("reports missing provenance without inventing a source", () => {
  const report = assess({
    fixtures:[{ ...fixtures[0], sourceId:undefined }],
    results:[results[0]], oddsSnapshots:[oddsSnapshots[0]],
    playerEvidence:[{ ...evidenceFor("a1", "team-1", "p1", "lineup"), sourceId:undefined }]
  });
  assert.deepEqual(report.fixtures[0].missingSources, ["fixture_source_missing", "player_evidence_source_missing"]);
  assert.equal(report.completeForResearch, false);
});

test("same-event or future match stats cannot raise pre-match readiness", () => {
  const report = assess({ playerEvidence:[
    evidenceFor("a1", "team-1", "p1", "match_stats", "confirmed", "2025-08-31T12:00:00.000Z"),
    { ...evidenceFor("a2", "team-3", "p2", "historical_stats"), sourceEventKickoff:"2025-09-09T18:00:00.000Z", availableAt:"2025-09-09T20:00:00.000Z" }
  ] });
  assert.equal(report.coveragePct.playerStats, 0);
  assert.ok(report.reasons.includes("same_event_match_stats_not_pre_match_evidence:a1"));
  assert.ok(report.reasons.includes("historical_stats_provenance_invalid:a2"));
});

test("mixed canonical and provider identity requires an explicit trusted crosswalk", () => {
  const mixed = { ...evidenceFor("a1", "team-1", "canonical-p1", "lineup"), providerPlayerIds:["provider-p1"] };
  const blocked = assess({ playerEvidence:[mixed] });
  assert.equal(blocked.coveragePct.playerIdentity, 0);
  assert.ok(blocked.reasons.includes("player_identity_ambiguous_or_untrusted:a1"));

  const trusted = assess({ playerEvidence:[mixed], trustedIdentityCrosswalks:[
    { playerId:"canonical-p1", providerPlayerId:"provider-p1", sourceId:"reviewed-crosswalk" }
  ] });
  assert.equal(trusted.fixtures.find(f => f.eventId === "a1")?.playerIdentityCovered, true);
});

test("duplicate results make coverage ambiguous independent of input order", () => {
  const candidates = [
    { eventId:"a1", resultAvailableAt:"2025-09-01T20:00:00.000Z", homeTeamId:"team-1", awayTeamId:"team-2" },
    { eventId:"a1", resultAvailableAt:"2025-09-01T20:05:00.000Z", homeTeamId:"team-1", awayTeamId:"team-2" }
  ];
  for (const duplicates of [candidates, [...candidates].reverse()]) {
    const report = assess({ results:[...duplicates, results[1]] });
    assert.equal(report.coveragePct.results, 50);
    assert.equal(report.fixtures.find(f => f.eventId === "a1")?.resultCovered, false);
    assert.ok(report.reasons.includes("duplicate_result_ambiguous:a1"));
  }
});

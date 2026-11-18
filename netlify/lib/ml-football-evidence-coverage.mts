import {
  assessWinFootballCoverageByCompetitionSeason,
  type WinFootballSeasonOddsSnapshot
} from "./ml-football-season-coverage.mts";
import type { WinFootballCoverageResult } from "./ml-football-coverage-assessment.mts";
import { parseStrictIsoTimestamp } from "./strict-timestamp.mts";

export type WinFootballEvidenceFixture = {
  eventId: string;
  competitionId: string;
  season: string;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  sourceId?: string;
};

export type WinFootballPlayerEvidence = {
  eventId: string;
  teamId: string;
  playerId?: string;
  providerPlayerIds?: string[];
  kind: "lineup" | "availability" | "match_stats";
  observedAt: string;
  competitionId: string;
  season: string;
  status?: "confirmed" | "likely" | "unknown";
  sourceId?: string;
};

export type WinFootballEvidenceResult = WinFootballCoverageResult & {
  homeTeamId?: string;
  awayTeamId?: string;
};

export type WinFootballFixtureEvidenceCoverage = {
  eventId: string;
  resultCovered: boolean;
  preKickoffOddsCovered: boolean;
  teamIdentityCovered: boolean;
  playerIdentityCovered: boolean;
  lineupCovered: boolean;
  availabilityCovered: boolean;
  playerStatsCovered: boolean;
  predictiveUseBlocked: boolean;
  blockedReasons: string[];
  missingSources: string[];
};

export type WinFootballEvidenceCoverageReport = {
  competitionId: string;
  season: string;
  fixtureCount: number;
  coveragePct: {
    results: number;
    preKickoffOdds: number;
    teamIdentity: number;
    playerIdentity: number;
    lineup: number;
    availability: number;
    playerStats: number;
  };
  fixtures: WinFootballFixtureEvidenceCoverage[];
  excludedEvidenceCount: number;
  completeForResearch: false;
  trainingApprovalGranted: false;
  reasons: string[];
};

const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const pct = (covered: number, expected: number) =>
  expected === 0 ? 0 : Math.round((covered / expected) * 10000) / 100;

/**
 * Reconcile one explicitly selected competition-season from offline evidence.
 * The report is descriptive and fail-closed. Evidence with ambiguous identity,
 * malformed/post-kickoff timestamps or a different competition-season is
 * excluded rather than repaired, inferred or made available to prediction.
 */
export function assessWinFootballEvidenceCoverage(args: {
  competitionId: string;
  season: string;
  fixtures: WinFootballEvidenceFixture[];
  results: WinFootballEvidenceResult[];
  oddsSnapshots: WinFootballSeasonOddsSnapshot[];
  requiredMarketIds: string[];
  playerEvidence: WinFootballPlayerEvidence[];
}): WinFootballEvidenceCoverageReport {
  const competitionId = text(args?.competitionId) ? args.competitionId : "";
  const season = text(args?.season) ? args.season : "";
  const reasons: string[] = [];
  if (!competitionId || !season) reasons.push("competition_season_required");

  const suppliedFixtures = Array.isArray(args?.fixtures) ? args.fixtures : [];
  const selectedFixtures: WinFootballEvidenceFixture[] = [];
  const eventIds = new Set<string>();
  let excludedEvidenceCount = 0;
  for (const fixture of suppliedFixtures) {
    if (fixture?.competitionId !== competitionId || fixture?.season !== season) {
      excludedEvidenceCount++;
      reasons.push("fixture_outside_selected_competition_season");
      continue;
    }
    if (!text(fixture.eventId) || parseStrictIsoTimestamp(fixture.kickoff) === null ||
        !text(fixture.homeTeamId) || !text(fixture.awayTeamId) ||
        fixture.homeTeamId === fixture.awayTeamId) {
      excludedEvidenceCount++;
      reasons.push("fixture_identity_invalid");
      continue;
    }
    if (eventIds.has(fixture.eventId)) {
      excludedEvidenceCount++;
      reasons.push("duplicate_fixture:" + fixture.eventId);
      continue;
    }
    eventIds.add(fixture.eventId);
    selectedFixtures.push(fixture);
  }

  const fixtureByEvent = new Map(selectedFixtures.map(fixture => [fixture.eventId, fixture]));
  const validResults: WinFootballEvidenceResult[] = [];
  const resultEvents = new Set<string>();
  for (const result of Array.isArray(args?.results) ? args.results : []) {
    const fixture = fixtureByEvent.get(result?.eventId);
    const availableAt = parseStrictIsoTimestamp(result?.resultAvailableAt);
    const kickoff = fixture ? parseStrictIsoTimestamp(fixture.kickoff) : null;
    const teamsMatch = fixture &&
      (!text(result.homeTeamId) || result.homeTeamId === fixture.homeTeamId) &&
      (!text(result.awayTeamId) || result.awayTeamId === fixture.awayTeamId);
    if (!fixture || availableAt === null || kickoff === null || availableAt < kickoff ||
        !teamsMatch || resultEvents.has(result.eventId)) {
      excludedEvidenceCount++;
      if (!fixture) reasons.push("result_without_selected_fixture");
      else if (availableAt === null) reasons.push("result_timestamp_invalid:" + fixture.eventId);
      else if (kickoff !== null && availableAt < kickoff) reasons.push("result_before_kickoff_excluded:" + fixture.eventId);
      else if (!teamsMatch) reasons.push("result_team_mismatch:" + fixture.eventId);
      else reasons.push("duplicate_result:" + fixture.eventId);
      continue;
    }
    resultEvents.add(result.eventId);
    validResults.push(result);
  }

  const seasonCoverage = assessWinFootballCoverageByCompetitionSeason({
    fixtures: selectedFixtures,
    results: validResults,
    oddsSnapshots: Array.isArray(args?.oddsSnapshots) ? args.oddsSnapshots : [],
    requiredMarketIds: Array.isArray(args?.requiredMarketIds) ? args.requiredMarketIds : []
  });
  const group = seasonCoverage.groups.find(g =>
    g.competitionId === competitionId && g.season === season);

  const evidenceByEvent = new Map<string, WinFootballPlayerEvidence[]>();
  for (const evidence of Array.isArray(args?.playerEvidence) ? args.playerEvidence : []) {
    const fixture = selectedFixtures.find(item => item.eventId === evidence?.eventId);
    const observedAt = parseStrictIsoTimestamp(evidence?.observedAt);
    const kickoff = fixture ? parseStrictIsoTimestamp(fixture.kickoff) : null;
    const providerIds = Array.isArray(evidence?.providerPlayerIds)
      ? [...new Set(evidence.providerPlayerIds.filter(text))] : [];
    const identityKnown = text(evidence?.playerId) || providerIds.length === 1;
    const identityAmbiguous = providerIds.length > 1;
    if (!fixture || evidence?.competitionId !== competitionId || evidence?.season !== season ||
        !text(evidence?.teamId) ||
        (evidence.teamId !== fixture.homeTeamId && evidence.teamId !== fixture.awayTeamId) ||
        observedAt === null || kickoff === null || observedAt >= kickoff ||
        !["lineup", "availability", "match_stats"].includes(evidence?.kind) ||
        !identityKnown || identityAmbiguous) {
      excludedEvidenceCount++;
      if (!fixture) reasons.push("player_evidence_without_selected_fixture");
      else if (evidence?.competitionId !== competitionId || evidence?.season !== season)
        reasons.push("transfer_or_league_context_mismatch:" + fixture.eventId);
      else if (observedAt === null) reasons.push("player_evidence_timestamp_invalid:" + fixture.eventId);
      else if (kickoff !== null && observedAt >= kickoff) reasons.push("post_kickoff_player_evidence_excluded:" + fixture.eventId);
      else if (!identityKnown || identityAmbiguous) reasons.push("player_identity_ambiguous_or_unknown:" + fixture.eventId);
      else reasons.push("player_evidence_team_or_kind_invalid:" + fixture.eventId);
      continue;
    }
    if (!evidenceByEvent.has(fixture.eventId)) evidenceByEvent.set(fixture.eventId, []);
    evidenceByEvent.get(fixture.eventId)!.push(evidence);
  }

  const missingResults = new Set(group?.assessment.missingResultEventIds || selectedFixtures.map(f => f.eventId));
  const missingOdds = new Set((group?.assessment.missingPreKickoffOdds || [])
    .map(value => value.split("::")[0]));
  const fixtures = selectedFixtures.map(fixture => {
    const evidence = evidenceByEvent.get(fixture.eventId) || [];
    const playerIdentityCovered = evidence.length > 0;
    const lineup = evidence.filter(item => item.kind === "lineup");
    const availability = evidence.filter(item => item.kind === "availability");
    const playerStats = evidence.filter(item => item.kind === "match_stats");
    const lineupCovered = lineup.some(item => item.status === "confirmed");
    const availabilityCovered = availability.some(item => item.status === "confirmed");
    const playerStatsCovered = playerStats.length > 0;
    const resultCovered = !missingResults.has(fixture.eventId);
    const preKickoffOddsCovered = !missingOdds.has(fixture.eventId) &&
      (args.requiredMarketIds?.length || 0) > 0;
    const blockedReasons: string[] = [];
    if (!resultCovered) blockedReasons.push("result_missing");
    if (!preKickoffOddsCovered) blockedReasons.push("pre_kickoff_odds_missing");
    if (!playerIdentityCovered) blockedReasons.push("player_identity_missing");
    if (!lineupCovered) blockedReasons.push(lineup.length ? "lineup_uncertain" : "lineup_missing");
    if (!availabilityCovered) blockedReasons.push(availability.length ? "availability_uncertain" : "availability_missing");
    if (!playerStatsCovered) blockedReasons.push("player_stats_missing");
    const missingSources = [
      !text(fixture.sourceId) && "fixture_source_missing",
      evidence.some(item => !text(item.sourceId)) && "player_evidence_source_missing"
    ].filter(Boolean) as string[];
    blockedReasons.push(...missingSources);
    return {
      eventId: fixture.eventId,
      resultCovered,
      preKickoffOddsCovered,
      teamIdentityCovered: true,
      playerIdentityCovered,
      lineupCovered,
      availabilityCovered,
      playerStatsCovered,
      predictiveUseBlocked: true as const,
      blockedReasons: [...new Set(blockedReasons)],
      missingSources: [...new Set(missingSources)]
    };
  });

  const covered = (key: keyof WinFootballFixtureEvidenceCoverage) =>
    fixtures.filter(fixture => fixture[key] === true).length;
  reasons.push(...seasonCoverage.reasons);
  if (!selectedFixtures.length) reasons.push("selected_fixture_universe_empty");
  if (fixtures.some(f => f.blockedReasons.length)) reasons.push("predictive_use_blocked_by_incomplete_or_uncertain_evidence");
  return {
    competitionId, season, fixtureCount: fixtures.length,
    coveragePct: {
      results: pct(covered("resultCovered"), fixtures.length),
      preKickoffOdds: pct(covered("preKickoffOddsCovered"), fixtures.length),
      teamIdentity: pct(covered("teamIdentityCovered"), fixtures.length),
      playerIdentity: pct(covered("playerIdentityCovered"), fixtures.length),
      lineup: pct(covered("lineupCovered"), fixtures.length),
      availability: pct(covered("availabilityCovered"), fixtures.length),
      playerStats: pct(covered("playerStatsCovered"), fixtures.length)
    },
    fixtures, excludedEvidenceCount,
    completeForResearch: false,
    trainingApprovalGranted: false,
    reasons: [...new Set(reasons)]
  };
}

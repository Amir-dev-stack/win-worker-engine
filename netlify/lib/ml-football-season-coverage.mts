import {
  assessWinFootballHistoricalCoverage,
  type WinFootballCoverageFixture,
  type WinFootballCoverageResult,
  type WinFootballCoverageOddsSnapshot
} from "./ml-football-coverage-assessment.mts";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export type WinFootballSeasonFixture = WinFootballCoverageFixture & {
  competitionId: string;
  season: string;
};
export type WinFootballSeasonOddsSnapshot = WinFootballCoverageOddsSnapshot & {
  phase?: "opening" | "intermediate" | "closing";
};
export type WinFootballSeasonCoverageGroup = {
  competitionId: string;
  season: string;
  assessment: ReturnType<typeof assessWinFootballHistoricalCoverage>;
  phaseCoverage: {
    opening: { coveredEventMarkets: number; missingEventMarkets: string[] };
    intermediate: { coveredEventMarkets: number; missingEventMarkets: string[] };
    closing: { coveredEventMarkets: number; missingEventMarkets: string[] };
  };
};
export type WinFootballSeasonCoverageReport = {
  groups: WinFootballSeasonCoverageGroup[];
  invalidFixtureCount: number;
  unassignedResultCount: number;
  unassignedOddsSnapshotCount: number;
  completeForResearch: false;
  trainingApprovalGranted: false;
  reasons: string[];
};

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Group historical football coverage by explicit competition and season keys.
 * Opening/intermediate/closing are counted only when the source explicitly labels
 * the snapshot phase; timestamps alone are not used to invent market semantics.
 * This remains a coverage report, never a source or training approval.
 */
export function assessWinFootballCoverageByCompetitionSeason(args: {
  fixtures: WinFootballSeasonFixture[];
  results: WinFootballCoverageResult[];
  oddsSnapshots: WinFootballSeasonOddsSnapshot[];
  requiredMarketIds: string[];
}): WinFootballSeasonCoverageReport {
  const reasons: string[] = [];
  const validFixtures: WinFootballSeasonFixture[] = [];
  let invalidFixtureCount = 0;
  const fixtureKeys = new Set<string>();
  const fixtureGroups = new Map<string, WinFootballSeasonFixture[]>();
  for (const fixture of Array.isArray(args?.fixtures) ? args.fixtures : []) {
    if (!nonEmpty(fixture?.competitionId) || !nonEmpty(fixture?.season) ||
        !nonEmpty(fixture?.eventId) || !isStrictIsoTimestamp(fixture?.kickoff)) {
      invalidFixtureCount++;
      reasons.push("fixture_competition_season_or_kickoff_invalid");
      continue;
    }
    const key = fixture.competitionId + "::" + fixture.season;
    const unique = key + "::" + fixture.eventId;
    if (fixtureKeys.has(unique)) {
      invalidFixtureCount++;
      reasons.push("duplicate_fixture:" + unique);
      continue;
    }
    fixtureKeys.add(unique);
    validFixtures.push(fixture);
    if (!fixtureGroups.has(key)) fixtureGroups.set(key, []);
    fixtureGroups.get(key)!.push(fixture);
  }

  const fixtureGroupByEvent = new Map<string, string>();
  for (const fixture of validFixtures) {
    if (fixtureGroupByEvent.has(fixture.eventId)) {
      reasons.push("event_id_reused_across_competition_or_season:" + fixture.eventId);
      fixtureGroupByEvent.delete(fixture.eventId);
    } else if (!reasons.includes("event_id_reused_across_competition_or_season:" + fixture.eventId)) {
      fixtureGroupByEvent.set(fixture.eventId, fixture.competitionId + "::" + fixture.season);
    }
  }

  const resultsByGroup = new Map<string, WinFootballCoverageResult[]>();
  let unassignedResultCount = 0;
  for (const result of Array.isArray(args?.results) ? args.results : []) {
    const group = fixtureGroupByEvent.get(result?.eventId);
    if (!group) { unassignedResultCount++; continue; }
    if (!resultsByGroup.has(group)) resultsByGroup.set(group, []);
    resultsByGroup.get(group)!.push(result);
  }

  const oddsByGroup = new Map<string, WinFootballSeasonOddsSnapshot[]>();
  let unassignedOddsSnapshotCount = 0;
  for (const snapshot of Array.isArray(args?.oddsSnapshots) ? args.oddsSnapshots : []) {
    const group = fixtureGroupByEvent.get(snapshot?.eventId);
    if (!group) { unassignedOddsSnapshotCount++; continue; }
    if (!oddsByGroup.has(group)) oddsByGroup.set(group, []);
    oddsByGroup.get(group)!.push(snapshot);
  }

  const markets = Array.isArray(args?.requiredMarketIds) ? args.requiredMarketIds : [];
  const groups: WinFootballSeasonCoverageGroup[] = [];
  for (const [key, fixtures] of fixtureGroups) {
    const [competitionId, season] = key.split("::");
    const groupResults = resultsByGroup.get(key) || [];
    const groupOdds = oddsByGroup.get(key) || [];
    const assessment = assessWinFootballHistoricalCoverage({
      fixtures, results: groupResults, oddsSnapshots: groupOdds, requiredMarketIds: markets
    });
    const phaseCoverage = {} as WinFootballSeasonCoverageGroup["phaseCoverage"];
    for (const phase of ["opening", "intermediate", "closing"] as const) {
      const observed = new Set(groupOdds.filter(s => s.phase === phase &&
        isStrictIsoTimestamp(s.capturedAt) &&
        Date.parse(s.capturedAt) < Date.parse(fixtures.find(f => f.eventId === s.eventId)!.kickoff) &&
        markets.includes(s.marketId) && Number.isFinite(s.decimalOdds) && s.decimalOdds > 1)
        .map(s => s.eventId + "::" + s.marketId));
      const expected = fixtures.flatMap(f => markets.map(m => f.eventId + "::" + m));
      phaseCoverage[phase] = {
        coveredEventMarkets: observed.size,
        missingEventMarkets: expected.filter(id => !observed.has(id)).sort()
      };
    }
    groups.push({ competitionId, season, assessment, phaseCoverage });
  }
  groups.sort((a, b) => a.competitionId.localeCompare(b.competitionId) || a.season.localeCompare(b.season));
  if (invalidFixtureCount) reasons.push("invalid_fixtures_excluded");
  if (unassignedResultCount) reasons.push("results_without_unique_fixture_group");
  if (unassignedOddsSnapshotCount) reasons.push("odds_without_unique_fixture_group");
  return {
    groups, invalidFixtureCount, unassignedResultCount, unassignedOddsSnapshotCount,
    completeForResearch: false, trainingApprovalGranted: false,
    reasons: [...new Set(reasons)]
  };
}

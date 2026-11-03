import { list } from "./store.mts";
import { SPORT_REGISTRY } from "./sport-registry.mts";

type Evidence = Record<string, any>;
const REQUIRED_DOMAINS = [
  { id: "fixtures", label: "Fixtures & event identity", pattern: /fixture|schedule|event|kick.?off|start.?time/ },
  { id: "results", label: "Results & outcomes", pattern: /result|score|outcome|settlement/ },
  { id: "odds", label: "Odds & prices", pattern: /odds|price|line|closing.?line|market.?price/ },
  { id: "lineups", label: "Lineups & participation", pattern: /line.?up|starting|roster|participant|availability/ },
  { id: "injuries", label: "Injuries & suspensions", pattern: /injur|suspension|fitness|medical/ },
  { id: "team_player_stats", label: "Team & player statistics", pattern: /stat|metric|performance|player|team|form|xg|corner|card|shot/ },
  { id: "market_rules", label: "Market & settlement rules", pattern: /settlement.?rule|market.?rule|void|push|dead.?heat|extra.?time/ }
] as const;
const FRESHNESS_MS: Record<string, number> = {
  fixtures: 24 * 60 * 60 * 1000,
  results: 48 * 60 * 60 * 1000,
  odds: 15 * 60 * 1000,
  lineups: 8 * 60 * 60 * 1000,
  injuries: 24 * 60 * 60 * 1000,
  team_player_stats: 7 * 24 * 60 * 60 * 1000,
  market_rules: 365 * 24 * 60 * 60 * 1000
};
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const timestamp = (v: unknown) => {
  const n = Date.parse(clean(v));
  return Number.isFinite(n) ? n : null;
};
const classify = (record: Evidence) => {
  const text = [record.domain, record.metric, record.dataType].map(clean).join(" ").toLowerCase();
  return REQUIRED_DOMAINS.find(domain => domain.pattern.test(text))?.id || "other";
};

export async function buildCoverageReport(now = new Date()) {
  const [evidence, coupons, imports, simulations, backtests, learning, strategies, results] = await Promise.all([
    list<Evidence>("library/research-evidence", 5000),
    list<Evidence>("library/coupons", 3000),
    list<Evidence>("library/tipster-imports", 2000),
    list<Evidence>("library/simulation-runs", 1000),
    list<Evidence>("library/backtest-runs", 1000),
    list<Evidence>("library/learning-cycles", 1000),
    list<Evidence>("library/strategy-candidates", 1000),
    list<Evidence>("library/settled-results", 2000)
  ]);
  const observedSports = new Set(evidence.map(x => clean(x.sport).toLowerCase()).filter(Boolean));
  for (const row of [...coupons, ...simulations, ...backtests]) {
    const sport = clean(row.sport || row.brief?.sport).toLowerCase();
    if (sport) observedSports.add(sport);
  }
  const domainRows = REQUIRED_DOMAINS.map(domain => {
    const rows = evidence.filter(item => classify(item) === domain.id);
    const times = rows.map(item => timestamp(item.retrievedAt || item.updatedAt || item.createdAt)).filter((x): x is number => x !== null);
    const latest = times.length ? Math.max(...times) : null;
    const ageMs = latest === null ? null : Math.max(0, now.getTime() - latest);
    const staleAfterMs = FRESHNESS_MS[domain.id];
    return {
      id: domain.id, label: domain.label, records: rows.length,
      latestRetrievedAt: latest === null ? null : new Date(latest).toISOString(),
      freshnessLimitHours: Math.round(staleAfterMs / 3600000),
      status: !rows.length ? "not_observed" : ageMs === null || ageMs > staleAfterMs ? "stale_or_undated" : "fresh"
    };
  });
  const sports = SPORT_REGISTRY.map(sport => {
    const rows = evidence.filter(item => clean(item.sport).toLowerCase() === sport.id);
    const domains = REQUIRED_DOMAINS.map(domain => {
      const matching = rows.filter(item => classify(item) === domain.id);
      const latest = matching.map(item => timestamp(item.retrievedAt || item.updatedAt || item.createdAt)).filter((x): x is number => x !== null);
      const last = latest.length ? Math.max(...latest) : null;
      const stale = last === null || now.getTime() - last > FRESHNESS_MS[domain.id];
      return { id: domain.id, records: matching.length, latestRetrievedAt: last === null ? null : new Date(last).toISOString(), status: !matching.length ? "not_observed" : stale ? "stale_or_undated" : "fresh" };
    });
    return {
      sportId: sport.id, sport: sport.label,
      evidenceRecords: rows.length,
      observedDomains: domains.filter(x => x.records > 0).length,
      requiredDomains: domains.length,
      status: rows.length === 0 ? "no_evidence" : domains.every(x => x.status === "fresh") ? "fresh_coverage_snapshot" : "partial_or_stale",
      domains
    };
  });
  const outcomeCounts = coupons.reduce((acc: Record<string, number>, item) => {
    const key = clean(item.outcome || "unknown").toLowerCase() || "unknown";
    acc[key] = (acc[key] || 0) + 1; return acc;
  }, {});
  const sourceCounts = imports.reduce((acc: Record<string, number>, item) => {
    const key = clean(item.sourceId || "unknown");
    acc[key] = (acc[key] || 0) + 1; return acc;
  }, {});
  return {
    generatedAt: now.toISOString(),
    evidence: { total: evidence.length, observedSports: [...observedSports].sort(), domains: domainRows },
    sports,
    humanIntelligence: {
      importedSourceRecords: imports.length, sourceCounts,
      coupons: coupons.filter(x => x.origin === "human").length,
      outcomes: outcomeCounts,
      warning: "A source registry entry or imported post does not prove live feed access, complete historical coverage or verified tipster profitability."
    },
    experiments: {
      simulationRuns: simulations.length, backtestRuns: backtests.length,
      learningCycles: learning.length, strategyCandidates: strategies.length,
      settledResultRecords: results.length
    },
    limitations: [
      "Coverage is calculated only from records actually stored in WIN; missing records are not inferred.",
      "Freshness windows are monitoring thresholds, not guarantees that the underlying source is correct.",
      "A registry entry is not a connected provider. Live API access and historical data rights must be verified separately.",
      "No strategy is considered validated solely because a simulation or a candidate lesson exists."
    ]
  };
}

export async function saveCoverageSnapshot() {
  const report = await buildCoverageReport();
  const id = report.generatedAt.replace(/[:.]/g, "-");
  await (await import("./store.mts")).put("library/coverage-snapshots", id, { id, ...report });
  await (await import("./store.mts")).put("scheduler-state", "coverage-monitor", {
    lastCheckedAt: report.generatedAt, snapshotId: id, status: "completed",
    evidenceRecords: report.evidence.total, sportsWithEvidence: report.sports.filter(x => x.evidenceRecords > 0).length
  });
  return { snapshotId: id, generatedAt: report.generatedAt, evidenceRecords: report.evidence.total, sportsWithEvidence: report.sports.filter(x => x.evidenceRecords > 0).length };
}

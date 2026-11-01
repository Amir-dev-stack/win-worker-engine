import { put } from "./store.mts";

type HistoricalSelection = {
  id: string;
  eventId: string;
  event: string;
  sport: string;
  country?: string;
  competition?: string;
  market: string;
  pick: string;
  odds: number;
  result: "won" | "lost" | "void";
  eventStart: string;
  oddsCapturedAt: string;
  oddsSource: string;
  resultSource: string;
  predictedProbability?: number;
  closingOdds?: number;
};

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validateSelections(raw: unknown): HistoricalSelection[] {
  if (!Array.isArray(raw) || raw.length < 10 || raw.length > 10000) {
    throw new Error("Provide 10–10,000 historical selections with pre-event odds and independently settled results.");
  }
  const ids = new Set<string>();
  return raw.map((item: any, index: number) => {
    const row: HistoricalSelection = {
      id: clean(item?.id, 180) || "selection-" + (index + 1),
      eventId: clean(item?.eventId, 180),
      event: clean(item?.event, 250),
      sport: clean(item?.sport, 100),
      country: clean(item?.country, 100) || undefined,
      competition: clean(item?.competition, 200) || undefined,
      market: clean(item?.market, 180),
      pick: clean(item?.pick, 180),
      odds: Number(item?.odds),
      result: item?.result,
      eventStart: clean(item?.eventStart, 100),
      oddsCapturedAt: clean(item?.oddsCapturedAt, 100),
      oddsSource: clean(item?.oddsSource, 1000),
      resultSource: clean(item?.resultSource, 1000),
      predictedProbability: item?.predictedProbability === undefined ? undefined : Number(item.predictedProbability),
      closingOdds: item?.closingOdds === undefined ? undefined : Number(item.closingOdds)
    };
    if (!row.eventId || !row.event || !row.sport || !row.market || !row.pick ||
        !Number.isFinite(row.odds) || row.odds <= 1 ||
        !["won", "lost", "void"].includes(row.result) ||
        !row.eventStart || !row.oddsCapturedAt || !row.oddsSource || !row.resultSource) {
      throw new Error("Selection " + (index + 1) + " is missing a required event, market, odds, result, timestamp or provenance field.");
    }
    const start = Date.parse(row.eventStart);
    const captured = Date.parse(row.oddsCapturedAt);
    if (!Number.isFinite(start) || !Number.isFinite(captured) || captured >= start) {
      throw new Error("Odds capture must be a valid timestamp strictly before event start for selection " + row.id + ".");
    }
    if (row.predictedProbability !== undefined &&
        (!Number.isFinite(row.predictedProbability) || row.predictedProbability < 0 || row.predictedProbability > 1)) {
      throw new Error("predictedProbability must be between 0 and 1 for selection " + row.id + ".");
    }
    if (row.closingOdds !== undefined && (!Number.isFinite(row.closingOdds) || row.closingOdds <= 1)) {
      throw new Error("closingOdds must be greater than 1 for selection " + row.id + ".");
    }
    if (ids.has(row.id)) throw new Error("Duplicate selection id: " + row.id);
    ids.add(row.id);
    return row;
  });
}

function wilsonInterval(wins: number, count: number) {
  if (!count) return { lower: null, upper: null };
  const z = 1.96;
  const p = wins / count;
  const denominator = 1 + z * z / count;
  const centre = p + z * z / (2 * count);
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count);
  return {
    lower: Number(Math.max(0, (centre - margin) / denominator).toFixed(4)),
    upper: Number(Math.min(1, (centre + margin) / denominator).toFixed(4))
  };
}

function metrics(rows: HistoricalSelection[]) {
  const decided = rows.filter(row => row.result !== "void");
  const wins = decided.filter(row => row.result === "won").length;
  const losses = decided.length - wins;
  const profit = decided.reduce((sum, row) => sum + (row.result === "won" ? row.odds - 1 : -1), 0);
  const probabilities = decided.filter(row => row.predictedProbability !== undefined);
  const brier = probabilities.length
    ? probabilities.reduce((sum, row) => sum + Math.pow((row.predictedProbability as number) - (row.result === "won" ? 1 : 0), 2), 0) / probabilities.length
    : null;
  const closing = rows.filter(row => row.result !== "void" && row.closingOdds !== undefined);
  const closeMove = closing.length
    ? closing.reduce((sum, row) => sum + (1 / (row.closingOdds as number) - 1 / row.odds), 0) / closing.length
    : null;
  const interval = wilsonInterval(wins, decided.length);
  return {
    selections: rows.length,
    decided: decided.length,
    voids: rows.length - decided.length,
    wins,
    losses,
    hitRate: decided.length ? Number((wins / decided.length).toFixed(4)) : null,
    hitRate95Wilson: interval,
    averageOdds: decided.length ? Number((decided.reduce((sum, row) => sum + row.odds, 0) / decided.length).toFixed(4)) : null,
    flatStakeProfitUnits: Number(profit.toFixed(4)),
    flatStakeRoi: decided.length ? Number((profit / decided.length).toFixed(4)) : null,
    predictedProbabilityCoverage: decided.length ? Number((probabilities.length / decided.length).toFixed(4)) : 0,
    brierScore: brier === null ? null : Number(brier.toFixed(5)),
    closingPriceCoverage: decided.length ? Number((closing.length / decided.length).toFixed(4)) : 0,
    averageClosingImpliedProbabilityMove: closeMove === null ? null : Number(closeMove.toFixed(5))
  };
}

export async function runStrategyBacktest(input: any) {
  const all = validateSelections(input?.selections);
  const filters = input?.filters && typeof input.filters === "object" ? input.filters : {};
  const allowedSports = Array.isArray(filters.sports) ? filters.sports.map((x: unknown) => clean(x, 100).toLowerCase()) : [];
  const allowedCountries = Array.isArray(filters.countries) ? filters.countries.map((x: unknown) => clean(x, 100).toLowerCase()) : [];
  const allowedCompetitions = Array.isArray(filters.competitions) ? filters.competitions.map((x: unknown) => clean(x, 200).toLowerCase()) : [];
  const allowedMarkets = Array.isArray(filters.markets) ? filters.markets.map((x: unknown) => clean(x, 180).toLowerCase()) : [];
  const minOdds = filters.minOdds === undefined ? 1.000001 : Number(filters.minOdds);
  const maxOdds = filters.maxOdds === undefined ? Number.POSITIVE_INFINITY : Number(filters.maxOdds);
  if (!Number.isFinite(minOdds) || minOdds <= 1 || !(Number.isFinite(maxOdds) || maxOdds === Number.POSITIVE_INFINITY) || maxOdds < minOdds) {
    throw new Error("Odds filters must define a valid range above 1.");
  }
  const filtered = all.filter(row =>
    (!allowedSports.length || allowedSports.includes(row.sport.toLowerCase())) &&
    (!allowedCountries.length || allowedCountries.includes((row.country || "").toLowerCase())) &&
    (!allowedCompetitions.length || allowedCompetitions.includes((row.competition || "").toLowerCase())) &&
    (!allowedMarkets.length || allowedMarkets.includes(row.market.toLowerCase())) &&
    row.odds >= minOdds && row.odds <= maxOdds
  ).sort((a, b) => Date.parse(a.eventStart) - Date.parse(b.eventStart) || Date.parse(a.oddsCapturedAt) - Date.parse(b.oddsCapturedAt));

  // Keep one observation per event so repeated picks from the same match do not inflate the sample.
  const seenEvents = new Set<string>();
  const eligible: HistoricalSelection[] = [];
  let duplicateEventsExcluded = 0;
  for (const row of filtered) {
    if (seenEvents.has(row.eventId)) { duplicateEventsExcluded++; continue; }
    seenEvents.add(row.eventId);
    eligible.push(row);
  }
  if (eligible.length < 10) {
    throw new Error("The selected strategy filters leave fewer than 10 unique events. Broaden the filters or provide more historical data.");
  }

  const trainEnd = Math.max(1, Math.floor(eligible.length * 0.6));
  const validationEnd = Math.max(trainEnd + 1, Math.floor(eligible.length * 0.8));
  if (validationEnd >= eligible.length) throw new Error("At least 10 unique events are required to create non-empty chronological training, validation and holdout periods.");
  const training = eligible.slice(0, trainEnd);
  const validation = eligible.slice(trainEnd, validationEnd);
  const holdout = eligible.slice(validationEnd);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const result = {
    id,
    strategyName: clean(input?.strategyName, 200) || "User-defined historical strategy",
    strategyHypothesis: clean(input?.strategyHypothesis, 3000) || null,
    filters: { sports: allowedSports, countries: allowedCountries, competitions: allowedCompetitions, markets: allowedMarkets, minOdds, maxOdds: Number.isFinite(maxOdds) ? maxOdds : null },
    status: "completed",
    evidenceStatus: "historically_tested_not_validated",
    createdAt,
    dataIntegrity: {
      inputSelections: all.length,
      matchedSelectionsBeforeEventDeduplication: filtered.length,
      eligibleUniqueEvents: eligible.length,
      duplicateEventsExcluded,
      everyOddsTimestampPreEvent: true,
      sourceProvenanceRequired: true,
      sourceReferencesIndependentlyVerified: false,
      chronologicalSplit: true
    },
    timeWindows: {
      training: { from: training[0].eventStart, to: training[training.length - 1].eventStart },
      validation: { from: validation[0].eventStart, to: validation[validation.length - 1].eventStart },
      holdout: { from: holdout[0].eventStart, to: holdout[holdout.length - 1].eventStart }
    },
    sampleSplits: {
      training: metrics(training),
      validation: metrics(validation),
      holdout: metrics(holdout),
      allEligible: metrics(eligible)
    },
    limitations: [
      "This is a retrospective, chronological test of a fixed, user-defined filter; it does not discover or prove a predictive edge.",
      "The strategy was not tuned on the holdout by this function, but the caller may have selected filters after seeing outcomes; record that risk.",
      "ROI assumes one flat unit per decided selection, ignores commission, taxes, stake limits, price movement and bookmaker acceptance.",
      "Hit-rate confidence intervals do not establish future performance; small samples remain highly uncertain.",
      "Void selections are excluded from hit rate and ROI denominators and reported separately.",
      "Only one selection per event is counted to reduce within-event dependence; cross-event correlations are not modelled."
    ]
  };
  await put("library/backtest-runs", id, result);
  await put("library/backtest-datasets", id, { id, runId: id, selections: eligible, createdAt });
  return result;
}

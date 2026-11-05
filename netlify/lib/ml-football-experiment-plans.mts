import {
  evaluateWinMLDatasetReadiness,
  type WinMLDatasetManifestV1
} from "./ml-data-contract.mts";

export const WIN_ML_EXPERIMENT_PLAN_VERSION = "win.ml.experiment.plan.v1" as const;

export type WinMLExperimentPlan = {
  planVersion: typeof WIN_ML_EXPERIMENT_PLAN_VERSION;
  experimentId: string;
  sport: "association_football";
  market: "1x2" | "total_goals";
  algorithm: "logistic_regression" | "poisson_attack_defence";
  featureSchemaVersion: string;
  targetDefinition: string;
  seed: number;
  chronologicalSplit: { training: 70; validation: 15; test: 15 };
  minimumRows: { training: number; validation: number; test: number };
  training: Record<string, number>;
  fittingAllowed: false;
};

export const WIN_FOOTBALL_1X2_LOGISTIC_PLAN: WinMLExperimentPlan = Object.freeze({
  planVersion: WIN_ML_EXPERIMENT_PLAN_VERSION,
  experimentId: "football-1x2-logistic-form-v1",
  sport: "association_football",
  market: "1x2",
  algorithm: "logistic_regression",
  featureSchemaVersion: "win.football.form.v1",
  targetDefinition: "full_time_1x2_official_settlement",
  seed: 20261105,
  chronologicalSplit: { training: 70, validation: 15, test: 15 },
  minimumRows: { training: 500, validation: 100, test: 100 },
  training: { learningRate: 0.03, epochs: 800, l2: 0.001, batchSize: 64 },
  fittingAllowed: false
});

export const WIN_FOOTBALL_TOTAL_GOALS_POISSON_PLAN: WinMLExperimentPlan = Object.freeze({
  planVersion: WIN_ML_EXPERIMENT_PLAN_VERSION,
  experimentId: "football-total-goals-poisson-attack-defence-v1",
  sport: "association_football",
  market: "total_goals",
  algorithm: "poisson_attack_defence",
  featureSchemaVersion: "win.football.form.v1",
  targetDefinition: "full_time_total_goals_with_explicit_over_under_line_settlement",
  seed: 20261105,
  chronologicalSplit: { training: 70, validation: 15, test: 15 },
  minimumRows: { training: 500, validation: 100, test: 100 },
  training: { learningRate: 0.01, epochs: 1200, l2: 0.01, homeAdvantage: 1 },
  fittingAllowed: false
});

/** Preflight only. It never fits a model or changes a dataset's permission. */
export function preflightWinMLExperiment(
  manifest: WinMLDatasetManifestV1,
  plan: WinMLExperimentPlan,
  candidateRows: number
) {
  const readiness = evaluateWinMLDatasetReadiness(manifest);
  const reasons = [...readiness.reasons];
  if (manifest.sport !== plan.sport) reasons.push("experiment_sport_mismatch");
  if (manifest.rowGrain !== "match") reasons.push("experiment_requires_match_level_rows");
  if (!Number.isSafeInteger(candidateRows) || candidateRows < 1) reasons.push("candidate_rows_missing");
  if (candidateRows < plan.minimumRows.training + plan.minimumRows.validation + plan.minimumRows.test) {
    reasons.push("candidate_rows_below_experiment_minimum");
  }
  return {
    experimentId: plan.experimentId,
    algorithm: plan.algorithm,
    status: reasons.length ? "blocked" : "eligible_for_separate_owner_approved_fit",
    fittingAllowed: false,
    reasons: [...new Set(reasons)],
    warning: "Preflight does not train a model. A separate explicit training action and reproducible execution environment are required."
  };
}

export type WinMLChronologicalExample = {
  eventId: string;
  eventStart: string;
  predictionCutoff: string;
};

/**
 * Stable chronological 70/15/15 split. Equal kickoff timestamps are never
 * split across partitions; the exact sorted event IDs are returned for audit.
 */
export function splitWinMLExamplesChronologically<T extends WinMLChronologicalExample>(examples: T[]) {
  if (!Array.isArray(examples) || examples.length < 3) {
    throw new Error("chronological_split_requires_at_least_three_examples");
  }
  const seen = new Set<string>();
  const sorted = [...examples].sort((a, b) =>
    Date.parse(a.eventStart) - Date.parse(b.eventStart) || a.eventId.localeCompare(b.eventId));
  for (const item of sorted) {
    if (!item || typeof item.eventId !== "string" || !item.eventId.trim() ||
        seen.has(item.eventId) || !Number.isFinite(Date.parse(item.eventStart)) ||
        !Number.isFinite(Date.parse(item.predictionCutoff)) ||
        Date.parse(item.predictionCutoff) >= Date.parse(item.eventStart)) {
      throw new Error("chronological_split_example_invalid");
    }
    seen.add(item.eventId);
  }
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (!last || Date.parse(last[0].eventStart) !== Date.parse(item.eventStart)) groups.push([item]);
    else last.push(item);
  }
  if (groups.length < 3) {
    throw new Error("chronological_split_requires_three_distinct_time_groups");
  }
  const prefix: number[] = [0];
  for (const group of groups) prefix.push(prefix[prefix.length - 1] + group.length);
  let best: { trainEndGroup: number; validationEndGroup: number; score: number } | null = null;
  for (let trainEndGroup = 1; trainEndGroup <= groups.length - 2; trainEndGroup++) {
    for (let validationEndGroup = trainEndGroup + 1; validationEndGroup <= groups.length - 1; validationEndGroup++) {
      const trainRows = prefix[trainEndGroup];
      const validationRows = prefix[validationEndGroup];
      const score = Math.abs(trainRows - sorted.length * 0.70) +
        Math.abs(validationRows - sorted.length * 0.85);
      if (!best || score < best.score) best = { trainEndGroup, validationEndGroup, score };
    }
  }
  if (!best) throw new Error("chronological_split_partition_empty");
  const trainEnd = prefix[best.trainEndGroup];
  const validationEnd = prefix[best.validationEndGroup];
  const training = sorted.slice(0, trainEnd);
  const validation = sorted.slice(trainEnd, validationEnd);
  const test = sorted.slice(validationEnd);
  return {
    training, validation, test,
    eventIds: {
      training: training.map(item => item.eventId),
      validation: validation.map(item => item.eventId),
      test: test.map(item => item.eventId)
    },
    boundaries: {
      trainingEndsAt: training[training.length - 1].eventStart,
      validationStartsAt: validation[0].eventStart,
      validationEndsAt: validation[validation.length - 1].eventStart,
      testStartsAt: test[0].eventStart
    }
  };
}

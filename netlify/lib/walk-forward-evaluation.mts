import { createHash } from "node:crypto";

import {
  validatePredictionLedgerBatch,
  type OutcomeLedgerEntry,
  type PredictionLedgerEntry
} from "./prediction-ledger-envelope.mts";

export type WalkForwardFoldDraft = {
  foldId: string;
  trainingCutoff: string;
  evaluationStart: string;
  evaluationEnd: string;
};

export type WalkForwardEvaluationOptions = {
  evaluationAsOf: string;
  folds: readonly WalkForwardFoldDraft[];
  embargoMilliseconds: number;
  calibrationBins: number;
  minimumScoredSamples: number;
  maxRecords: number;
};

type EvaluationDiagnostic =
  | "CONFLICTING_OUTCOME"
  | "INVALID_LEDGER_RECORD"
  | "MISSING_OUTCOME"
  | "MODEL_TRAINING_LEAKAGE"
  | "OUTCOME_AFTER_AS_OF"
  | "OUTSIDE_EVALUATION_WINDOW";

type ScoredObservation = {
  prediction: PredictionLedgerEntry;
  foldId: string;
  target: 0 | 1;
  outcomeEvidenceCount: number;
};

const SCHEMA_VERSION = "win.walk-forward-evaluation.v1" as const;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

function instant(value: unknown) {
  if (typeof value !== "string") return null;
  const match = ISO_INSTANT.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Evaluation numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Evaluation values must be JSON-compatible");
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function normalizedOptions(options: WalkForwardEvaluationOptions) {
  const evaluationAsOfMs = instant(options?.evaluationAsOf);
  if (evaluationAsOfMs === null) throw new TypeError("Invalid evaluation as-of instant");
  if (!Number.isSafeInteger(options?.embargoMilliseconds) || options.embargoMilliseconds < 0 || options.embargoMilliseconds > 31_536_000_000) throw new TypeError("Invalid evaluation embargo");
  if (!Number.isSafeInteger(options?.calibrationBins) || options.calibrationBins < 2 || options.calibrationBins > 20) throw new TypeError("Invalid calibration bin count");
  if (!Number.isSafeInteger(options?.minimumScoredSamples) || options.minimumScoredSamples < 2 || options.minimumScoredSamples > 500) throw new TypeError("Invalid minimum scored sample count");
  if (!Number.isSafeInteger(options?.maxRecords) || options.maxRecords < 1 || options.maxRecords > 500) throw new TypeError("Invalid evaluation record limit");
  if (!Array.isArray(options?.folds) || options.folds.length < 1 || options.folds.length > 50) throw new TypeError("Invalid evaluation folds");

  const folds = options.folds.map(fold => {
    if (!fold || typeof fold !== "object" || !SAFE_ID.test(String(fold.foldId))) throw new TypeError("Invalid evaluation fold identity");
    const trainingCutoffMs = instant(fold.trainingCutoff);
    const evaluationStartMs = instant(fold.evaluationStart);
    const evaluationEndMs = instant(fold.evaluationEnd);
    if (trainingCutoffMs === null || evaluationStartMs === null || evaluationEndMs === null || trainingCutoffMs + options.embargoMilliseconds > evaluationStartMs || evaluationStartMs >= evaluationEndMs || evaluationEndMs > evaluationAsOfMs) throw new TypeError("Invalid evaluation fold chronology");
    return { foldId: fold.foldId, trainingCutoff: fold.trainingCutoff, evaluationStart: fold.evaluationStart, evaluationEnd: fold.evaluationEnd, trainingCutoffMs, evaluationStartMs, evaluationEndMs };
  }).sort((left, right) => left.evaluationStartMs - right.evaluationStartMs || left.foldId.localeCompare(right.foldId));

  if (new Set(folds.map(fold => fold.foldId)).size !== folds.length) throw new TypeError("Duplicate evaluation fold identity");
  for (let index = 1; index < folds.length; index += 1) {
    if (folds[index].evaluationStartMs < folds[index - 1].evaluationEndMs) throw new TypeError("Overlapping evaluation folds");
  }

  return {
    evaluationAsOf: options.evaluationAsOf,
    evaluationAsOfMs,
    embargoMilliseconds: options.embargoMilliseconds,
    calibrationBins: options.calibrationBins,
    minimumScoredSamples: options.minimumScoredSamples,
    maxRecords: options.maxRecords,
    folds
  };
}

function rounded(value: number) {
  return Number(value.toFixed(12));
}

function metrics(observations: readonly ScoredObservation[], calibrationBins: number, minimumScoredSamples: number) {
  const scoredCount = observations.length;
  if (scoredCount === 0) {
    return {
      scoredCount: 0,
      wins: 0,
      losses: 0,
      brierScore: null,
      logLoss: null,
      expectedCalibrationError: null,
      calibrationBins: [],
      evidenceStatus: "insufficient_sample",
      calibrationConclusion: null
    };
  }

  const bins = Array.from({ length: calibrationBins }, (_, index) => ({ index, lowerBound: index / calibrationBins, upperBound: (index + 1) / calibrationBins, rows: [] as ScoredObservation[] }));
  let brier = 0;
  let logLoss = 0;
  let wins = 0;
  for (const observation of observations) {
    const probability = observation.prediction.probability;
    wins += observation.target;
    brier += (probability - observation.target) ** 2;
    logLoss += -(observation.target * Math.log(probability) + (1 - observation.target) * Math.log(1 - probability));
    bins[Math.min(calibrationBins - 1, Math.floor(probability * calibrationBins))].rows.push(observation);
  }

  let expectedCalibrationError = 0;
  const populatedBins = bins.filter(bin => bin.rows.length > 0).map(bin => {
    const meanProbability = bin.rows.reduce((total, row) => total + row.prediction.probability, 0) / bin.rows.length;
    const observedRate = bin.rows.reduce((total, row) => total + row.target, 0) / bin.rows.length;
    const absoluteGap = Math.abs(meanProbability - observedRate);
    expectedCalibrationError += absoluteGap * bin.rows.length / scoredCount;
    return {
      index: bin.index,
      lowerBound: rounded(bin.lowerBound),
      upperBound: rounded(bin.upperBound),
      sampleCount: bin.rows.length,
      meanProbability: rounded(meanProbability),
      observedRate: rounded(observedRate),
      absoluteGap: rounded(absoluteGap)
    };
  });

  const sufficient = scoredCount >= minimumScoredSamples;
  return {
    scoredCount,
    wins,
    losses: scoredCount - wins,
    brierScore: rounded(brier / scoredCount),
    logLoss: rounded(logLoss / scoredCount),
    expectedCalibrationError: rounded(expectedCalibrationError),
    calibrationBins: populatedBins,
    evidenceStatus: sufficient ? "measured_not_independently_validated" : "insufficient_sample",
    calibrationConclusion: null
  };
}

function cohortKey(prediction: PredictionLedgerEntry) {
  return [
    prediction.sportId,
    prediction.competitionId,
    prediction.market.marketId,
    prediction.market.marketVersion,
    prediction.market.settlementRuleId,
    prediction.market.selectionId,
    prediction.model.modelId,
    prediction.model.modelVersion
  ].join("|");
}

function cohortIdentity(prediction: PredictionLedgerEntry) {
  return {
    sportId: prediction.sportId,
    competitionId: prediction.competitionId,
    marketId: prediction.market.marketId,
    marketVersion: prediction.market.marketVersion,
    settlementRuleId: prediction.market.settlementRuleId,
    selectionId: prediction.market.selectionId,
    modelId: prediction.model.modelId,
    modelVersion: prediction.model.modelVersion
  };
}

export function evaluateWalkForwardLedger(inputs: unknown, options: WalkForwardEvaluationOptions) {
  if (!Array.isArray(inputs)) throw new TypeError("Walk-forward ledger input must be an array");
  const policy = normalizedOptions(options);
  const ledger = validatePredictionLedgerBatch(inputs, { maxBatchSize: policy.maxRecords, maxPriorPredictions: 0 });
  const normalizedPolicy = {
    evaluationAsOf: policy.evaluationAsOf,
    embargoMilliseconds: policy.embargoMilliseconds,
    calibrationBins: policy.calibrationBins,
    minimumScoredSamples: policy.minimumScoredSamples,
    maxRecords: policy.maxRecords,
    folds: policy.folds.map(({ trainingCutoffMs: _training, evaluationStartMs: _start, evaluationEndMs: _end, ...fold }) => fold)
  };
  if (ledger.status === "rejected" && ledger.diagnostics.includes("BATCH_LIMIT_EXCEEDED")) {
    const body = {
      schemaVersion: SCHEMA_VERSION,
      status: "rejected",
      policy: normalizedPolicy,
      diagnostics: ["INVALID_LEDGER_RECORD"] as EvaluationDiagnostic[],
      excluded: [],
      folds: [],
      cohorts: [],
      totals: { inputRecords: inputs.length, acceptedLedgerRecords: 0, predictionCount: 0, scoredCount: 0, voidOrPushCount: 0, excludedPredictionCount: 0 },
      retryDisposition: "do_not_retry_automatically",
      comparativeEvidence: { closingLineValue: { status: "unavailable", reason: "closing_price_not_in_ledger" }, distributionShift: { status: "unavailable", reason: "reference_distribution_not_supplied" } },
      limitations: ["offline_ledger_evaluation_only", "no_predictive_superiority_claim", "no_model_promotion"]
    };
    return deepFreeze({ ...body, reportId: sha256(body) });
  }

  const accepted = ledger.accepted;
  const predictions = accepted.filter((row): row is PredictionLedgerEntry => row.kind === "prediction").sort((left, right) => left.recordId.localeCompare(right.recordId));
  const outcomes = accepted.filter((row): row is OutcomeLedgerEntry => row.kind === "outcome");
  const outcomesByPrediction = new Map<string, OutcomeLedgerEntry[]>();
  for (const outcome of outcomes) outcomesByPrediction.set(outcome.predictionId, [...(outcomesByPrediction.get(outcome.predictionId) ?? []), outcome]);

  const diagnostics = new Set<EvaluationDiagnostic>();
  const predictionIds = new Set(predictions.map(prediction => prediction.recordId));
  const taintedPredictionIds = new Set(ledger.rejected.map(item => item.recordId).filter(recordId => predictionIds.has(recordId)));
  const excludedPredictionIds = new Set<string>(taintedPredictionIds);
  const excluded = ledger.rejected.map(item => ({
    recordId: HASH.test(item.recordId) ? item.recordId : "invalid-record",
    scope: predictionIds.has(item.recordId) ? "prediction" : "ledger_record",
    diagnostics: ["INVALID_LEDGER_RECORD"] as EvaluationDiagnostic[]
  }));
  if (ledger.rejected.length) diagnostics.add("INVALID_LEDGER_RECORD");
  const observations: ScoredObservation[] = [];
  let voidOrPushCount = 0;

  for (const prediction of predictions) {
    const matchingOutcomes = (outcomesByPrediction.get(prediction.recordId) ?? []).filter(outcome => Date.parse(outcome.verifiedAt) <= policy.evaluationAsOfMs);
    const allOutcomes = outcomesByPrediction.get(prediction.recordId) ?? [];
    let diagnostic: EvaluationDiagnostic | null = taintedPredictionIds.has(prediction.recordId) ? "INVALID_LEDGER_RECORD" : null;
    const fold = policy.folds.find(candidate => Date.parse(prediction.eventTime) >= candidate.evaluationStartMs && Date.parse(prediction.eventTime) < candidate.evaluationEndMs);
    if (!diagnostic && !fold) diagnostic = "OUTSIDE_EVALUATION_WINDOW";
    else if (!diagnostic && Date.parse(prediction.model.trainedThrough) > fold!.trainingCutoffMs) diagnostic = "MODEL_TRAINING_LEAKAGE";
    else if (!diagnostic && matchingOutcomes.length === 0) diagnostic = allOutcomes.length ? "OUTCOME_AFTER_AS_OF" : "MISSING_OUTCOME";
    else if (!diagnostic && new Set(matchingOutcomes.map(outcome => outcome.outcome)).size > 1) diagnostic = "CONFLICTING_OUTCOME";

    if (diagnostic) {
      diagnostics.add(diagnostic);
      excludedPredictionIds.add(prediction.recordId);
      if (!taintedPredictionIds.has(prediction.recordId)) excluded.push({ recordId: prediction.recordId, scope: "prediction", diagnostics: [diagnostic] });
      continue;
    }

    const outcome = matchingOutcomes[0];
    if (outcome.outcome === "void" || outcome.outcome === "push") {
      voidOrPushCount += 1;
      continue;
    }
    observations.push({ prediction, foldId: fold!.foldId, target: outcome.outcome === "won" ? 1 : 0, outcomeEvidenceCount: matchingOutcomes.length });
  }

  const foldReports = policy.folds.map(fold => {
    const rows = observations.filter(row => row.foldId === fold.foldId);
    return {
      foldId: fold.foldId,
      trainingCutoff: fold.trainingCutoff,
      evaluationStart: fold.evaluationStart,
      evaluationEnd: fold.evaluationEnd,
      ...metrics(rows, policy.calibrationBins, policy.minimumScoredSamples)
    };
  });

  const cohortRows = new Map<string, ScoredObservation[]>();
  for (const observation of observations) cohortRows.set(cohortKey(observation.prediction), [...(cohortRows.get(cohortKey(observation.prediction)) ?? []), observation]);
  const cohorts = [...cohortRows.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, rows]) => ({
    cohortId: sha256({ schemaVersion: SCHEMA_VERSION, key }),
    identity: cohortIdentity(rows[0].prediction),
    foldIds: [...new Set(rows.map(row => row.foldId))].sort(),
    outcomeEvidenceCount: rows.reduce((total, row) => total + row.outcomeEvidenceCount, 0),
    ...metrics(rows, policy.calibrationBins, policy.minimumScoredSamples)
  }));

  const normalizedExcluded = [...new Map(excluded.map(item => [`${item.scope}|${item.recordId}|${item.diagnostics.join("|")}`, item])).values()]
    .sort((left, right) => left.recordId.localeCompare(right.recordId) || left.scope.localeCompare(right.scope) || left.diagnostics.join("|").localeCompare(right.diagnostics.join("|")));
  const body = {
    schemaVersion: SCHEMA_VERSION,
    status: normalizedExcluded.length ? observations.length || voidOrPushCount ? "partial" : "insufficient_evidence" : observations.length ? "evaluated" : "insufficient_evidence",
    policy: normalizedPolicy,
    diagnostics: [...diagnostics].sort(),
    excluded: normalizedExcluded,
    folds: foldReports,
    cohorts,
    totals: {
      inputRecords: inputs.length,
      acceptedLedgerRecords: accepted.length,
      predictionCount: predictions.length,
      scoredCount: observations.length,
      voidOrPushCount,
      excludedPredictionCount: excludedPredictionIds.size
    },
    retryDisposition: "do_not_retry_automatically",
    comparativeEvidence: {
      closingLineValue: { status: "unavailable", reason: "closing_price_not_in_ledger" },
      distributionShift: { status: "unavailable", reason: "reference_distribution_not_supplied" }
    },
    limitations: ["offline_ledger_evaluation_only", "no_predictive_superiority_claim", "no_model_promotion"]
  };
  return deepFreeze({ ...body, reportId: sha256(body) });
}

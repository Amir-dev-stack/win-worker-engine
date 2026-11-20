import { createHash } from "node:crypto";

export type PairedBaselineComparisonOptions = {
  minimumPairedSamples: number;
  maxCohorts: number;
};

type ComparisonDiagnostic =
  | "AMBIGUOUS_COHORT"
  | "DEGRADED_REPORT_TRUST"
  | "IDENTICAL_MODEL"
  | "INVALID_COMPARISON_UNITS"
  | "INVALID_REPORT"
  | "MISSING_COUNTERPART"
  | "POLICY_MISMATCH"
  | "SAMPLE_SET_MISMATCH";

const SCHEMA_VERSION = "win.paired-baseline-comparison.v1" as const;
const WALK_FORWARD_SCHEMA = "win.walk-forward-evaluation.v1";
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Comparison numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Comparison values must be JSON-compatible");
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

function rounded(value: number) {
  return Number(value.toFixed(12));
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function normalizedOptions(options: PairedBaselineComparisonOptions) {
  if (!Number.isSafeInteger(options?.minimumPairedSamples) || options.minimumPairedSamples < 2 || options.minimumPairedSamples > 500) throw new TypeError("Invalid paired sample minimum");
  if (!Number.isSafeInteger(options?.maxCohorts) || options.maxCohorts < 1 || options.maxCohorts > 500) throw new TypeError("Invalid comparison cohort limit");
  return { minimumPairedSamples: options.minimumPairedSamples, maxCohorts: options.maxCohorts };
}

function exactKeys(input: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(input).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function boundedReportShape(input: Record<string, any>, maxCohorts: number) {
  const topLevelKeys = ["batchTrust", "cohorts", "comparativeEvidence", "diagnostics", "excluded", "folds", "limitations", "policy", "reportId", "retryDisposition", "schemaVersion", "status", "totals"];
  const cohortKeys = ["brierScore", "calibrationBins", "calibrationConclusion", "cohortId", "comparisonUnits", "evidenceStatus", "expectedCalibrationError", "foldIds", "identity", "logLoss", "losses", "outcomeEvidenceCount", "sampleSetId", "scoredCount", "wins"];
  const identityKeys = ["artifactHash", "competitionId", "marketId", "marketVersion", "modelId", "modelVersion", "producerId", "selectionId", "settlementRuleId", "sourceCodeHash", "sportId"];
  const unitKeys = ["brierLoss", "foldId", "logLoss", "unitId"];
  const foldKeys = ["brierScore", "calibrationBins", "calibrationConclusion", "evaluationEnd", "evaluationStart", "evidenceStatus", "expectedCalibrationError", "foldId", "logLoss", "losses", "scoredCount", "trainingCutoff", "wins"];
  const binKeys = ["absoluteGap", "index", "lowerBound", "meanProbability", "observedRate", "sampleCount", "upperBound"];
  if (!exactKeys(input, topLevelKeys) || input.schemaVersion !== WALK_FORWARD_SCHEMA || !Array.isArray(input.cohorts) || input.cohorts.length < 1 || input.cohorts.length > maxCohorts || !Array.isArray(input.folds) || input.folds.length < 1 || input.folds.length > 50 || !Array.isArray(input.limitations) || input.limitations.length > 20 || input.limitations.some((value: unknown) => typeof value !== "string" || value.length > 128)) return false;
  if (!input.policy || typeof input.policy !== "object" || Array.isArray(input.policy) || !Array.isArray(input.policy.folds) || input.policy.folds.length < 1 || input.policy.folds.length > 50) return false;
  for (const fold of input.folds) {
    if (!fold || typeof fold !== "object" || Array.isArray(fold) || !exactKeys(fold, foldKeys) || !Array.isArray(fold.calibrationBins) || fold.calibrationBins.length > 20 || fold.calibrationBins.some((bin: unknown) => !bin || typeof bin !== "object" || Array.isArray(bin) || !exactKeys(bin as Record<string, unknown>, binKeys))) return false;
  }
  for (const cohort of input.cohorts) {
    if (!cohort || typeof cohort !== "object" || Array.isArray(cohort) || !exactKeys(cohort, cohortKeys) || !cohort.identity || typeof cohort.identity !== "object" || Array.isArray(cohort.identity) || !exactKeys(cohort.identity, identityKeys) || Object.values(cohort.identity).some(value => typeof value !== "string" || value.length > 128)) return false;
    if (!Array.isArray(cohort.comparisonUnits) || cohort.comparisonUnits.length < 1 || cohort.comparisonUnits.length > 500 || cohort.comparisonUnits.some((unit: unknown) => !unit || typeof unit !== "object" || Array.isArray(unit) || !exactKeys(unit as Record<string, unknown>, unitKeys))) return false;
    if (!Array.isArray(cohort.calibrationBins) || cohort.calibrationBins.length > 20 || cohort.calibrationBins.some((bin: unknown) => !bin || typeof bin !== "object" || Array.isArray(bin) || !exactKeys(bin as Record<string, unknown>, binKeys))) return false;
  }
  return true;
}

function reportBody(input: unknown, maxCohorts: number) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (!boundedReportShape(input as Record<string, any>, maxCohorts)) return null;
  const { reportId, ...body } = input as Record<string, unknown>;
  if (typeof reportId !== "string" || !HASH.test(reportId)) return null;
  try {
    if (sha256(body) !== reportId) return null;
  } catch {
    return null;
  }
  return { reportId, body: body as Record<string, any> };
}

function comparisonIdentity(identity: Record<string, unknown>) {
  const fields = ["sportId", "competitionId", "marketId", "marketVersion", "settlementRuleId", "selectionId"] as const;
  if (fields.some(field => !safeId(identity?.[field]))) return null;
  return Object.fromEntries(fields.map(field => [field, identity[field]])) as Record<(typeof fields)[number], string>;
}

function modelIdentity(identity: Record<string, unknown>) {
  const ids = ["producerId", "modelId", "modelVersion"] as const;
  if (ids.some(field => !safeId(identity?.[field])) || typeof identity?.sourceCodeHash !== "string" || !HASH.test(identity.sourceCodeHash) || typeof identity?.artifactHash !== "string" || !HASH.test(identity.artifactHash)) return null;
  return {
    producerId: identity.producerId as string,
    sourceCodeHash: identity.sourceCodeHash,
    modelId: identity.modelId as string,
    modelVersion: identity.modelVersion as string,
    artifactHash: identity.artifactHash
  };
}

function normalizedUnits(cohort: Record<string, any>) {
  if (!Array.isArray(cohort?.comparisonUnits) || cohort.comparisonUnits.length < 1 || !Number.isSafeInteger(cohort?.scoredCount) || cohort.scoredCount !== cohort.comparisonUnits.length || typeof cohort?.sampleSetId !== "string" || !HASH.test(cohort.sampleSetId) || typeof cohort?.brierScore !== "number" || !Number.isFinite(cohort.brierScore) || typeof cohort?.logLoss !== "number" || !Number.isFinite(cohort.logLoss)) return null;
  const units = [] as { unitId: string; foldId: string; brierLoss: number; logLoss: number }[];
  for (const input of cohort.comparisonUnits) {
    if (!input || typeof input !== "object" || !HASH.test(String(input.unitId)) || !safeId(input.foldId) || typeof input.brierLoss !== "number" || !Number.isFinite(input.brierLoss) || input.brierLoss < 0 || input.brierLoss > 1 || typeof input.logLoss !== "number" || !Number.isFinite(input.logLoss) || input.logLoss < 0) return null;
    units.push({ unitId: input.unitId, foldId: input.foldId, brierLoss: input.brierLoss, logLoss: input.logLoss });
  }
  units.sort((left, right) => left.unitId.localeCompare(right.unitId));
  if (new Set(units.map(unit => unit.unitId)).size !== units.length) return null;
  if (sha256({ schemaVersion: "win.evaluation-sample-set.v1", unitIds: units.map(unit => unit.unitId) }) !== cohort.sampleSetId) return null;
  if (rounded(units.reduce((total, unit) => total + unit.brierLoss, 0) / units.length) !== cohort.brierScore || rounded(units.reduce((total, unit) => total + unit.logLoss, 0) / units.length) !== cohort.logLoss) return null;
  return units;
}

function validateReport(input: unknown, maxCohorts: number) {
  const checked = reportBody(input, maxCohorts);
  if (!checked) return { diagnostic: "INVALID_REPORT" as ComparisonDiagnostic, report: null };
  const body = checked.body;
  if (body.schemaVersion !== WALK_FORWARD_SCHEMA || !body.policy || !Array.isArray(body.cohorts) || body.cohorts.length < 1 || body.cohorts.length > maxCohorts || !Array.isArray(body.diagnostics) || !Array.isArray(body.excluded)) return { diagnostic: "INVALID_REPORT" as ComparisonDiagnostic, report: null };
  if (body.batchTrust?.status !== "accepted_ledger_records_only" || body.batchTrust?.unlinkedRejectedOutcomeCount !== 0) return { diagnostic: "DEGRADED_REPORT_TRUST" as ComparisonDiagnostic, report: null };
  if (body.status !== "evaluated" || body.diagnostics.length || body.excluded.length) return { diagnostic: "INVALID_REPORT" as ComparisonDiagnostic, report: null };

  const cohorts = [] as { key: string; comparisonIdentity: Record<string, string>; modelIdentity: ReturnType<typeof modelIdentity>; units: NonNullable<ReturnType<typeof normalizedUnits>> }[];
  for (const cohort of body.cohorts) {
    const comparison = comparisonIdentity(cohort?.identity);
    const model = modelIdentity(cohort?.identity);
    const units = normalizedUnits(cohort);
    if (!comparison || !model || !units) return { diagnostic: "INVALID_COMPARISON_UNITS" as ComparisonDiagnostic, report: null };
    cohorts.push({ key: canonical(comparison), comparisonIdentity: comparison, modelIdentity: model, units });
  }
  return { diagnostic: null, report: { reportId: checked.reportId, policy: body.policy, cohorts } };
}

function pairedMetric(candidate: readonly number[], reference: readonly number[], minimumPairedSamples: number) {
  const deltas = candidate.map((value, index) => value - reference[index]);
  const count = deltas.length;
  const meanDelta = deltas.reduce((total, value) => total + value, 0) / count;
  const variance = count > 1 ? deltas.reduce((total, value) => total + (value - meanDelta) ** 2, 0) / (count - 1) : 0;
  const sampleStandardDeviation = Math.sqrt(variance);
  const standardError = sampleStandardDeviation / Math.sqrt(count);
  const intervalAvailable = count >= Math.max(30, minimumPairedSamples);
  return {
    pairedSampleCount: count,
    candidateMeanLoss: rounded(candidate.reduce((total, value) => total + value, 0) / count),
    referenceMeanLoss: rounded(reference.reduce((total, value) => total + value, 0) / count),
    meanDeltaCandidateMinusReference: rounded(meanDelta),
    candidateLowerLossCount: deltas.filter(value => value < 0).length,
    tiedLossCount: deltas.filter(value => value === 0).length,
    referenceLowerLossCount: deltas.filter(value => value > 0).length,
    sampleStandardDeviation: rounded(sampleStandardDeviation),
    standardError: rounded(standardError),
    approximate95Interval: intervalAvailable ? { lower: rounded(meanDelta - 1.96 * standardError), upper: rounded(meanDelta + 1.96 * standardError) } : null,
    uncertaintyStatus: intervalAvailable ? "normal_approximation_descriptive_only" : "insufficient_sample_for_interval"
  };
}

function result(body: Record<string, unknown>) {
  return deepFreeze({ ...body, comparisonReportId: sha256(body) });
}

export function comparePairedBaselineReports(candidateInput: unknown, referenceInput: unknown, options: PairedBaselineComparisonOptions) {
  const policy = normalizedOptions(options);
  const candidate = validateReport(candidateInput, policy.maxCohorts);
  const reference = validateReport(referenceInput, policy.maxCohorts);
  const initialDiagnostics = [candidate.diagnostic, reference.diagnostic].filter(Boolean) as ComparisonDiagnostic[];
  if (!candidate.report || !reference.report) {
    const body = {
      schemaVersion: SCHEMA_VERSION,
      status: "rejected",
      policy,
      diagnostics: [...new Set(initialDiagnostics)].sort(),
      sourceReportIds: [],
      comparisons: [],
      promotionAllowed: false,
      superiorityConclusion: null,
      retryDisposition: "do_not_retry_automatically"
    };
    return result(body);
  }

  if (canonical(candidate.report.policy) !== canonical(reference.report.policy)) {
    return result({
      schemaVersion: SCHEMA_VERSION,
      status: "rejected",
      policy,
      diagnostics: ["POLICY_MISMATCH"],
      sourceReportIds: [candidate.report.reportId, reference.report.reportId].sort(),
      comparisons: [],
      promotionAllowed: false,
      superiorityConclusion: null,
      retryDisposition: "do_not_retry_automatically"
    });
  }

  const diagnostics = new Set<ComparisonDiagnostic>();
  const comparisons = [] as Record<string, unknown>[];
  const candidateByKey = new Map<string, typeof candidate.report.cohorts>();
  const referenceByKey = new Map<string, typeof reference.report.cohorts>();
  for (const cohort of candidate.report.cohorts) candidateByKey.set(cohort.key, [...(candidateByKey.get(cohort.key) ?? []), cohort]);
  for (const cohort of reference.report.cohorts) referenceByKey.set(cohort.key, [...(referenceByKey.get(cohort.key) ?? []), cohort]);
  const keys = [...new Set([...candidateByKey.keys(), ...referenceByKey.keys()])].sort();

  for (const key of keys) {
    const candidateRows = candidateByKey.get(key) ?? [];
    const referenceRows = referenceByKey.get(key) ?? [];
    if (!candidateRows.length || !referenceRows.length) {
      diagnostics.add("MISSING_COUNTERPART");
      continue;
    }
    if (candidateRows.length !== 1 || referenceRows.length !== 1) {
      diagnostics.add("AMBIGUOUS_COHORT");
      continue;
    }
    const candidateRow = candidateRows[0];
    const referenceRow = referenceRows[0];
    if (canonical(candidateRow.modelIdentity) === canonical(referenceRow.modelIdentity)) {
      diagnostics.add("IDENTICAL_MODEL");
      continue;
    }
    if (candidateRow.units.length !== referenceRow.units.length || candidateRow.units.some((unit, index) => unit.unitId !== referenceRow.units[index].unitId || unit.foldId !== referenceRow.units[index].foldId)) {
      diagnostics.add("SAMPLE_SET_MISMATCH");
      continue;
    }

    const pairedSampleCount = candidateRow.units.length;
    comparisons.push({
      comparisonId: sha256({ schemaVersion: SCHEMA_VERSION, identity: candidateRow.comparisonIdentity, candidate: candidateRow.modelIdentity, reference: referenceRow.modelIdentity, unitIds: candidateRow.units.map(unit => unit.unitId) }),
      identity: candidateRow.comparisonIdentity,
      candidateModel: candidateRow.modelIdentity,
      referenceModel: referenceRow.modelIdentity,
      sampleSetId: sha256({ schemaVersion: "win.paired-sample-set.v1", unitIds: candidateRow.units.map(unit => unit.unitId) }),
      foldIds: [...new Set(candidateRow.units.map(unit => unit.foldId))].sort(),
      pairedSampleCount,
      evidenceStatus: pairedSampleCount >= policy.minimumPairedSamples ? "paired_descriptive_not_independently_validated" : "insufficient_paired_sample",
      brier: pairedMetric(candidateRow.units.map(unit => unit.brierLoss), referenceRow.units.map(unit => unit.brierLoss), policy.minimumPairedSamples),
      logLoss: pairedMetric(candidateRow.units.map(unit => unit.logLoss), referenceRow.units.map(unit => unit.logLoss), policy.minimumPairedSamples),
      promotionAllowed: false,
      superiorityConclusion: null
    });
  }

  if (diagnostics.size) {
    return result({
      schemaVersion: SCHEMA_VERSION,
      status: "rejected",
      policy,
      diagnostics: [...diagnostics].sort(),
      sourceReportIds: [candidate.report.reportId, reference.report.reportId].sort(),
      comparisons: [],
      promotionAllowed: false,
      superiorityConclusion: null,
      limitations: ["descriptive_paired_losses_only", "normal_interval_is_approximate", "no_model_promotion", "no_predictive_superiority_claim"],
      retryDisposition: "do_not_retry_automatically"
    });
  }

  const body = {
    schemaVersion: SCHEMA_VERSION,
    status: "compared",
    policy,
    diagnostics: [],
    sourceReportIds: [candidate.report.reportId, reference.report.reportId].sort(),
    comparisons: comparisons.sort((left, right) => String(left.comparisonId).localeCompare(String(right.comparisonId))),
    promotionAllowed: false,
    superiorityConclusion: null,
    limitations: ["descriptive_paired_losses_only", "normal_interval_is_approximate", "no_model_promotion", "no_predictive_superiority_claim"],
    retryDisposition: "do_not_retry_automatically"
  };
  return result(body);
}

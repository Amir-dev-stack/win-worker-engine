import { get, putIfNew } from "./store.mts";
import { hashWinMLProvenance } from "./ml-provenance.mts";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";
import { getWinMLModelArtifact } from "./ml-model-artifact-registry.mts";
import { assertProviderImportAllowed } from "./data-provider-registry.mts";
import type { WinMLModelEvaluationV1 } from "./ml-model-contract.mts";

export const WIN_MARKET_EVALUATION_VERSION = "win.market.evaluation.v3" as const;
const COLLECTION = "library/win-market-evaluations";
const CLASSES = ["home", "draw", "away"] as const;

export type WinMarketEvaluationRow = {
  eventId: string;
  kickoffAt: string;
  predictionCutoff: string;
  marketSnapshotAt: string;
  sourceRecordId: string;
  probabilities: [number, number, number];
  outcome: "home" | "draw" | "away";
};

export type WinMarketEvaluationRecord = {
  version: typeof WIN_MARKET_EVALUATION_VERSION;
  evaluationId: string;
  modelId: string;
  modelVersion: string;
  modelArtifactSha256: string;
  modelEvaluationSha256: string;
  datasetId: string;
  datasetContentSha256: string;
  sourceId: string;
  sourceRevision: string;
  sourceDatasetId: string;
  sourceDatasetSha256: string;
  sourceDatasetRecordsSha256: string;
  evaluatedAt: string;
  testEventIdsSha256: string;
  testRowsSha256: string;
  testRows: number;
  metrics: { brier: number; logLoss: number; expectedCalibrationError: number };
  recordSha256: string;
};

export class WinMarketEvaluationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "WinMarketEvaluationError"; this.code = code; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}
function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function assertWinMarketCohortMatchesModel(
  rows: WinMarketEvaluationRow[],
  evaluation: WinMLModelEvaluationV1
) {
  if (!Array.isArray(rows) || !evaluation || evaluation.market !== "1x2" ||
      !Array.isArray(evaluation.testEventIds) || !Array.isArray(evaluation.testEventCutoffs) ||
      rows.length !== evaluation.testRows || evaluation.testEventIds.length !== evaluation.testRows ||
      evaluation.testEventCutoffs.length !== evaluation.testRows) {
    throw new WinMarketEvaluationError("market_evaluation_model_cohort_invalid");
  }
  if (new Set(evaluation.testEventCutoffs.map(item => item?.eventId)).size !== evaluation.testEventCutoffs.length ||
      evaluation.testEventCutoffs.some(item => !validId(item?.eventId) || !isStrictIsoTimestamp(item?.predictionCutoff))) {
    throw new WinMarketEvaluationError("market_evaluation_model_cutoffs_invalid");
  }
  const modelEventIds = new Set(evaluation.testEventIds);
  const modelCutoffs = new Map(evaluation.testEventCutoffs.map(item => [item.eventId, item.predictionCutoff]));
  const rowIds = rows.map(row => row?.eventId);
  const rowIdSet = new Set(rowIds);
  if (rowIds.some(id => !validId(id)) || rowIdSet.size !== rowIds.length ||
      modelEventIds.size !== evaluation.testEventIds.length ||
      hashWinMLProvenance([...rowIdSet].sort()).sha256 !== evaluation.testCohortSha256 ||
      evaluation.testEventIds.length !== rowIds.length ||
      [...modelEventIds].some(id => !rowIdSet.has(id)) ||
      rowIds.some(id => !modelCutoffs.has(id))) {
    throw new WinMarketEvaluationError("market_evaluation_model_cohort_mismatch");
  }
  for (const row of rows) {
    if (modelCutoffs.get(row.eventId) !== row.predictionCutoff) {
      throw new WinMarketEvaluationError("market_evaluation_prediction_cutoff_mismatch");
    }
  }
}

function validateSourceRecordBindings(
  rows: WinMarketEvaluationRow[],
  sourceDataset: { records: any[]; recordsSha256: string },
  providerId: string
) {
  if (!Array.isArray(sourceDataset?.records) ||
      !validHash(sourceDataset.recordsSha256) ||
      hashWinMLProvenance(sourceDataset.records).sha256 !== sourceDataset.recordsSha256) {
    throw new WinMarketEvaluationError("market_evaluation_source_records_hash_invalid");
  }
  const sourceById = new Map<string, any>();
  for (const source of sourceDataset.records) {
    if (!source || !validId(source.id) || sourceById.has(source.id)) {
      throw new WinMarketEvaluationError("market_evaluation_source_record_identity_invalid");
    }
    sourceById.set(source.id, source);
  }
  const used = new Set<string>();
  for (const row of rows) {
    if (!validId(row?.sourceRecordId) || used.has(row.sourceRecordId)) {
      throw new WinMarketEvaluationError("market_evaluation_source_record_reference_invalid");
    }
    used.add(row.sourceRecordId);
    const source = sourceById.get(row.sourceRecordId);
    if (!source || source.providerId !== providerId || source.sport !== "football" ||
        source.marketDataType !== "consensus_market_lines" || source.status !== "completed" ||
        source.eventStart !== row.kickoffAt || source.closing?.marketSnapshotAt !== row.marketSnapshotAt ||
        source.closing?.marketSnapshotTimestampStatus !== "source_timestamp") {
      throw new WinMarketEvaluationError("market_evaluation_source_record_binding_mismatch");
    }
    const sourceProbabilities = [
      source.closing?.homeWinProbability,
      source.closing?.drawProbability,
      source.closing?.awayWinProbability
    ];
    if (sourceProbabilities.some(value => typeof value !== "number" || !Number.isFinite(value)) ||
        sourceProbabilities.some((value, index) => Math.abs(value - row.probabilities[index]) > 1e-9)) {
      throw new WinMarketEvaluationError("market_evaluation_source_record_probabilities_mismatch");
    }
    const homeScore = source.homeScore, awayScore = source.awayScore;
    if (!Number.isSafeInteger(homeScore) || !Number.isSafeInteger(awayScore) ||
        homeScore < 0 || awayScore < 0) {
      throw new WinMarketEvaluationError("market_evaluation_source_record_result_invalid");
    }
    const sourceOutcome = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
    if (sourceOutcome !== row.outcome) {
      throw new WinMarketEvaluationError("market_evaluation_source_record_outcome_mismatch");
    }
  }
}

function validateRows(rows: WinMarketEvaluationRow[], evaluatedAt: string) {
  if (!Array.isArray(rows) || rows.length < 100 || rows.length > 100_000) {
    throw new WinMarketEvaluationError("market_evaluation_test_sample_invalid");
  }
  const seen = new Set<string>();
  let brier = 0, logLoss = 0;
  const bins = Array.from({ length: 10 }, () => ({ count: 0, confidence: 0, correct: 0 }));
  const sorted = [...rows].sort((a, b) => String(a?.eventId).localeCompare(String(b?.eventId)));
  for (const row of sorted) {
    if (!row || !validId(row.eventId) || seen.has(row.eventId) ||
        !CLASSES.includes(row.outcome) ||
        ![row.kickoffAt, row.predictionCutoff, row.marketSnapshotAt, row.resultAvailableAt].every(isStrictIsoTimestamp)) {
      throw new WinMarketEvaluationError("market_evaluation_row_invalid");
    }
    seen.add(row.eventId);
    const kickoff = Date.parse(row.kickoffAt);
    const cutoff = Date.parse(row.predictionCutoff);
    const snapshot = Date.parse(row.marketSnapshotAt);
    const rowKeys = Object.keys(row).sort();
    const expectedKeys = ["eventId", "kickoffAt", "marketSnapshotAt", "outcome", "predictionCutoff", "probabilities", "sourceRecordId"];
    if (rowKeys.length !== expectedKeys.length || rowKeys.some((key, index) => key !== expectedKeys[index])) {
      throw new WinMarketEvaluationError("market_evaluation_row_invalid");
    }
    if (!(snapshot <= cutoff && cutoff < kickoff && kickoff <= Date.parse(evaluatedAt))) {
      throw new WinMarketEvaluationError("market_evaluation_point_in_time_invalid");
    }
    if (!Array.isArray(row.probabilities) || row.probabilities.length !== 3 ||
        row.probabilities.some(p => typeof p !== "number" || !Number.isFinite(p) || p <= 0 || p >= 1) ||
        Math.abs(row.probabilities.reduce((sum, p) => sum + p, 0) - 1) > 1e-6) {
      throw new WinMarketEvaluationError("market_evaluation_probabilities_invalid");
    }
    const y = CLASSES.indexOf(row.outcome);
    brier += row.probabilities.reduce((sum, p, i) => sum + (p - (i === y ? 1 : 0)) ** 2, 0);
    logLoss -= Math.log(row.probabilities[y]);
    const best = row.probabilities.indexOf(Math.max(...row.probabilities));
    const confidence = row.probabilities[best];
    const bin = bins[Math.min(9, Math.floor(confidence * 10))];
    bin.count++; bin.confidence += confidence; bin.correct += best === y ? 1 : 0;
  }
  const n = rows.length;
  const ece = bins.reduce((sum, bin) => sum + (bin.count / n) *
    (bin.count ? Math.abs(bin.correct / bin.count - bin.confidence / bin.count) : 0), 0);
  return {
    metrics: { brier: brier / n, logLoss: logLoss / n, expectedCalibrationError: ece },
    eventIds: sorted.map(row => row.eventId),
    testRowsSha256: hashWinMLProvenance(sorted).sha256
  };
}

/** Stores market-only scores only after matching the registered model's exact held-out cohort and per-event cutoff. */
export async function registerWinMarketEvaluation(args: {
  evaluationId: string;
  modelId: string;
  modelVersion: string;
  sourceId: string;
  sourceRevision: string;
  evaluatedAt: string;
  testRows: WinMarketEvaluationRow[];
}) {
  const { evaluationId, modelId, modelVersion, sourceId, sourceRevision, evaluatedAt, testRows } = args || ({} as any);
  if (![evaluationId, modelId, modelVersion, sourceId].every(validId) ||
      !/^[a-f0-9]{40}$/i.test(sourceRevision || "") || !isStrictIsoTimestamp(evaluatedAt)) {
    throw new WinMarketEvaluationError("market_evaluation_metadata_invalid");
  }
  let provider;
  try {
    provider = assertProviderImportAllowed(sourceId, ["historical_consensus_market_lines"]);
  } catch {
    throw new WinMarketEvaluationError("market_evaluation_source_provider_not_approved");
  }
  const sourceDatasetId = "consensus-" + provider.id;
  const sourceDataset = await get<any>("library/model-lab/market-consensus-datasets", sourceDatasetId);
  if (!sourceDataset || sourceDataset.providerId !== provider.id ||
      sourceDataset.sourceRevision !== sourceRevision ||
      !validHash(sourceDataset.rawChecksum) ||
      !Array.isArray(sourceDataset.records) ||
      sourceDataset.totalRows !== sourceDataset.records.length ||
      !validHash(sourceDataset.recordsSha256) ||
      hashWinMLProvenance(sourceDataset.records).sha256 !== sourceDataset.recordsSha256 ||
      sourceDataset.marketDataType !== "consensus_market_lines" ||
      sourceDataset.origin !== "provider_historical_data") {
    throw new WinMarketEvaluationError("market_evaluation_source_dataset_binding_invalid");
  }
  const model = await getWinMLModelArtifact(modelId, modelVersion);
  if (!model) throw new WinMarketEvaluationError("market_evaluation_model_artifact_missing");
  const evaluation = model.evaluation;
  if (!isStrictIsoTimestamp(evaluation?.testWindow?.to) ||
      Date.parse(evaluatedAt) < Date.parse(evaluation.testWindow.to)) {
    throw new WinMarketEvaluationError("market_evaluation_labels_not_yet_available");
  }
  assertWinMarketCohortMatchesModel(testRows, evaluation);
  validateSourceRecordBindings(testRows, sourceDataset, provider.id);
  const computed = validateRows(testRows, evaluatedAt);
  const payload = {
    version: WIN_MARKET_EVALUATION_VERSION,
    evaluationId, modelId, modelVersion,
    modelArtifactSha256: model.artifact.artifactSha256,
    modelEvaluationSha256: model.provenance.evaluationSha256,
    datasetId: evaluation.datasetId,
    datasetContentSha256: evaluation.datasetContentSha256,
    sourceId: provider.id, sourceRevision, sourceDatasetId,
    sourceDatasetSha256: sourceDataset.rawChecksum,
    sourceDatasetRecordsSha256: sourceDataset.recordsSha256, evaluatedAt,
    testEventIdsSha256: hashWinMLProvenance(computed.eventIds).sha256,
    testRowsSha256: computed.testRowsSha256,
    testRows: testRows.length,
    metrics: computed.metrics
  };
  const record: WinMarketEvaluationRecord = { ...payload, recordSha256: hashWinMLProvenance(payload).sha256 };
  const result = await putIfNew(COLLECTION, evaluationId, record);
  if (result?.modified) return { registered: true, idempotent: false, record };
  const existing = await get<WinMarketEvaluationRecord>(COLLECTION, evaluationId);
  if (existing && verifyWinMarketEvaluationRecord(existing) && existing.recordSha256 === record.recordSha256) {
    return { registered: false, idempotent: true, record: existing };
  }
  throw new WinMarketEvaluationError("market_evaluation_immutable_conflict");
}

export function verifyWinMarketEvaluationRecord(record: WinMarketEvaluationRecord): boolean {
  if (!record || record.version !== WIN_MARKET_EVALUATION_VERSION ||
      !validId(record.evaluationId) || !validId(record.modelId) || !validId(record.modelVersion) ||
      !validHash(record.modelArtifactSha256) || !validHash(record.modelEvaluationSha256) ||
      !validId(record.datasetId) || !validId(record.sourceId) ||
      !validHash(record.datasetContentSha256) || !/^[a-f0-9]{40}$/i.test(record.sourceRevision || "") ||
      record.sourceDatasetId !== "consensus-" + record.sourceId || !validHash(record.sourceDatasetSha256) ||
      !validHash(record.sourceDatasetRecordsSha256) ||
      !isStrictIsoTimestamp(record.evaluatedAt) || !validHash(record.testEventIdsSha256) ||
      !validHash(record.testRowsSha256) || !Number.isSafeInteger(record.testRows) || record.testRows < 100 ||
      !record.metrics || ![record.metrics.brier, record.metrics.logLoss, record.metrics.expectedCalibrationError]
        .every(value => typeof value === "number" && Number.isFinite(value) && value >= 0) ||
      record.metrics.brier > 2 || record.metrics.expectedCalibrationError > 1) return false;
  const { recordSha256, ...payload } = record;
  return validHash(recordSha256) && hashWinMLProvenance(payload).sha256 === recordSha256;
}

export async function getWinMarketEvaluation(evaluationId: string) {
  if (!validId(evaluationId)) throw new WinMarketEvaluationError("market_evaluation_id_invalid");
  const record = await get<WinMarketEvaluationRecord>(COLLECTION, evaluationId);
  if (!record) return null;
  if (!verifyWinMarketEvaluationRecord(record)) throw new WinMarketEvaluationError("market_evaluation_record_tampered");
  let provider;
  try {
    provider = assertProviderImportAllowed(record.sourceId, ["historical_consensus_market_lines"]);
  } catch {
    throw new WinMarketEvaluationError("market_evaluation_source_provider_not_approved");
  }
  const sourceDataset = await get<any>("library/model-lab/market-consensus-datasets", record.sourceDatasetId);
  if (!sourceDataset || provider.id !== record.sourceId ||
      sourceDataset.providerId !== record.sourceId ||
      sourceDataset.sourceRevision !== record.sourceRevision ||
      sourceDataset.rawChecksum !== record.sourceDatasetSha256 ||
      sourceDataset.marketDataType !== "consensus_market_lines" || sourceDataset.origin !== "provider_historical_data" ||
      sourceDataset.recordsSha256 !== record.sourceDatasetRecordsSha256 ||
      !Array.isArray(sourceDataset.records) || sourceDataset.totalRows !== sourceDataset.records.length ||
      hashWinMLProvenance(sourceDataset.records).sha256 !== record.sourceDatasetRecordsSha256) {
    throw new WinMarketEvaluationError("market_evaluation_source_dataset_binding_mismatch");
  }
  const model = await getWinMLModelArtifact(record.modelId, record.modelVersion);
  if (!model || model.artifact.artifactSha256 !== record.modelArtifactSha256 ||
      model.provenance.evaluationSha256 !== record.modelEvaluationSha256 ||
      model.evaluation.datasetId !== record.datasetId ||
      model.evaluation.datasetContentSha256 !== record.datasetContentSha256) {
    throw new WinMarketEvaluationError("market_evaluation_model_binding_mismatch");
  }
  return record;
}

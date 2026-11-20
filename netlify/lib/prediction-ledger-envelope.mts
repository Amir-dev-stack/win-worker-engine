import { createHash } from "node:crypto";

export type PredictionLedgerDraft = {
  kind: "prediction";
  ledgerKey: string;
  eventId: string;
  sportId: string;
  competitionId: string;
  eventTime: string;
  informationCutoff: string;
  predictionTime: string;
  producerId: string;
  sourceCodeHash: string;
  model: {
    modelId: string;
    modelVersion: string;
    artifactHash: string;
    trainedThrough: string;
  };
  market: {
    marketId: string;
    marketVersion: string;
    settlementRuleId: string;
    selectionId: string;
  };
  probability: number;
  price: null | {
    bookmakerId: string;
    decimalOdds: number;
    observedAt: string;
    availableAt: string;
  };
  features: Array<{
    snapshotId: string;
    featureSetId: string;
    observedAt: string;
    availableAt: string;
  }>;
};

export type OutcomeLedgerDraft = {
  kind: "outcome";
  ledgerKey: string;
  predictionId: string;
  eventId: string;
  resultSnapshotId: string;
  resultObservedAt: string;
  verifiedAt: string;
  verifierId: string;
  settlementRuleId: string;
  outcome: "won" | "lost" | "void" | "push";
  evidenceHash: string;
};

export type PredictionLedgerEntry = PredictionLedgerDraft & {
  schemaVersion: "win.prediction-ledger.v1";
  recordId: string;
};

export type OutcomeLedgerEntry = OutcomeLedgerDraft & {
  schemaVersion: "win.prediction-ledger.v1";
  recordId: string;
};

export type PredictionLedgerRecord = PredictionLedgerEntry | OutcomeLedgerEntry;

export type PredictionLedgerBatchOptions = {
  maxBatchSize: number;
  priorPredictions?: readonly PredictionLedgerEntry[];
};

type Diagnostic =
  | "BATCH_LIMIT_EXCEEDED"
  | "CONFLICTING_RECORD"
  | "INVALID_RECORD"
  | "MISSING_PREDICTION"
  | "SETTLEMENT_MISMATCH"
  | "TAMPERED_RECORD";

const SCHEMA_VERSION = "win.prediction-ledger.v1" as const;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u;

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

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
    if (!Number.isFinite(value)) throw new TypeError("Ledger numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Ledger values must be JSON-compatible");
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

function normalizedPrediction(input: unknown): PredictionLedgerDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid prediction record");
  const row = input as Record<string, any>;
  const ids = ["ledgerKey", "eventId", "sportId", "competitionId", "producerId"];
  if (row.kind !== "prediction" || ids.some(field => !safeId(row[field])) || !HASH.test(String(row.sourceCodeHash))) throw new TypeError("Invalid prediction identity");
  const eventMs = instant(row.eventTime);
  const cutoffMs = instant(row.informationCutoff);
  const predictionMs = instant(row.predictionTime);
  if (eventMs === null || cutoffMs === null || predictionMs === null || cutoffMs > predictionMs || predictionMs >= eventMs) throw new TypeError("Invalid prediction chronology");

  const model = row.model;
  const trainedThroughMs = instant(model?.trainedThrough);
  if (!model || !safeId(model.modelId) || !safeId(model.modelVersion) || !HASH.test(String(model.artifactHash)) || trainedThroughMs === null || trainedThroughMs >= cutoffMs) throw new TypeError("Invalid model provenance");
  const market = row.market;
  if (!market || !safeId(market.marketId) || !safeId(market.marketVersion) || !safeId(market.settlementRuleId) || !safeId(market.selectionId)) throw new TypeError("Invalid market definition");
  if (typeof row.probability !== "number" || !Number.isFinite(row.probability) || row.probability <= 0 || row.probability >= 1) throw new TypeError("Invalid prediction probability");

  if (!Array.isArray(row.features) || row.features.length < 1 || row.features.length > 100) throw new TypeError("Invalid prediction features");
  const features = row.features.map((item: any) => {
    const observedMs = instant(item?.observedAt);
    const availableMs = instant(item?.availableAt);
    if (!HASH.test(String(item?.snapshotId)) || !safeId(item?.featureSetId) || observedMs === null || availableMs === null || observedMs > availableMs || availableMs > cutoffMs) throw new TypeError("Feature leakage detected");
    return { snapshotId: item.snapshotId, featureSetId: item.featureSetId, observedAt: item.observedAt, availableAt: item.availableAt };
  }).sort((left: any, right: any) => left.snapshotId.localeCompare(right.snapshotId) || left.featureSetId.localeCompare(right.featureSetId));
  if (new Set(features.map((item: any) => item.snapshotId)).size !== features.length) throw new TypeError("Duplicate feature snapshot");

  let price: PredictionLedgerDraft["price"] = null;
  if (row.price !== null) {
    const observedMs = instant(row.price?.observedAt);
    const availableMs = instant(row.price?.availableAt);
    if (!safeId(row.price?.bookmakerId) || typeof row.price?.decimalOdds !== "number" || !Number.isFinite(row.price.decimalOdds) || row.price.decimalOdds <= 1 || row.price.decimalOdds > 10_000 || observedMs === null || availableMs === null || observedMs > availableMs || availableMs > cutoffMs) throw new TypeError("Price leakage detected");
    price = { bookmakerId: row.price.bookmakerId, decimalOdds: row.price.decimalOdds, observedAt: row.price.observedAt, availableAt: row.price.availableAt };
  }

  return {
    kind: "prediction",
    ledgerKey: row.ledgerKey,
    eventId: row.eventId,
    sportId: row.sportId,
    competitionId: row.competitionId,
    eventTime: row.eventTime,
    informationCutoff: row.informationCutoff,
    predictionTime: row.predictionTime,
    producerId: row.producerId,
    sourceCodeHash: row.sourceCodeHash,
    model: { modelId: model.modelId, modelVersion: model.modelVersion, artifactHash: model.artifactHash, trainedThrough: model.trainedThrough },
    market: { marketId: market.marketId, marketVersion: market.marketVersion, settlementRuleId: market.settlementRuleId, selectionId: market.selectionId },
    probability: row.probability,
    price,
    features
  };
}

function normalizedOutcome(input: unknown): OutcomeLedgerDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid outcome record");
  const row = input as Record<string, any>;
  const ids = ["ledgerKey", "eventId", "verifierId", "settlementRuleId"];
  const observedMs = instant(row.resultObservedAt);
  const verifiedMs = instant(row.verifiedAt);
  if (row.kind !== "outcome" || ids.some(field => !safeId(row[field])) || !HASH.test(String(row.predictionId)) || !HASH.test(String(row.resultSnapshotId)) || !HASH.test(String(row.evidenceHash))) throw new TypeError("Invalid outcome identity");
  if (observedMs === null || verifiedMs === null || verifiedMs < observedMs || !["won", "lost", "void", "push"].includes(row.outcome)) throw new TypeError("Invalid outcome verification");
  return {
    kind: "outcome",
    ledgerKey: row.ledgerKey,
    predictionId: row.predictionId,
    eventId: row.eventId,
    resultSnapshotId: row.resultSnapshotId,
    resultObservedAt: row.resultObservedAt,
    verifiedAt: row.verifiedAt,
    verifierId: row.verifierId,
    settlementRuleId: row.settlementRuleId,
    outcome: row.outcome,
    evidenceHash: row.evidenceHash
  };
}

function createRecord<T extends PredictionLedgerDraft | OutcomeLedgerDraft>(draft: T) {
  return deepFreeze({ schemaVersion: SCHEMA_VERSION, ...draft, recordId: sha256({ schemaVersion: SCHEMA_VERSION, ...draft }) }) as T extends PredictionLedgerDraft ? PredictionLedgerEntry : OutcomeLedgerEntry;
}

export function createPredictionLedgerEntry(input: PredictionLedgerDraft): PredictionLedgerEntry {
  return createRecord(normalizedPrediction(input));
}

export function createOutcomeLedgerEntry(input: OutcomeLedgerDraft): OutcomeLedgerEntry {
  return createRecord(normalizedOutcome(input));
}

function safeRecordId(input: unknown) {
  const value = (input as { recordId?: unknown })?.recordId;
  return typeof value === "string" && HASH.test(value) ? value : "invalid-record";
}

function validateRecord(input: unknown) {
  const recordId = safeRecordId(input);
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid ledger entry");
    const row = input as Record<string, any>;
    if (row.schemaVersion !== SCHEMA_VERSION || !HASH.test(String(row.recordId))) throw new TypeError("Invalid ledger metadata");
    const draft = row.kind === "prediction" ? normalizedPrediction(row) : normalizedOutcome(row);
    const expectedId = sha256({ schemaVersion: SCHEMA_VERSION, ...draft });
    if (expectedId !== row.recordId) return { recordId, record: null, diagnostics: ["TAMPERED_RECORD"] as Diagnostic[] };
    return { recordId, record: createRecord(draft) as PredictionLedgerRecord, diagnostics: [] as Diagnostic[] };
  } catch {
    return { recordId, record: null, diagnostics: ["INVALID_RECORD"] as Diagnostic[] };
  }
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].sort() as T[];
}

export function validatePredictionLedgerBatch(inputs: unknown, options: PredictionLedgerBatchOptions) {
  if (!Array.isArray(inputs)) throw new TypeError("Prediction ledger batch must be an array");
  if (!Number.isSafeInteger(options?.maxBatchSize) || options.maxBatchSize < 1 || options.maxBatchSize > 500) throw new TypeError("Invalid prediction ledger batch limit");
  if (inputs.length > options.maxBatchSize) {
    return { status: "rejected", diagnostics: ["BATCH_LIMIT_EXCEEDED"] as Diagnostic[], accepted: [] as PredictionLedgerRecord[], rejected: [] as { recordId: string; diagnostics: Diagnostic[] }[], deduplicatedRecordIds: [] as string[], retryDisposition: "split_batch_no_automatic_replay" };
  }

  const diagnostics = [] as Diagnostic[];
  const rejected = [] as { recordId: string; diagnostics: Diagnostic[] }[];
  const candidates = [] as PredictionLedgerRecord[];
  for (const input of inputs) {
    const checked = validateRecord(input);
    if (checked.record) candidates.push(checked.record);
    else {
      diagnostics.push(...checked.diagnostics);
      rejected.push({ recordId: checked.recordId, diagnostics: checked.diagnostics });
    }
  }

  const byRecord = new Map<string, PredictionLedgerRecord[]>();
  for (const row of candidates) byRecord.set(row.recordId, [...(byRecord.get(row.recordId) ?? []), row]);
  const deduplicatedRecordIds = [...byRecord].filter(([, rows]) => rows.length > 1).map(([recordId]) => recordId).sort();
  const unique = [...byRecord.values()].map(rows => rows[0]);

  const byLedgerKey = new Map<string, PredictionLedgerRecord[]>();
  for (const row of unique) byLedgerKey.set(row.ledgerKey, [...(byLedgerKey.get(row.ledgerKey) ?? []), row]);
  const blocked = new Map<string, Diagnostic>();
  for (const rows of byLedgerKey.values()) {
    if (new Set(rows.map(row => row.recordId)).size > 1) rows.forEach(row => blocked.set(row.recordId, "CONFLICTING_RECORD"));
  }
  if (blocked.size) diagnostics.push("CONFLICTING_RECORD");

  const prior = [] as PredictionLedgerEntry[];
  for (const item of options.priorPredictions ?? []) {
    const checked = validateRecord(item);
    if (!checked.record || checked.record.kind !== "prediction") throw new TypeError("Invalid prior prediction entry");
    prior.push(checked.record);
  }
  const predictions = new Map<string, PredictionLedgerEntry>();
  for (const row of [...prior, ...unique.filter((item): item is PredictionLedgerEntry => item.kind === "prediction" && !blocked.has(item.recordId))]) predictions.set(row.recordId, row);

  for (const row of unique.filter((item): item is OutcomeLedgerEntry => item.kind === "outcome" && !blocked.has(item.recordId))) {
    const prediction = predictions.get(row.predictionId);
    if (!prediction) blocked.set(row.recordId, "MISSING_PREDICTION");
    else if (prediction.eventId !== row.eventId || prediction.market.settlementRuleId !== row.settlementRuleId || prediction.producerId === row.verifierId || Date.parse(row.resultObservedAt) < Date.parse(prediction.eventTime)) blocked.set(row.recordId, "SETTLEMENT_MISMATCH");
  }
  for (const row of unique.filter(item => blocked.has(item.recordId))) {
    const diagnostic = blocked.get(row.recordId)!;
    diagnostics.push(diagnostic);
    rejected.push({ recordId: row.recordId, diagnostics: [diagnostic] });
  }

  const accepted = unique.filter(row => !blocked.has(row.recordId)).sort((left, right) => left.recordId.localeCompare(right.recordId));
  return {
    status: rejected.length ? accepted.length ? "partial" : "rejected" : "accepted",
    diagnostics: uniqueSorted(diagnostics),
    accepted,
    rejected: rejected.map(item => ({ recordId: item.recordId, diagnostics: uniqueSorted(item.diagnostics) })).sort((left, right) => left.recordId.localeCompare(right.recordId) || left.diagnostics.join("|").localeCompare(right.diagnostics.join("|"))),
    deduplicatedRecordIds,
    retryDisposition: "do_not_retry_automatically"
  };
}

import { createHash } from "node:crypto";

export type SnapshotKind = "schedule" | "result" | "odds";
export type SnapshotPayload =
  | { status: "scheduled" | "postponed" | "cancelled"; scheduledStart: string; venueId: string | null }
  | { status: "final"; homeScore: number; awayScore: number }
  | { bookmakerId: string; marketId: string; selectionId: string; decimalOdds: number; observedAt: string; live: false };

export type SnapshotDraft = {
  kind: SnapshotKind;
  providerId: string;
  providerEventId: string;
  canonicalEventId: string;
  sportId: string;
  competitionId: string;
  homeParticipantId: string;
  awayParticipantId: string;
  eventTime: string;
  timePrecision: "second" | "millisecond";
  timezoneBasis: "utc" | "explicit_offset";
  retrievedAt: string;
  sourceId: string;
  sourceVersion: string;
  sourceRevision: number;
  origin: "observed_record" | "registry_candidate";
  licence: {
    rightsStatus: "approved" | "unknown" | "blocked";
    licenceId: string | null;
    attributionRequired: boolean;
    attributionPresent: boolean;
  };
  payload: SnapshotPayload;
};

export type SnapshotEnvelope = SnapshotDraft & {
  schemaVersion: "win.evidence-snapshot.v1";
  payloadHash: string;
  snapshotId: string;
};

export type SnapshotBatchOptions = {
  asOf: string;
  maxBatchSize: number;
  maxAgeMs: Record<SnapshotKind, number>;
};

type Diagnostic =
  | "AMBIGUOUS_IDENTITY"
  | "BATCH_LIMIT_EXCEEDED"
  | "CANDIDATE_NOT_EVIDENCE"
  | "FUTURE_RETRIEVAL"
  | "INVALID_SNAPSHOT"
  | "NON_MONOTONIC_REVISION"
  | "REVISION_CONFLICT"
  | "RIGHTS_NOT_APPROVED"
  | "STALE_SNAPSHOT"
  | "TAMPERED_SNAPSHOT"
  | "TEMPORAL_CONFLICT";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SCHEMA_VERSION = "win.evidence-snapshot.v1" as const;

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function instant(value: unknown) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Snapshot numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("Snapshot values must be JSON-compatible");
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

function exactTimezone(value: string, basis: SnapshotDraft["timezoneBasis"]) {
  return basis === "utc" ? value.endsWith("Z") : /[+-]\d{2}:\d{2}$/u.test(value);
}

function validatePayload(kind: SnapshotKind, payload: unknown, eventMs: number, retrievedMs: number) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Invalid snapshot payload");
  const row = payload as Record<string, unknown>;
  if (kind === "schedule") {
    if (!["scheduled", "postponed", "cancelled"].includes(String(row.status)) || instant(row.scheduledStart) !== eventMs || !(row.venueId === null || safeId(row.venueId))) throw new TypeError("Invalid schedule snapshot");
    return { status: row.status, scheduledStart: row.scheduledStart, venueId: row.venueId } as SnapshotPayload;
  }
  if (kind === "result") {
    if (row.status !== "final" || !Number.isSafeInteger(row.homeScore) || Number(row.homeScore) < 0 || !Number.isSafeInteger(row.awayScore) || Number(row.awayScore) < 0 || retrievedMs < eventMs) throw new TypeError("Invalid result snapshot");
    return { status: "final", homeScore: Number(row.homeScore), awayScore: Number(row.awayScore) } as SnapshotPayload;
  }
  const observedMs = instant(row.observedAt);
  if (!safeId(row.bookmakerId) || !safeId(row.marketId) || !safeId(row.selectionId) || typeof row.decimalOdds !== "number" || !Number.isFinite(row.decimalOdds) || row.decimalOdds <= 1 || row.decimalOdds > 10_000 || observedMs === null || row.live !== false || observedMs > retrievedMs || observedMs >= eventMs) throw new TypeError("Invalid odds snapshot");
  return { bookmakerId: row.bookmakerId, marketId: row.marketId, selectionId: row.selectionId, decimalOdds: row.decimalOdds, observedAt: row.observedAt as string, live: false };
}

function normalizedDraft(input: unknown): SnapshotDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid snapshot draft");
  const row = input as Record<string, any>;
  const kind = row.kind as SnapshotKind;
  if (!["schedule", "result", "odds"].includes(kind)) throw new TypeError("Invalid snapshot kind");
  const requiredIds = ["providerId", "providerEventId", "canonicalEventId", "sportId", "competitionId", "homeParticipantId", "awayParticipantId", "sourceId", "sourceVersion"];
  if (requiredIds.some(field => !safeId(row[field])) || row.homeParticipantId === row.awayParticipantId) throw new TypeError("Invalid snapshot identity");
  const eventMs = instant(row.eventTime);
  const retrievedMs = instant(row.retrievedAt);
  if (eventMs === null || retrievedMs === null || !["second", "millisecond"].includes(row.timePrecision) || !["utc", "explicit_offset"].includes(row.timezoneBasis) || !exactTimezone(row.eventTime, row.timezoneBasis)) throw new TypeError("Invalid snapshot timestamp");
  if (row.timePrecision === "second" && eventMs % 1000 !== 0) throw new TypeError("Snapshot precision mismatch");
  if (!Number.isSafeInteger(row.sourceRevision) || row.sourceRevision < 1) throw new TypeError("Invalid source revision");
  if (row.origin !== "observed_record") throw new TypeError("Registry candidates are not evidence");
  const licence = row.licence;
  if (!licence || licence.rightsStatus !== "approved" || !safeId(licence.licenceId) || typeof licence.attributionRequired !== "boolean" || typeof licence.attributionPresent !== "boolean" || (licence.attributionRequired && !licence.attributionPresent)) throw new TypeError("Snapshot rights are not approved");
  const payload = validatePayload(kind, row.payload, eventMs, retrievedMs);
  return {
    kind,
    providerId: row.providerId,
    providerEventId: row.providerEventId,
    canonicalEventId: row.canonicalEventId,
    sportId: row.sportId,
    competitionId: row.competitionId,
    homeParticipantId: row.homeParticipantId,
    awayParticipantId: row.awayParticipantId,
    eventTime: row.eventTime,
    timePrecision: row.timePrecision,
    timezoneBasis: row.timezoneBasis,
    retrievedAt: row.retrievedAt,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    sourceRevision: row.sourceRevision,
    origin: "observed_record",
    licence: {
      rightsStatus: "approved",
      licenceId: licence.licenceId,
      attributionRequired: licence.attributionRequired,
      attributionPresent: licence.attributionPresent
    },
    payload
  };
}

function envelopeIdentity(draft: SnapshotDraft, payloadHash: string) {
  const { payload: _payload, ...metadata } = draft;
  return { schemaVersion: SCHEMA_VERSION, ...metadata, payloadHash };
}

export function createSnapshotEnvelope(input: SnapshotDraft): SnapshotEnvelope {
  const draft = normalizedDraft(input);
  const payloadHash = sha256(draft.payload);
  const snapshotId = sha256(envelopeIdentity(draft, payloadHash));
  return deepFreeze({ schemaVersion: SCHEMA_VERSION, ...draft, payloadHash, snapshotId });
}

function safeSnapshotId(input: unknown) {
  const value = (input as { snapshotId?: unknown })?.snapshotId;
  return typeof value === "string" && HASH.test(value) ? value : "invalid-snapshot";
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].sort() as T[];
}

function validateEnvelope(input: unknown) {
  const snapshotId = safeSnapshotId(input);
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid envelope");
    const row = input as Record<string, any>;
    if (row.schemaVersion !== SCHEMA_VERSION || !HASH.test(String(row.payloadHash)) || !HASH.test(String(row.snapshotId))) throw new TypeError("Invalid envelope metadata");
    const draft = normalizedDraft(row);
    const payloadHash = sha256(draft.payload);
    const expectedId = sha256(envelopeIdentity(draft, payloadHash));
    if (payloadHash !== row.payloadHash || expectedId !== row.snapshotId) return { snapshotId, envelope: null, diagnostics: ["TAMPERED_SNAPSHOT"] as Diagnostic[] };
    return { snapshotId, envelope: deepFreeze({ schemaVersion: SCHEMA_VERSION, ...draft, payloadHash, snapshotId: expectedId }), diagnostics: [] as Diagnostic[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const diagnostic: Diagnostic = message.includes("Registry candidates") ? "CANDIDATE_NOT_EVIDENCE" : message.includes("rights") ? "RIGHTS_NOT_APPROVED" : message.includes("result snapshot") || message.includes("odds snapshot") ? "TEMPORAL_CONFLICT" : "INVALID_SNAPSHOT";
    return { snapshotId, envelope: null, diagnostics: [diagnostic] };
  }
}

function identityKey(envelope: SnapshotEnvelope) {
  return [envelope.canonicalEventId, envelope.sportId, envelope.competitionId, envelope.homeParticipantId, envelope.awayParticipantId, envelope.eventTime].join("|");
}

function aliasKey(envelope: SnapshotEnvelope) {
  return `${envelope.providerId}:${envelope.providerEventId}`;
}

function revisionScope(envelope: SnapshotEnvelope) {
  return [envelope.providerId, envelope.sourceId, envelope.providerEventId, envelope.kind].join("|");
}

export function validateSnapshotBatch(inputs: unknown, options: SnapshotBatchOptions) {
  if (!Array.isArray(inputs)) throw new TypeError("Snapshot batch must be an array");
  const asOfMs = instant(options?.asOf);
  if (asOfMs === null) throw new TypeError("Batch asOf must be an ISO-8601 instant with timezone");
  if (!Number.isSafeInteger(options?.maxBatchSize) || options.maxBatchSize < 1 || options.maxBatchSize > 500) throw new TypeError("Invalid snapshot batch limit");
  if (!options.maxAgeMs || ["schedule", "result", "odds"].some(kind => !Number.isSafeInteger(options.maxAgeMs[kind as SnapshotKind]) || options.maxAgeMs[kind as SnapshotKind] < 1)) throw new TypeError("Invalid snapshot freshness policy");
  if (inputs.length > options.maxBatchSize) {
    return { status: "rejected", diagnostics: ["BATCH_LIMIT_EXCEEDED"] as Diagnostic[], accepted: [] as SnapshotEnvelope[], rejected: [] as { snapshotId: string; diagnostics: Diagnostic[] }[], deduplicatedSnapshotIds: [] as string[], retryDisposition: "split_batch_no_automatic_replay" };
  }

  const diagnostics = [] as Diagnostic[];
  const rejected = [] as { snapshotId: string; diagnostics: Diagnostic[] }[];
  const candidates = [] as SnapshotEnvelope[];
  for (const input of inputs) {
    const checked = validateEnvelope(input);
    if (!checked.envelope) {
      diagnostics.push(...checked.diagnostics);
      rejected.push({ snapshotId: checked.snapshotId, diagnostics: checked.diagnostics });
      continue;
    }
    const retrievedMs = instant(checked.envelope.retrievedAt)!;
    const rowDiagnostics = [] as Diagnostic[];
    if (retrievedMs > asOfMs) rowDiagnostics.push("FUTURE_RETRIEVAL");
    if (asOfMs - retrievedMs > options.maxAgeMs[checked.envelope.kind]) rowDiagnostics.push("STALE_SNAPSHOT");
    if (rowDiagnostics.length) {
      diagnostics.push(...rowDiagnostics);
      rejected.push({ snapshotId: checked.snapshotId, diagnostics: rowDiagnostics });
    } else candidates.push(checked.envelope);
  }

  const aliases = new Map<string, Set<string>>();
  for (const row of candidates) aliases.set(aliasKey(row), (aliases.get(aliasKey(row)) ?? new Set<string>()).add(identityKey(row)));
  const ambiguous = new Set([...aliases].filter(([, identities]) => identities.size > 1).map(([key]) => key));
  if (ambiguous.size) diagnostics.push("AMBIGUOUS_IDENTITY");
  const withoutAmbiguous = candidates.filter(row => {
    if (!ambiguous.has(aliasKey(row))) return true;
    rejected.push({ snapshotId: row.snapshotId, diagnostics: ["AMBIGUOUS_IDENTITY"] });
    return false;
  });

  const bySnapshot = new Map<string, SnapshotEnvelope[]>();
  for (const row of withoutAmbiguous) bySnapshot.set(row.snapshotId, [...(bySnapshot.get(row.snapshotId) ?? []), row]);
  const deduplicatedSnapshotIds = [] as string[];
  const unique = [] as SnapshotEnvelope[];
  for (const [snapshotId, rows] of bySnapshot) {
    unique.push(rows[0]);
    if (rows.length > 1) deduplicatedSnapshotIds.push(snapshotId);
  }

  const scopes = new Map<string, SnapshotEnvelope[]>();
  for (const row of unique) scopes.set(revisionScope(row), [...(scopes.get(revisionScope(row)) ?? []), row]);
  const blocked = new Map<string, Diagnostic>();
  for (const rows of scopes.values()) {
    const revisions = new Map<number, SnapshotEnvelope[]>();
    for (const row of rows) revisions.set(row.sourceRevision, [...(revisions.get(row.sourceRevision) ?? []), row]);
    if ([...revisions.values()].some(items => new Set(items.map(item => item.snapshotId)).size > 1)) {
      diagnostics.push("REVISION_CONFLICT");
      rows.forEach(row => blocked.set(row.snapshotId, "REVISION_CONFLICT"));
      continue;
    }
    const ordered = [...rows].sort((a, b) => a.sourceRevision - b.sourceRevision || a.snapshotId.localeCompare(b.snapshotId));
    for (let index = 1; index < ordered.length; index++) {
      if (Date.parse(ordered[index].retrievedAt) <= Date.parse(ordered[index - 1].retrievedAt)) {
        diagnostics.push("NON_MONOTONIC_REVISION");
        rows.forEach(row => blocked.set(row.snapshotId, "NON_MONOTONIC_REVISION"));
        break;
      }
    }
  }
  for (const row of unique.filter(item => blocked.has(item.snapshotId))) {
    rejected.push({ snapshotId: row.snapshotId, diagnostics: [blocked.get(row.snapshotId)!] });
  }
  const accepted = unique.filter(row => !blocked.has(row.snapshotId)).sort((a, b) => a.snapshotId.localeCompare(b.snapshotId));
  const allDiagnostics = uniqueSorted(diagnostics);
  return {
    status: rejected.length ? accepted.length ? "partial" : "rejected" : "accepted",
    diagnostics: allDiagnostics,
    accepted,
    rejected: rejected.map(item => ({ snapshotId: item.snapshotId, diagnostics: uniqueSorted(item.diagnostics) })).sort((a, b) => a.snapshotId.localeCompare(b.snapshotId) || a.diagnostics.join("|").localeCompare(b.diagnostics.join("|"))),
    deduplicatedSnapshotIds: uniqueSorted(deduplicatedSnapshotIds),
    retryDisposition: "do_not_retry_automatically"
  };
}

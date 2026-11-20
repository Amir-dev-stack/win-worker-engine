export type EvidenceClaim =
  | { type: "event_result"; status: "final"; homeScore: number; awayScore: number }
  | { type: "market_settlement"; marketId: string; selectionId: string; outcome: "won" | "lost" | "void" | "push" | "half_won" | "half_lost" };

export type EvidenceObservation = {
  observationId: string;
  providerId: string;
  providerEventId: string;
  canonicalEventId: string;
  sportId: string;
  competitionId: string;
  homeParticipantId: string;
  awayParticipantId: string;
  eventTime: string;
  retrievedAt: string;
  sourceId: string;
  sourceVersion: string;
  origin: "observed_record" | "registry_candidate";
  licence: {
    rightsStatus: "approved" | "unknown" | "blocked";
    licenceId: string | null;
    attributionRequired: boolean;
    attributionPresent: boolean;
  };
  claim: EvidenceClaim;
};

export type EvidenceResolutionOptions = {
  asOf: string;
  maxAgeMs: number;
  minIndependentProviders?: number;
  providerPriority?: string[];
};

type Diagnostic =
  | "AMBIGUOUS_IDENTITY"
  | "CANDIDATE_NOT_EVIDENCE"
  | "CONFLICTING_REPLAY"
  | "CONFLICTING_SETTLEMENT"
  | "CONTRADICTORY_RESULT"
  | "INVALID_OBSERVATION"
  | "MISSING_INDEPENDENT_EVIDENCE"
  | "MIXED_CLAIMS"
  | "NO_ELIGIBLE_EVIDENCE"
  | "PRIORITY_TIE"
  | "RIGHTS_NOT_APPROVED"
  | "RIGHTS_UNKNOWN"
  | "STALE_OBSERVATION"
  | "TIMESTAMP_CONFLICT"
  | "UNDATED_OBSERVATION";

type NormalizedObservation = EvidenceObservation & {
  eventMs: number;
  retrievedMs: number;
  identityKey: string;
  providerAliasKey: string;
  claimKey: string;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const OUTCOMES = new Set(["won", "lost", "void", "push", "half_won", "half_lost"]);

function safeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function auditId(value: unknown, _index: number) {
  return safeId(value) ? value : "invalid-observation";
}

function instant(value: unknown) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validScore(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function normalizeClaim(value: unknown): EvidenceClaim | null {
  if (!value || typeof value !== "object") return null;
  const claim = value as Record<string, unknown>;
  if (claim.type === "event_result") {
    if (claim.status !== "final" || !validScore(claim.homeScore) || !validScore(claim.awayScore)) return null;
    return { type: "event_result", status: "final", homeScore: Number(claim.homeScore), awayScore: Number(claim.awayScore) };
  }
  if (claim.type === "market_settlement") {
    if (!safeId(claim.marketId) || !safeId(claim.selectionId) || typeof claim.outcome !== "string" || !OUTCOMES.has(claim.outcome)) return null;
    return {
      type: "market_settlement",
      marketId: claim.marketId,
      selectionId: claim.selectionId,
      outcome: claim.outcome as "won" | "lost" | "void" | "push" | "half_won" | "half_lost"
    } as EvidenceClaim;
  }
  return null;
}

function claimKey(claim: EvidenceClaim) {
  return claim.type === "event_result"
    ? `event_result:${claim.homeScore}:${claim.awayScore}`
    : `market_settlement:${claim.marketId}:${claim.selectionId}:${claim.outcome}`;
}

function identityKey(observation: EvidenceObservation) {
  return [
    observation.canonicalEventId,
    observation.sportId,
    observation.competitionId,
    observation.homeParticipantId,
    observation.awayParticipantId,
    observation.eventTime
  ].join("|");
}

function stableSignature(observation: NormalizedObservation) {
  return [
    observation.observationId,
    observation.providerAliasKey,
    observation.identityKey,
    observation.sourceId,
    observation.sourceVersion,
    observation.retrievedAt,
    observation.origin,
    observation.licence.rightsStatus,
    observation.licence.licenceId ?? "",
    observation.licence.attributionRequired ? "1" : "0",
    observation.licence.attributionPresent ? "1" : "0",
    observation.claimKey
  ].join("|");
}

function replaySignature(observation: NormalizedObservation) {
  return [
    observation.providerAliasKey,
    observation.identityKey,
    observation.sourceId,
    observation.sourceVersion,
    observation.retrievedAt,
    observation.claimKey
  ].join("|");
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].sort() as T[];
}

function normalizeObservation(raw: unknown, index: number, asOfMs: number, maxAgeMs: number) {
  const observationId = auditId((raw as { observationId?: unknown })?.observationId, index);
  const diagnostics: Diagnostic[] = [];
  if (!raw || typeof raw !== "object") return { observationId, diagnostics: ["INVALID_OBSERVATION"] as Diagnostic[], observation: null };
  const row = raw as Record<string, any>;
  const requiredIds = ["observationId", "providerId", "providerEventId", "canonicalEventId", "sportId", "competitionId", "homeParticipantId", "awayParticipantId", "sourceId", "sourceVersion"];
  if (requiredIds.some(field => !safeId(row[field])) || row.homeParticipantId === row.awayParticipantId) diagnostics.push("INVALID_OBSERVATION");

  const eventMs = instant(row.eventTime);
  const retrievedMs = instant(row.retrievedAt);
  if (eventMs === null || retrievedMs === null) diagnostics.push("UNDATED_OBSERVATION");
  else {
    if (retrievedMs < eventMs || retrievedMs > asOfMs) diagnostics.push("TIMESTAMP_CONFLICT");
    if (asOfMs - retrievedMs > maxAgeMs) diagnostics.push("STALE_OBSERVATION");
  }

  const claim = normalizeClaim(row.claim);
  if (!claim) diagnostics.push("INVALID_OBSERVATION");
  if (row.origin === "registry_candidate") diagnostics.push("CANDIDATE_NOT_EVIDENCE");
  else if (row.origin !== "observed_record") diagnostics.push("INVALID_OBSERVATION");

  const licence = row.licence;
  if (!licence || typeof licence !== "object") diagnostics.push("RIGHTS_UNKNOWN");
  else if (licence.rightsStatus === "unknown") diagnostics.push("RIGHTS_UNKNOWN");
  else if (licence.rightsStatus !== "approved") diagnostics.push("RIGHTS_NOT_APPROVED");
  else if (!safeId(licence.licenceId) || typeof licence.attributionRequired !== "boolean" || typeof licence.attributionPresent !== "boolean" || (licence.attributionRequired && !licence.attributionPresent)) diagnostics.push("RIGHTS_NOT_APPROVED");

  if (diagnostics.length || eventMs === null || retrievedMs === null || !claim) {
    return { observationId, diagnostics: uniqueSorted(diagnostics), observation: null };
  }

  const normalized = {
    ...row,
    observationId,
    claim,
    eventMs,
    retrievedMs,
    identityKey: identityKey(row as EvidenceObservation),
    providerAliasKey: `${row.providerId}:${row.providerEventId}`,
    claimKey: claimKey(claim)
  } as NormalizedObservation;
  return { observationId, diagnostics: [] as Diagnostic[], observation: normalized };
}

export function resolveEvidenceConflict(rawObservations: unknown, options: EvidenceResolutionOptions) {
  if (!Array.isArray(rawObservations)) throw new TypeError("Evidence observations must be an array");
  const asOfMs = instant(options?.asOf);
  if (asOfMs === null) throw new TypeError("Resolution asOf must be an ISO-8601 instant with timezone");
  if (!Number.isSafeInteger(options?.maxAgeMs) || options.maxAgeMs < 1) throw new TypeError("Resolution maxAgeMs must be a positive safe integer");
  const minIndependentProviders = options.minIndependentProviders ?? 2;
  if (!Number.isSafeInteger(minIndependentProviders) || minIndependentProviders < 1 || minIndependentProviders > 10) throw new TypeError("Invalid independent-provider minimum");
  const providerPriority = options.providerPriority ?? [];
  if (!Array.isArray(providerPriority) || providerPriority.some(id => !safeId(id)) || new Set(providerPriority).size !== providerPriority.length) throw new TypeError("Invalid provider priority policy");

  const priority = new Map(providerPriority.map((providerId, index) => [providerId, index + 1]));
  const rejected = [] as { observationId: string; diagnostics: Diagnostic[] }[];
  const normalized = [] as NormalizedObservation[];
  rawObservations.forEach((raw, index) => {
    const result = normalizeObservation(raw, index, asOfMs, options.maxAgeMs);
    if (result.observation) normalized.push(result.observation);
    else rejected.push({ observationId: result.observationId, diagnostics: result.diagnostics });
  });

  const globalDiagnostics = rejected.flatMap(item => item.diagnostics);
  const aliasIdentities = new Map<string, Set<string>>();
  for (const row of normalized) {
    const identities = aliasIdentities.get(row.providerAliasKey) ?? new Set<string>();
    identities.add(row.identityKey);
    aliasIdentities.set(row.providerAliasKey, identities);
  }
  const ambiguousAliases = new Set([...aliasIdentities].filter(([, identities]) => identities.size > 1).map(([alias]) => alias));
  if (ambiguousAliases.size) globalDiagnostics.push("AMBIGUOUS_IDENTITY");

  const withoutAmbiguous = normalized.filter(row => {
    if (!ambiguousAliases.has(row.providerAliasKey)) return true;
    rejected.push({ observationId: row.observationId, diagnostics: ["AMBIGUOUS_IDENTITY"] });
    return false;
  });

  const observationIds = new Map<string, NormalizedObservation[]>();
  for (const row of withoutAmbiguous) observationIds.set(row.observationId, [...(observationIds.get(row.observationId) ?? []), row]);
  const replayRejectedIds = new Set<string>();
  const exactDuplicateIds = [] as string[];
  const uniqueById = [] as NormalizedObservation[];
  for (const [observationId, rows] of [...observationIds].sort(([a], [b]) => a.localeCompare(b))) {
    const signatures = new Set(rows.map(stableSignature));
    if (signatures.size > 1) {
      replayRejectedIds.add(observationId);
      rejected.push({ observationId, diagnostics: ["CONFLICTING_REPLAY"] });
      globalDiagnostics.push("CONFLICTING_REPLAY");
    } else {
      uniqueById.push(rows[0]);
      if (rows.length > 1) exactDuplicateIds.push(...rows.slice(1).map(row => row.observationId));
    }
  }

  const byReplay = new Map<string, NormalizedObservation[]>();
  for (const row of uniqueById) {
    if (replayRejectedIds.has(row.observationId)) continue;
    const key = replaySignature(row);
    byReplay.set(key, [...(byReplay.get(key) ?? []), row]);
  }
  const eligible = [] as NormalizedObservation[];
  for (const rows of byReplay.values()) {
    rows.sort((a, b) => a.observationId.localeCompare(b.observationId));
    eligible.push(rows[0]);
    exactDuplicateIds.push(...rows.slice(1).map(row => row.observationId));
  }

  eligible.sort((a, b) => a.observationId.localeCompare(b.observationId));
  const identityKeys = new Set(eligible.map(row => row.identityKey));
  if (identityKeys.size > 1) globalDiagnostics.push("AMBIGUOUS_IDENTITY");
  const claimTypes = new Set(eligible.map(row => row.claim.type));
  if (claimTypes.size > 1) globalDiagnostics.push("MIXED_CLAIMS");

  const values = new Map<string, NormalizedObservation[]>();
  for (const row of eligible) values.set(row.claimKey, [...(values.get(row.claimKey) ?? []), row]);
  if (!eligible.length) globalDiagnostics.push("NO_ELIGIBLE_EVIDENCE");
  if (values.size > 1 && claimTypes.size === 1) {
    globalDiagnostics.push(claimTypes.has("market_settlement") ? "CONFLICTING_SETTLEMENT" : "CONTRADICTORY_RESULT");
  }

  const rankedValues = [...values.entries()].map(([key, rows]) => ({
    key,
    claim: rows[0].claim,
    providers: uniqueSorted(rows.map(row => row.providerId)),
    bestPriority: Math.min(...rows.map(row => priority.get(row.providerId) ?? Number.MAX_SAFE_INTEGER))
  })).sort((a, b) => a.bestPriority - b.bestPriority || a.key.localeCompare(b.key));
  const preferredCandidate = rankedValues.length && (rankedValues.length === 1 || rankedValues[0].bestPriority < rankedValues[1].bestPriority)
    ? { claim: rankedValues[0].claim, providerIds: rankedValues[0].providers, priorityRank: rankedValues[0].bestPriority === Number.MAX_SAFE_INTEGER ? null : rankedValues[0].bestPriority }
    : null;
  if (rankedValues.length > 1 && !preferredCandidate) globalDiagnostics.push("PRIORITY_TIE");

  const providers = uniqueSorted(eligible.map(row => row.providerId));
  const structurallyBlocked = globalDiagnostics.includes("AMBIGUOUS_IDENTITY") || globalDiagnostics.includes("MIXED_CLAIMS") || values.size !== 1;
  if (!structurallyBlocked && eligible.length && providers.length < minIndependentProviders) globalDiagnostics.push("MISSING_INDEPENDENT_EVIDENCE");
  const resolved = !structurallyBlocked && eligible.length > 0 && providers.length >= minIndependentProviders;

  const provenance = eligible.map(row => ({
    observationId: row.observationId,
    providerId: row.providerId,
    providerEventId: row.providerEventId,
    canonicalEventId: row.canonicalEventId,
    sourceId: row.sourceId,
    sourceVersion: row.sourceVersion,
    eventTime: row.eventTime,
    retrievedAt: row.retrievedAt,
    licenceId: row.licence.licenceId,
    attributionConfirmed: !row.licence.attributionRequired || row.licence.attributionPresent,
    priorityRank: priority.get(row.providerId) ?? null,
    claim: row.claim
  })).sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER) || a.providerId.localeCompare(b.providerId) || a.observationId.localeCompare(b.observationId));

  return {
    status: resolved ? "resolved" : "unresolved",
    resolution: resolved ? rankedValues[0].claim : null,
    preferredCandidate,
    diagnostics: uniqueSorted(globalDiagnostics),
    missingEvidence: uniqueSorted(globalDiagnostics.filter(code => code === "MISSING_INDEPENDENT_EVIDENCE" || code === "NO_ELIGIBLE_EVIDENCE")),
    providerCount: providers.length,
    providers,
    deduplicatedObservationIds: uniqueSorted(exactDuplicateIds),
    rejected: rejected
      .map(item => ({ observationId: item.observationId, diagnostics: uniqueSorted(item.diagnostics) }))
      .sort((a, b) => a.observationId.localeCompare(b.observationId) || a.diagnostics.join("|").localeCompare(b.diagnostics.join("|"))),
    provenance,
    policy: {
      asOf: options.asOf,
      maxAgeMs: options.maxAgeMs,
      minIndependentProviders,
      providerPriority: [...providerPriority],
      conflictRule: "conflicts_remain_unresolved_priority_is_advisory"
    }
  };
}

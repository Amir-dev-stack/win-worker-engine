import { createHash } from "node:crypto";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";
import { canonicalizeWinMLProvenance } from "./ml-provenance.mts";
import { isPinnedWinMLSourceRevision } from "./ml-data-contract.mts";

export type WinFootballResultEvidenceRecordV1 = {
  evidenceVersion: "win.football.result-evidence.v1";
  providerId: string;
  independenceGroup: string;
  sourceRevision: string;
  sourceRecordId: string;
  recordSha256: string;
  retrievedAt: string;
  resultAvailableAt: string;
  eventId: string;
  competitionId: string;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  scoreBasis: "regulation_time";
  homeGoals: number;
  awayGoals: number;
};

export type WinFootballResultReconciliationStatus =
  | "source_diverse_match"
  | "source_diverse_conflict"
  | "unverifiable";

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

function validateEvidence(record: WinFootballResultEvidenceRecordV1, label: string): string[] {
  const errors: string[] = [];
  if (!record || record.evidenceVersion !== "win.football.result-evidence.v1") errors.push(label + "_version_invalid");
  for (const field of ["providerId", "independenceGroup", "sourceRecordId", "eventId", "competitionId", "homeTeamId", "awayTeamId"] as const) {
    if (!nonEmpty(record?.[field])) errors.push(label + "_" + field + "_required");
  }
  if (!isPinnedWinMLSourceRevision(record?.sourceRevision)) errors.push(label + "_source_revision_invalid");
  if (!validHash(record?.recordSha256)) errors.push(label + "_record_hash_invalid");
  for (const field of ["retrievedAt", "resultAvailableAt", "kickoff"] as const) {
    if (!isStrictIsoTimestamp(record?.[field])) errors.push(label + "_" + field + "_invalid");
  }
  if (isStrictIsoTimestamp(record?.kickoff) && isStrictIsoTimestamp(record?.resultAvailableAt) &&
      Date.parse(record.resultAvailableAt) < Date.parse(record.kickoff)) errors.push(label + "_result_precedes_kickoff");
  if (isStrictIsoTimestamp(record?.retrievedAt) && isStrictIsoTimestamp(record?.resultAvailableAt) &&
      Date.parse(record.resultAvailableAt) > Date.parse(record.retrievedAt)) errors.push(label + "_result_after_retrieval");
  if (record?.scoreBasis !== "regulation_time") errors.push(label + "_score_basis_invalid");
  if (!Number.isSafeInteger(record?.homeGoals) || record.homeGoals < 0 ||
      !Number.isSafeInteger(record?.awayGoals) || record.awayGoals < 0) errors.push(label + "_score_invalid");
  if (nonEmpty(record?.homeTeamId) && record.homeTeamId === record.awayTeamId) errors.push(label + "_teams_not_distinct");
  return errors;
}

/**
 * Compare two source-attributed regulation-time results for the same canonical WIN event.
 * Different provider IDs and declared independence groups are necessary but cannot prove
 * upstream ownership independence. The result is an audit classification, never a training
 * approval or an assertion that either source is authoritative.
 */
export function reconcileWinFootballResultEvidence(
  primary: WinFootballResultEvidenceRecordV1,
  corroborating: WinFootballResultEvidenceRecordV1
): {
  status: WinFootballResultReconciliationStatus;
  reasons: string[];
  evidenceSha256: string | null;
  trainingApprovalGranted: false;
} {
  const reasons = [
    ...validateEvidence(primary, "primary"),
    ...validateEvidence(corroborating, "corroborating")
  ];
  if (primary?.providerId === corroborating?.providerId) reasons.push("providers_must_differ");
  if (primary?.independenceGroup === corroborating?.independenceGroup) reasons.push("independence_groups_must_differ");
  for (const field of ["eventId", "competitionId", "kickoff", "homeTeamId", "awayTeamId"] as const) {
    if (primary?.[field] !== corroborating?.[field]) reasons.push("event_identity_mismatch:" + field);
  }
  if (primary?.scoreBasis !== corroborating?.scoreBasis) reasons.push("score_basis_mismatch");

  if (reasons.length) {
    return { status: "unverifiable", reasons: [...new Set(reasons)], evidenceSha256: null, trainingApprovalGranted: false };
  }

  const canonicalEvidence = canonicalizeWinMLProvenance({ primary, corroborating });
  const evidenceSha256 = createHash("sha256").update(canonicalEvidence, "utf8").digest("hex");
  const sameScore = primary.homeGoals === corroborating.homeGoals &&
    primary.awayGoals === corroborating.awayGoals;
  return {
    status: sameScore ? "source_diverse_match" : "source_diverse_conflict",
    reasons: sameScore ? [] : ["regulation_score_mismatch"],
    evidenceSha256,
    trainingApprovalGranted: false
  };
}

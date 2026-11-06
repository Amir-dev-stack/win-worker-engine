import { get, putIfNew } from "./store.mts";
import { hashWinMLProvenance } from "./ml-provenance.mts";
import {
  reconcileWinFootballResultEvidence,
  type WinFootballResultEvidenceRecordV1,
  type WinFootballResultReconciliationStatus
} from "./ml-football-result-reconciliation.mts";

const COLLECTION = "library/ml-football-result-evidence";
const VERSION = "win.football.result-evidence-record.v1";

type StoredEvidence = {
  recordVersion: typeof VERSION;
  evidenceId: string;
  createdAt: string;
  primary: WinFootballResultEvidenceRecordV1;
  corroborating: WinFootballResultEvidenceRecordV1;
  reconciliationStatus: WinFootballResultReconciliationStatus;
  reasons: string[];
  evidenceSha256: string;
  recordSha256: string;
};

export class WinFootballResultEvidenceRegistryError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "WinFootballResultEvidenceRegistryError";
    this.code = code;
  }
}

function verifyStored(record: StoredEvidence) {
  if (!record || record.recordVersion !== VERSION ||
      !/^[a-f0-9]{64}$/i.test(record.evidenceId || "") ||
      !/^[a-f0-9]{64}$/i.test(record.evidenceSha256 || "") ||
      !/^[a-f0-9]{64}$/i.test(record.recordSha256 || "") ||
      typeof record.createdAt !== "string" ||
      !Array.isArray(record.reasons)) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_record_invalid");
  }
  const reconciled = reconcileWinFootballResultEvidence(record.primary, record.corroborating);
  if (reconciled.status === "unverifiable" ||
      reconciled.status !== record.reconciliationStatus ||
      reconciled.evidenceSha256 !== record.evidenceSha256 ||
      JSON.stringify(reconciled.reasons) !== JSON.stringify(record.reasons)) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_reconciliation_mismatch");
  }
  const { recordSha256, ...payload } = record;
  if (hashWinMLProvenance(payload).sha256 !== recordSha256 ||
      record.evidenceId !== record.evidenceSha256) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_record_hash_mismatch");
  }
}

/**
 * Immutable audit storage for a valid two-source comparison. It records matches
 * and conflicts, but refuses unverifiable pairs. It does not prove source
 * ownership independence, assert an authoritative score, or grant training use.
 */
export async function registerWinFootballResultEvidence(args: {
  primary: WinFootballResultEvidenceRecordV1;
  corroborating: WinFootballResultEvidenceRecordV1;
  createdAt: string;
}) {
  const { primary, corroborating, createdAt } = args || ({} as any);
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_created_at_invalid");
  }
  const reconciliation = reconcileWinFootballResultEvidence(primary, corroborating);
  if (reconciliation.status === "unverifiable" || !reconciliation.evidenceSha256) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_unverifiable");
  }
  const payload = {
    recordVersion: VERSION,
    evidenceId: reconciliation.evidenceSha256,
    createdAt,
    primary,
    corroborating,
    reconciliationStatus: reconciliation.status,
    reasons: reconciliation.reasons,
    evidenceSha256: reconciliation.evidenceSha256
  };
  const record: StoredEvidence = {
    ...payload,
    recordSha256: hashWinMLProvenance(payload).sha256
  };
  const existing = await get<StoredEvidence>(COLLECTION, record.evidenceId);
  if (existing) {
    verifyStored(existing);
    if (existing.recordSha256 === record.recordSha256) {
      return { registered: false, idempotent: true, evidenceId: record.evidenceId,
        reconciliationStatus: record.reconciliationStatus, trainingApprovalGranted: false as const };
    }
    throw new WinFootballResultEvidenceRegistryError("result_evidence_immutable_conflict");
  }
  const result = await putIfNew(COLLECTION, record.evidenceId, record);
  if (result?.modified) {
    return { registered: true, idempotent: false, evidenceId: record.evidenceId,
      reconciliationStatus: record.reconciliationStatus, trainingApprovalGranted: false as const };
  }
  const raced = await get<StoredEvidence>(COLLECTION, record.evidenceId);
  if (raced) {
    verifyStored(raced);
    if (raced.recordSha256 === record.recordSha256) {
      return { registered: false, idempotent: true, evidenceId: record.evidenceId,
        reconciliationStatus: record.reconciliationStatus, trainingApprovalGranted: false as const };
    }
  }
  throw new WinFootballResultEvidenceRegistryError("result_evidence_immutable_conflict");
}

export async function getWinFootballResultEvidence(evidenceId: string) {
  if (typeof evidenceId !== "string" || !/^[a-f0-9]{64}$/i.test(evidenceId)) {
    throw new WinFootballResultEvidenceRegistryError("result_evidence_id_invalid");
  }
  const record = await get<StoredEvidence>(COLLECTION, evidenceId);
  if (!record) return null;
  verifyStored(record);
  return {
    evidenceId: record.evidenceId,
    createdAt: record.createdAt,
    primary: record.primary,
    corroborating: record.corroborating,
    reconciliationStatus: record.reconciliationStatus,
    reasons: record.reasons,
    evidenceSha256: record.evidenceSha256,
    recordSha256: record.recordSha256,
    trainingApprovalGranted: false as const
  };
}

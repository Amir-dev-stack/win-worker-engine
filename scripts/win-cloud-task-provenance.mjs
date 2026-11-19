const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/u;

function result(status, reason, details = {}) {
  return Object.freeze({
    status,
    reason,
    repository: REPOSITORY,
    dispatchOperations: 0,
    ...details
  });
}

function validTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Read-only evidence classifier. It cannot create or dispatch a cloud task. */
export function assessCloudTaskProvenance(record) {
  if (!record) return result("BLOCKED_EVIDENCE", "TASK_RECEIPT_NOT_AVAILABLE", {
    pcOffProof: "UNVERIFIED"
  });
  if (record.evidenceClass === "mock") {
    return result("MOCK_ONLY", "SIMULATED_TASK_RECORD", { pcOffProof: "UNVERIFIED" });
  }
  if (record.evidenceClass === "reported") {
    return result("REPORTED", "UNVERIFIED_REPORTED_TASK", { pcOffProof: "UNVERIFIED" });
  }
  if (record.provider !== "codex_cloud" || record.evidenceClass !== "live_receipt") {
    return result("BLOCKED_EVIDENCE", "NOT_CODEX_CLOUD_RECEIPT", { pcOffProof: "UNVERIFIED" });
  }

  const valid = TASK_ID.test(record.taskId) && safeHttpsUrl(record.taskUrl) &&
    record.repository === REPOSITORY && typeof record.workspace === "string" && record.workspace.length > 0 &&
    validTime(record.startedAt) && validTime(record.endedAt) &&
    Date.parse(record.endedAt) >= Date.parse(record.startedAt) &&
    record.permissionsVerified === true && record.finalState === "completed";
  if (!valid) return result("BLOCKED_EVIDENCE", "INCOMPLETE_OR_INVALID_RECEIPT", {
    pcOffProof: "UNVERIFIED"
  });

  const pcOffProof = record.pcOffProof === "independently_verified" ? "LIVE_VERIFIED" : "UNVERIFIED";
  return result("LIVE_VERIFIED", "CODEX_CLOUD_TASK_RECEIPT_VERIFIED", {
    taskId: record.taskId,
    taskUrl: record.taskUrl,
    workspace: record.workspace,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    finalState: record.finalState,
    permissionsVerified: true,
    pcOffProof
  });
}

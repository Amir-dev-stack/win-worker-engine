const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const SHA = /^[0-9a-f]{40}$/u;

function id(value, code = "INVALID_TAKEOVER_ID") {
  if (typeof value !== "string" || !ID.test(value)) throw Error(code);
  return value;
}

function evidence(value) {
  if (!["explicit_handoff", "lease_expired", "quota_exhausted"].includes(value)) {
    throw Error("PRIMARY_UNAVAILABLE_EVIDENCE_REQUIRED");
  }
  return value;
}

export function createBackupTakeoverController({ store } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.write !== "function") {
    throw Error("TAKEOVER_STORE_REQUIRED");
  }
  let claimLock = Promise.resolve();
  async function load(taskId) { return store.read(id(taskId)); }
  async function save(state) { await store.write(Object.freeze({ ...state })); return state; }
  return Object.freeze({
    async register({ taskId, primaryId, sourceSha, operationId } = {}) {
      id(taskId); id(primaryId); id(operationId);
      if (!SHA.test(sourceSha || "")) throw Error("SOURCE_SHA_REQUIRED");
      const current = await load(taskId);
      if (current) throw Error("TAKEOVER_TASK_EXISTS");
      return save({ taskId, primaryId, sourceSha, operationId, state: "primary_active", backupId: null, backupSha: null, evidence: null });
    },
    async markUnavailable(taskId, reason) {
      const current = await load(taskId);
      if (!current || current.state !== "primary_active") throw Error("PRIMARY_NOT_ACTIVE");
      return save({ ...current, state: "backup_eligible", evidence: evidence(reason) });
    },
    async claim(taskId, backupId) {
      id(backupId);
      const run = claimLock.then(async () => {
        const current = await load(taskId);
        if (!current || current.state !== "backup_eligible") throw Error("BACKUP_NOT_ELIGIBLE");
        return save({ ...current, state: "backup_working", backupId });
      });
      claimLock = run.catch(() => undefined);
      return run;
    },
    async complete(taskId, backupSha, testsPassed) {
      const current = await load(taskId);
      if (!current || current.state !== "backup_working") throw Error("BACKUP_NOT_WORKING");
      if (!SHA.test(backupSha || "") || testsPassed !== true) throw Error("BACKUP_EVIDENCE_REQUIRED");
      return save({ ...current, state: "awaiting_primary_review", backupSha });
    },
    async review(taskId, decision) {
      const current = await load(taskId);
      if (!current || current.state !== "awaiting_primary_review") throw Error("BACKUP_REVIEW_REQUIRED");
      if (!["accepted", "repair_required", "rejected"].includes(decision)) throw Error("INVALID_REVIEW_DECISION");
      const state = decision === "accepted" ? "restored" : decision;
      return save({ ...current, state, review: decision });
    },
    async restore(taskId, primaryId) {
      const current = await load(taskId);
      id(primaryId);
      if (!current || current.state !== "restored" || current.primaryId !== primaryId) throw Error("PRIMARY_RESTORE_NOT_AUTHORIZED");
      return save({ ...current, state: "primary_active", backupId: null, backupSha: null, evidence: null });
    },
    get: load
  });
}

export function createMemoryTakeoverStore() {
  const records = new Map();
  return {
    async read(taskId) { return records.get(taskId) || null; },
    async write(record) { records.set(record.taskId, record); }
  };
}

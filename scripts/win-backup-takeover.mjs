const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const CLAIM = /^[A-Za-z0-9._:-]{1,160}$/u;

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

function claimToken(value) {
  if (typeof value !== "string" || !CLAIM.test(value)) throw Error("TAKEOVER_CLAIM_TOKEN_REQUIRED");
  return value;
}

export function createBackupTakeoverController({ store } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.compareAndSet !== "function") {
    throw Error("ATOMIC_TAKEOVER_STORE_REQUIRED");
  }
  async function load(taskId) { return store.read(id(taskId)); }
  async function cas(current, expectedState, patch) {
    const next = await store.compareAndSet({
      taskId: current.taskId,
      expectedVersion: current.version,
      expectedState,
      patch
    });
    if (!next) throw Error("TAKEOVER_STATE_CHANGED");
    return next;
  }
  return Object.freeze({
    async register({ taskId, primaryId, sourceSha, operationId } = {}) {
      id(taskId); id(primaryId); id(operationId);
      if (!SHA.test(sourceSha || "")) throw Error("SOURCE_SHA_REQUIRED");
      const current = await load(taskId);
      if (current) throw Error("TAKEOVER_TASK_EXISTS");
      const record = {
        taskId, primaryId, sourceSha, operationId, version: 1,
        authorizedReviewers: [primaryId], state: "primary_active",
        backupId: null, claimToken: null, backupSha: null,
        evidence: null, review: null, reviewerId: null
      };
      if (typeof store.create !== "function") throw Error("ATOMIC_TAKEOVER_STORE_REQUIRED");
      return store.create(Object.freeze(record));
    },
    async markUnavailable(taskId, reason) {
      const current = await load(taskId);
      if (!current || current.state !== "primary_active") throw Error("PRIMARY_NOT_ACTIVE");
      return cas(current, "primary_active", { state: "backup_eligible", evidence: evidence(reason) });
    },
    async claim(taskId, backupId, takeoverToken) {
      id(backupId);
      const token = claimToken(takeoverToken);
      const current = await load(taskId);
      if (!current || current.state !== "backup_eligible") throw Error("BACKUP_NOT_ELIGIBLE");
      return cas(current, "backup_eligible", { state: "backup_working", backupId, claimToken: token });
    },
    async complete(taskId, { backupId, claimToken: token, backupSha, testsPassed } = {}) {
      const current = await load(taskId);
      if (!current || current.state !== "backup_working") throw Error("BACKUP_NOT_WORKING");
      id(backupId); claimToken(token);
      if (current.backupId !== backupId || current.claimToken !== token) throw Error("BACKUP_CLAIM_MISMATCH");
      if (!SHA.test(backupSha || "") || testsPassed !== true) throw Error("BACKUP_EVIDENCE_REQUIRED");
      return cas(current, "backup_working", { state: "awaiting_primary_review", backupSha });
    },
    async review(taskId, decision, reviewerId, reviewedClaimToken) {
      const current = await load(taskId);
      if (!current || current.state !== "awaiting_primary_review") throw Error("BACKUP_REVIEW_REQUIRED");
      id(reviewerId); claimToken(reviewedClaimToken);
      if (current.claimToken !== reviewedClaimToken || current.backupId === reviewerId ||
          !current.authorizedReviewers.includes(reviewerId)) throw Error("INDEPENDENT_REVIEW_REQUIRED");
      if (!["accepted", "repair_required", "rejected"].includes(decision)) throw Error("INVALID_REVIEW_DECISION");
      const state = decision === "accepted" ? "restored" : decision;
      return cas(current, "awaiting_primary_review", { state, review: decision, reviewerId });
    },
    async restore(taskId, primaryId) {
      const current = await load(taskId);
      id(primaryId);
      if (!current || current.state !== "restored" || current.primaryId !== primaryId) throw Error("PRIMARY_RESTORE_NOT_AUTHORIZED");
      return cas(current, "restored", {
        state: "primary_active", backupId: null, claimToken: null, backupSha: null,
        evidence: null, review: null, reviewerId: null
      });
    },
    get: load
  });
}

export function createMemoryTakeoverStore() {
  const records = new Map();
  return {
    async read(taskId) { return records.get(taskId) || null; },
    async create(record) {
      if (records.has(record.taskId)) throw Error("TAKEOVER_TASK_EXISTS");
      records.set(record.taskId, record);
      return record;
    },
    async compareAndSet({ taskId, expectedVersion, expectedState, patch }) {
      const current = records.get(taskId);
      if (!current || current.version !== expectedVersion || current.state !== expectedState) return null;
      const next = Object.freeze({ ...current, ...patch, version: current.version + 1 });
      records.set(taskId, next);
      return next;
    }
  };
}

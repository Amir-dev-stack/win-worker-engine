import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SHA = /^[0-9a-f]{40}$/u;
const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const STATES = new Set(["ready", "running", "waiting_limit", "resumable", "completed", "aborted"]);

function assertId(value, code = "INVALID_RECOVERY_ID") {
  if (typeof value !== "string" || !ID.test(value)) throw Error(code);
  return value;
}

function sanitizeCheckpoint(input) {
  if (!input || typeof input !== "object") throw Error("INVALID_CHECKPOINT");
  const taskId = assertId(input.taskId);
  const checkpointSha = input.checkpointSha == null ? null : input.checkpointSha;
  if (checkpointSha !== null && !SHA.test(checkpointSha)) throw Error("INVALID_CHECKPOINT_SHA");
  const operationId = assertId(input.operationId, "INVALID_OPERATION_ID");
  const sequence = input.sequence;
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw Error("INVALID_CHECKPOINT_SEQUENCE");
  return Object.freeze({ taskId, checkpointSha, operationId, sequence });
}

export function classifyModelFailure(error) {
  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  const status = Number(error?.status);
  if (["RATE_LIMIT", "QUOTA_EXHAUSTED", "USAGE_LIMIT", "CODEX_LIMIT_REACHED"].includes(code)
    || status === 429) return "usage_limit";
  if (["AUTH", "UNAUTHENTICATED", "INVALID_API_KEY"].includes(code) || status === 401) return "authentication";
  if (["NETWORK", "TIMEOUT", "CONNECTION_RESET"].includes(code)) return "network";
  if (["OUTAGE", "SERVICE_UNAVAILABLE"].includes(code) || status === 502 || status === 503) return "service_outage";
  return "unknown";
}

export function createRecoveryController({ store, now = () => new Date() } = {}) {
  if (!store || typeof store.read !== "function" || typeof store.write !== "function") {
    throw Error("RECOVERY_STORE_REQUIRED");
  }
  return Object.freeze({
    async start(checkpoint) {
      const safe = sanitizeCheckpoint(checkpoint);
      const existing = await store.read(safe.taskId);
      if (existing && existing.operationId !== safe.operationId) throw Error("RECOVERY_OPERATION_CONFLICT");
      const state = existing || { ...safe, state: "ready", resetAt: null, updatedAt: now().toISOString() };
      await store.write(state);
      return state;
    },
    async markRunning(taskId) {
      const current = await this.get(taskId);
      if (!current || !["ready", "resumable"].includes(current.state)) throw Error("RECOVERY_NOT_RESUMABLE");
      const next = { ...current, state: "running", updatedAt: now().toISOString() };
      await store.write(next);
      return next;
    },
    async recordFailure(taskId, error, resetAt) {
      const current = await this.get(taskId);
      if (!current) throw Error("RECOVERY_CHECKPOINT_MISSING");
      const kind = classifyModelFailure(error);
      if (kind !== "usage_limit") return { state: current.state, kind, resumed: false };
      const resetMs = Date.parse(resetAt);
      if (!Number.isFinite(resetMs) || resetMs <= now().getTime()) throw Error("INVALID_LIMIT_RESET");
      const next = { ...current, state: "waiting_limit", resetAt: new Date(resetMs).toISOString(), updatedAt: now().toISOString() };
      await store.write(next);
      return { state: next.state, kind, resumed: false, resetAt: next.resetAt };
    },
    async refresh(taskId) {
      const current = await this.get(taskId);
      if (!current || current.state !== "waiting_limit") return current;
      if (Date.parse(current.resetAt) > now().getTime()) return current;
      const next = { ...current, state: "resumable", resetAt: null, updatedAt: now().toISOString() };
      await store.write(next);
      return next;
    },
    async resume(taskId, operationId) {
      const current = await this.get(taskId);
      if (!current || current.state !== "resumable") throw Error("RECOVERY_RESET_NOT_VERIFIED");
      if (operationId !== current.operationId) throw Error("RECOVERY_OPERATION_CONFLICT");
      const next = { ...current, state: "running", updatedAt: now().toISOString() };
      await store.write(next);
      return next;
    },
    async resumeAfterReset(taskId, operationId) {
      const refreshed = await this.refresh(taskId);
      if (!refreshed || refreshed.state !== "resumable") return refreshed;
      return this.resume(taskId, operationId);
    },
    async complete(taskId) {
      const current = await this.get(taskId);
      if (!current || current.state !== "running") throw Error("RECOVERY_NOT_RUNNING");
      const next = { ...current, state: "completed", updatedAt: now().toISOString() };
      await store.write(next);
      return next;
    },
    async get(taskId) { return store.read(assertId(taskId)); }
  });
}

export function createMemoryRecoveryStore() {
  const records = new Map();
  return {
    async read(taskId) { return records.get(taskId) || null; },
    async write(record) { records.set(record.taskId, Object.freeze({ ...record })); }
  };
}

export function createJsonRecoveryStore(path) {
  if (typeof path !== "string" || !path) throw Error("RECOVERY_PATH_REQUIRED");
  return {
    async read(taskId) {
      try {
        const { readFile } = await import("node:fs/promises");
        const records = JSON.parse(await readFile(path, "utf8"));
        return records?.[taskId] || null;
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw Error("RECOVERY_STORE_UNREADABLE");
      }
    },
    async write(record) {
      let records = {};
      try {
        const { readFile } = await import("node:fs/promises");
        records = JSON.parse(await readFile(path, "utf8"));
      } catch (error) {
        if (error?.code !== "ENOENT") throw Error("RECOVERY_STORE_UNREADABLE");
      }
      records[record.taskId] = record;
      const temporary = `${path}.${process.pid}.tmp`;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
      await rename(temporary, path);
    }
  };
}

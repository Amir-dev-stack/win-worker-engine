import { promises as fs } from "node:fs";
import path from "node:path";

const ID = /^[A-Za-z0-9._:-]{1,120}$/u;
const MODELS = /^[A-Za-z0-9._-]{1,80}$/u;
const MAX_LEASE_MS = 15 * 60 * 1000;

function id(value, code = "INVALID_PERFORMANCE_ID") {
  if (typeof value !== "string" || !ID.test(value)) throw Error(code);
  return value;
}

function outcome(input) {
  if (!input || typeof input !== "object") throw Error("INVALID_PERFORMANCE_OUTCOME");
  id(input.agentId);
  if (!MODELS.test(input.model || "")) throw Error("INVALID_PERFORMANCE_MODEL");
  if (!["success", "failure", "blocked"].includes(input.status)) throw Error("INVALID_PERFORMANCE_STATUS");
  for (const field of ["durationMs", "resourceUnits"]) {
    if (!Number.isSafeInteger(input[field]) || input[field] < 0) throw Error("INVALID_PERFORMANCE_NUMBER");
  }
  if (!Number.isSafeInteger(input.reviewRejected) || input.reviewRejected < 0) throw Error("INVALID_REVIEW_COUNT");
  return Object.freeze({
    agentId: input.agentId, model: input.model, status: input.status,
    durationMs: input.durationMs, resourceUnits: input.resourceUnits,
    reviewRejected: input.reviewRejected, recovered: input.recovered === true,
    recordedAt: typeof input.recordedAt === "string" ? input.recordedAt : new Date().toISOString()
  });
}

function lease(value) {
  if (!value || typeof value !== "object" || !ID.test(value.ownerId || "") ||
      !Number.isSafeInteger(value.fence) || value.fence < 1 ||
      !Number.isSafeInteger(value.leaseExpiresAt)) throw Error("INVALID_PERFORMANCE_LEASE");
  return value;
}

function metrics(rows) {
  if (!rows.length) return { sampleSize: 0, successRate: null, recoveryRate: null, reviewRejectionRate: null, meanDurationMs: null, meanResourceUnits: null };
  const successes = rows.filter(row => row.status === "success").length;
  const recovered = rows.filter(row => row.recovered).length;
  const rejected = rows.reduce((sum, row) => sum + row.reviewRejected, 0);
  return {
    sampleSize: rows.length, successRate: successes / rows.length,
    recoveryRate: recovered / rows.length, reviewRejectionRate: rejected / rows.length,
    meanDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length,
    meanResourceUnits: rows.reduce((sum, row) => sum + row.resourceUnits, 0) / rows.length
  };
}

function validateState(state) {
  if (!state || typeof state !== "object" || !state.agents || typeof state.agents !== "object") throw Error("INVALID_PERFORMANCE_STATE");
  return state;
}

export function createFilePerformanceStore({ filePath, now = () => Date.now(), retryMs = 10, maxWaitMs = 2000 } = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw Error("PERFORMANCE_FILE_REQUIRED");
  const lockPath = `${filePath}.lock`;
  async function readState() {
    try { return validateState(JSON.parse(await fs.readFile(filePath, "utf8"))); }
    catch (error) { if (error?.code === "ENOENT") return { version: 1, agents: {} }; throw Error("INVALID_PERFORMANCE_STATE"); }
  }
  async function writeState(state) {
    const tmp = `${filePath}.${process.pid}.${now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state), { encoding: "utf8", flag: "wx" });
    await fs.rename(tmp, filePath);
  }
  async function withLock(fn) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const start = now();
    let handle;
    while (!handle) {
      try { handle = await fs.open(lockPath, "wx"); }
      catch (error) {
        if (error?.code !== "EEXIST" || now() - start > maxWaitMs) throw Error("PERFORMANCE_STORE_BUSY");
        await new Promise(resolve => setTimeout(resolve, retryMs));
      }
    }
    try { return await fn(); } finally { await handle.close(); await fs.unlink(lockPath).catch(() => {}); }
  }
  return Object.freeze({
    async claim(agentId, ownerId, leaseMs = 30_000) {
      id(agentId); id(ownerId);
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) throw Error("INVALID_PERFORMANCE_LEASE");
      return withLock(async () => {
        const state = await readState();
        const current = state.agents[agentId] || { fence: 0, lease: null, rows: [] };
        if (current.lease && current.lease.leaseExpiresAt > now() && current.lease.ownerId !== ownerId) return null;
        const nextLease = { ownerId, fence: current.fence + 1, leaseExpiresAt: now() + leaseMs };
        state.agents[agentId] = { ...current, fence: nextLease.fence, lease: nextLease };
        await writeState(state);
        return nextLease;
      });
    },
    async append(agentId, heldLease, record, windowSize = 20) {
      id(agentId); lease(heldLease);
      if (!Number.isSafeInteger(windowSize) || windowSize < 3 || windowSize > 1000) throw Error("INVALID_PERFORMANCE_WINDOW");
      const safe = outcome(record);
      if (safe.agentId !== agentId) throw Error("PERFORMANCE_AGENT_MISMATCH");
      return withLock(async () => {
        const state = await readState();
        const current = state.agents[agentId];
        if (!current?.lease || current.lease.ownerId !== heldLease.ownerId || current.lease.fence !== heldLease.fence || current.lease.leaseExpiresAt <= now()) throw Error("STALE_PERFORMANCE_FENCE");
        current.rows = [...current.rows, safe].slice(-windowSize);
        await writeState(state);
        return safe;
      });
    },
    async read(agentId) {
      id(agentId);
      const state = await readState();
      return [...(state.agents[agentId]?.rows || [])];
    }
  });
}

export function createFencedPerformanceLedger({ store, ownerId, windowSize = 20, leaseMs = 30_000 } = {}) {
  id(ownerId, "PERFORMANCE_OWNER_REQUIRED");
  if (!store || typeof store.claim !== "function" || typeof store.append !== "function" || typeof store.read !== "function") throw Error("FENCED_PERFORMANCE_STORE_REQUIRED");
  return Object.freeze({
    async record(outcomeRecord) {
      const agentId = id(outcomeRecord?.agentId);
      const held = await store.claim(agentId, ownerId, leaseMs);
      if (!held) throw Error("PERFORMANCE_LEASE_UNAVAILABLE");
      return store.append(agentId, held, outcomeRecord, windowSize);
    },
    async metrics(agentId) { return metrics(await store.read(id(agentId))); }
  });
}

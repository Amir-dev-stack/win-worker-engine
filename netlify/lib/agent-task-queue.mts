import { getWithMetadata, list, putIfMatch } from "./store.mts";

const TASK_COLLECTION = "library/agent-task-queue";
const MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 30 * 60 * 1000;

type PersistentAgentTask = {
  id: string;
  status: string;
  attempts?: number;
  createdAt?: string;
  lastAttemptAt?: string;
  leaseId?: string;
  leaseExpiresAt?: string | null;
  [key: string]: any;
};

function isStale(task: PersistentAgentTask, nowMs: number, leaseMs: number): boolean {
  const expiry = Date.parse(task.leaseExpiresAt || "");
  if (Number.isFinite(expiry)) return expiry <= nowMs;
  const lastAttempt = Date.parse(task.lastAttemptAt || "");
  return !Number.isFinite(lastAttempt) || lastAttempt <= nowMs - leaseMs;
}

/**
 * Atomically claims the oldest eligible task using the store's strong read
 * and conditional ETag write. Competing workers cannot claim the same version.
 */
export async function claimNextPersistentAgentTask(
  nowMs = Date.now(),
  leaseMs = DEFAULT_LEASE_MS
): Promise<PersistentAgentTask | null> {
  const tasks = await list<PersistentAgentTask>(TASK_COLLECTION, 1000);
  const candidates = tasks
    .filter(task => task && typeof task.id === "string" &&
      (task.status === "queued" || (task.status === "running" && isStale(task, nowMs, leaseMs))))
    .sort((a, b) => {
      const left = Date.parse(a.createdAt || "");
      const right = Date.parse(b.createdAt || "");
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
    });

  for (const candidate of candidates) {
    const current = await getWithMetadata<PersistentAgentTask>(TASK_COLLECTION, candidate.id);
    if (!current) continue;
    const task = current.value;
    const queued = task.status === "queued";
    const staleRunning = task.status === "running" && isStale(task, nowMs, leaseMs);
    if (!queued && !staleRunning) continue;

    const attempts = Math.max(0, Number(task.attempts || 0));
    if (attempts >= MAX_ATTEMPTS) {
      await putIfMatch(TASK_COLLECTION, task.id, {
        ...task,
        status: "failed",
        leaseExpiresAt: null,
        updatedAt: new Date(nowMs).toISOString(),
        error: "Maximum persistent agent task attempts reached."
      }, current.etag);
      continue;
    }

    const claimed: PersistentAgentTask = {
      ...task,
      status: "running",
      attempts: attempts + 1,
      lastAttemptAt: new Date(nowMs).toISOString(),
      leaseId: crypto.randomUUID(),
      leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      error: null
    };
    const result = await putIfMatch(TASK_COLLECTION, task.id, claimed, current.etag);
    if (result?.modified) return claimed;
  }
  return null;
}

/** Updates a task only while the caller still owns its unexpired lease. */
export async function updatePersistentAgentTaskLease(
  taskId: string,
  leaseId: string,
  patch: Record<string, unknown>,
  nowMs = Date.now()
): Promise<boolean> {
  if (!taskId || !leaseId) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await getWithMetadata<PersistentAgentTask>(TASK_COLLECTION, taskId);
    if (!current || current.value.status !== "running" || current.value.leaseId !== leaseId) return false;
    const expiry = Date.parse(current.value.leaseExpiresAt || "");
    if (Number.isFinite(expiry) && expiry <= nowMs) return false;
    const updated = {
      ...current.value,
      ...patch,
      id: taskId,
      leaseId,
      updatedAt: new Date(nowMs).toISOString()
    };
    const result = await putIfMatch(TASK_COLLECTION, taskId, updated, current.etag);
    if (result?.modified) return true;
  }
  return false;
}

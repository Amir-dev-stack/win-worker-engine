import { dirname } from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

const ID = /^[A-Za-z0-9._:-]{1,120}$/u;

function validId(value) { return typeof value === "string" && ID.test(value); }

const STATES = new Set(["idle", "running", "blocked", "paused", "stopped"]);

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !STATES.has(value.state)
    || !Array.isArray(value.completed) || !value.completed.every(validId)
    || !Array.isArray(value.blocked) || !value.blocked.every(validId)) {
    throw Error("INVALID_SCHEDULER_STATE");
  }
  return { ...value, completed: [...value.completed], blocked: [...value.blocked] };
}

export function createPersistentScheduler({ queue, lifecycle, stateStore, maxIterations = 8, now = () => new Date() } = {}) {
  if (!queue || typeof queue.nextEligible !== "function") throw Error("SCHEDULER_QUEUE_REQUIRED");
  if (!lifecycle || typeof lifecycle.run !== "function") throw Error("SCHEDULER_LIFECYCLE_REQUIRED");
  if (!stateStore || typeof stateStore.read !== "function" || typeof stateStore.write !== "function") throw Error("SCHEDULER_STATE_STORE_REQUIRED");
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 100) throw Error("INVALID_SCHEDULER_BOUND");
  async function load() { return (await stateStore.read()) || { state: "idle", completed: [], blocked: [], updatedAt: now().toISOString() }; }
  async function save(state) { const next = { ...state, updatedAt: now().toISOString() }; await stateStore.write(next); return next; }
  return Object.freeze({
    async runUntilBlocked(context = {}) {
      let state = await load();
      if (state.state === "stopped") return { state: "stopped", reason: "CHECKPOINT_STOPPED" };
      state = await save({ ...state, state: "running" });
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const task = await queue.nextEligible(state.completed, state.blocked);
        if (!task) return save({ ...state, state: "idle" });
        if (!validId(task.taskId) || state.completed.includes(task.taskId) || state.blocked.includes(task.taskId)) {
          state = await save({ ...state, state: "blocked", blocked: [...new Set([...state.blocked, task.taskId || "invalid-task"])] });
          return { ...state, reason: "INVALID_OR_DUPLICATE_TASK" };
        }
        const result = await lifecycle.run({ taskId: task.taskId, worker: context.worker, context: { ...context, ownerId: task.ownerId, ttlSeconds: task.ttlSeconds } });
        if (result.state === "completed") { state = await save({ ...state, completed: [...state.completed, task.taskId] }); continue; }
        state = await save({ ...state, state: "blocked", blocked: [...state.blocked, task.taskId] });
        return { ...state, result };
      }
      return save({ ...state, state: "paused", reason: "ITERATION_BOUND_REACHED" });
    },
    async stop(reason = "OWNER_STOP") { return save({ ...(await load()), state: "stopped", stopReason: reason }); },
    async checkpoint() { return load(); }
  });
}

export function createMemorySchedulerStateStore(initial = null) {
  let state = initial;
  return { async read() { return state; }, async write(next) { state = Object.freeze({ ...next, completed: [...next.completed], blocked: [...next.blocked] }); } };
}

/**
 * Atomic, local-only checkpoint storage for disposable worker restart tests.
 * The file contains task IDs and scheduler state only; it is not a distributed
 * lease or a substitute for the PostgreSQL adapter.
 */
export function createFileSchedulerStateStore(file) {
  if (typeof file !== "string" || file.length < 1 || file.length > 4096) throw Error("INVALID_SCHEDULER_STATE_FILE");
  return Object.freeze({
    async read() {
      let text;
      try { text = await readFile(file, "utf8"); }
      catch (error) { if (error?.code === "ENOENT") return null; throw error; }
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw Error("INVALID_SCHEDULER_STATE"); }
      return validateState(parsed);
    },
    async write(next) {
      const safe = validateState(next);
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(safe), { encoding: "utf8", flag: "wx" });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      return safe;
    }
  });
}

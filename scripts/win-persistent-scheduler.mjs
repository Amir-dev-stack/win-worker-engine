const ID = /^[A-Za-z0-9._:-]{1,120}$/u;

function validId(value) { return typeof value === "string" && ID.test(value); }

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

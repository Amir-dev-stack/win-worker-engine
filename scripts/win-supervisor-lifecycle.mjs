const ID = /^[A-Za-z0-9._:-]{1,120}$/u;

function requireId(value) {
  if (typeof value !== "string" || !ID.test(value)) throw Error("INVALID_LIFECYCLE_TASK");
  return value;
}

export function createSupervisorLifecycle({ queue, model, checkpoints, recovery, backup, handover, performance } = {}) {
  for (const component of [queue, model, checkpoints, recovery, backup, handover, performance]) {
    if (!component || typeof component !== "object") throw Error("LIFECYCLE_COMPONENTS_REQUIRED");
  }
  return Object.freeze({
    async run({ taskId, worker, context = {} } = {}) {
      requireId(taskId);
      if (typeof worker !== "function") throw Error("LIFECYCLE_WORKER_REQUIRED");
      const lease = await queue.claim(taskId, context.ownerId, context.ttlSeconds || 60);
      if (!lease) return { state: "idle", reason: "LEASE_NOT_ACQUIRED" };
      const selected = await model.select(context);
      await checkpoints.save(taskId, { phase: "started", model: selected.model, fence: lease.fence });
      try {
        const result = await worker({ taskId, model: selected, fence: lease.fence, context });
        await checkpoints.save(taskId, { phase: "completed", result });
        await handover.emit({ taskId, state: "completed", result });
        await performance.record({ taskId, model: selected.model, state: "completed" });
        return { state: "completed", result };
      } catch (error) {
        const kind = typeof error?.kind === "string" ? error.kind : "unknown";
        if (kind === "usage_limit") {
          await checkpoints.save(taskId, { phase: "waiting_limit", model: selected.model });
          await recovery.record(taskId, error);
          await handover.emit({ taskId, state: "waiting_limit" });
          return { state: "waiting_limit", reason: "USAGE_LIMIT" };
        }
        await checkpoints.save(taskId, { phase: "recovery_required", model: selected.model, error: kind });
        await recovery.record(taskId, error);
        await handover.emit({ taskId, state: "recovery_required" });
        return { state: "recovery_required", reason: kind };
      }
    },
    async resume({ taskId, operationId, worker, context = {} } = {}) {
      requireId(taskId);
      const ready = await recovery.resumeAfterReset(taskId, operationId);
      if (!ready || ready.state !== "running") return { state: ready?.state || "blocked", reason: "RESET_NOT_VERIFIED" };
      return this.run({ taskId, worker, context });
    },
    async takeover({ taskId, reason, backupId } = {}) {
      requireId(taskId);
      const claim = await backup.claim(taskId, backupId, reason);
      await handover.emit({ taskId, state: "backup_working", backupId, reason });
      return claim;
    }
  });
}

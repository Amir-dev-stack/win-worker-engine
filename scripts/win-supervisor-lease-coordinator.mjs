const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9._:-]{1,120}$/u;

function outcome(status, reason, details = {}) {
  return Object.freeze({ status, reason, ...details });
}

/**
 * Provider-neutral supervisor/lease composition. The injected effect sink must
 * enforce operation-id idempotency; this module has no GitHub or DB transport.
 */
export function createLeaseSupervisor({ store, effects } = {}) {
  if (!store || !effects || typeof effects.apply !== "function") throw Error("TRUSTED_COMPONENTS_REQUIRED");
  return Object.freeze({
    async run({ taskId, actorId, ttlSeconds, operationId, checkpointSha, signal } = {}) {
      if (!ID.test(taskId) || !ID.test(actorId) || !ID.test(operationId) || !SHA.test(checkpointSha)) {
        return outcome("blocked", "INVALID_TASK");
      }
      const lease = await store.claim(taskId, actorId, ttlSeconds);
      if (!lease) return outcome("idle", "LEASE_NOT_ACQUIRED");
      if (lease.task_type !== "draft_only_development") return outcome("blocked", "TASK_TYPE_NOT_AUTHORIZED", { fence: lease.fence });
      if (signal?.aborted) return outcome("cancelled", "ABORTED_BEFORE_EFFECT", { fence: lease.fence });

      // Renewal is the heartbeat and immediate pre-effect fencing check.
      const current = await store.renew(taskId, actorId, Number(lease.fence), ttlSeconds);
      if (!current) return outcome("blocked", "LEASE_LOST_BEFORE_EFFECT", { fence: lease.fence });
      if (signal?.aborted) return outcome("cancelled", "ABORTED_BEFORE_EFFECT", { fence: lease.fence });

      let effect;
      try {
        effect = await effects.apply({ taskId, fence: Number(lease.fence), operationId });
      } catch {
        return outcome("uncertain", "EFFECT_ACK_UNKNOWN_QUARANTINE_REQUIRED", { fence: lease.fence });
      }
      if (!effect || !["applied", "duplicate"].includes(effect.status)) {
        return outcome("uncertain", "EFFECT_NOT_CONFIRMED", { fence: lease.fence });
      }

      const checkpoint = await store.checkpoint(taskId, actorId, Number(lease.fence), checkpointSha);
      if (!checkpoint) return outcome("uncertain", "CHECKPOINT_REJECTED_AFTER_EFFECT", { fence: lease.fence });
      const completed = await store.complete(taskId, actorId, Number(lease.fence));
      if (!completed) return outcome("uncertain", "COMPLETION_REJECTED_AFTER_EFFECT", { fence: lease.fence });
      return outcome("completed", effect.status === "duplicate" ? "IDEMPOTENT_RECONCILIATION" : "EFFECT_COMMITTED", {
        fence: lease.fence, effectOperations: effect.status === "applied" ? 1 : 0
      });
    }
  });
}

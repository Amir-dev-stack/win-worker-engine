/**
 * WIN development-worker continuity decision policy.
 * Pure, offline, no network, shell, filesystem, scheduling or side effects.
 * Produces proposals ONLY. It never transfers a lease or starts an agent.
 */
const MAX_HEARTBEAT_AGE_MS = 30 * 60 * 1000;
const VALID_STATUSES = new Set(["active", "paused", "completed", "failed"]);
const VALID_BACKUPS = new Set(["cloud-independent-reviewer", "local-opencode-ollama"]);

function validTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function reject(reason, details = {}) {
  return { schema: "WIN_WORKER_FAILOVER_V1", action: "hold_and_report", reason, ...details };
}

export function proposeDevelopmentFailover(input, nowMs = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !Number.isFinite(nowMs)) return reject("invalid_input");
  const { task, primary, backup, approval } = input;
  if (!task || typeof task !== "object" || typeof task.id !== "string" ||
      !/^[A-Za-z0-9._-]{1,120}$/.test(task.id) ||
      typeof task.repository !== "string" ||
      task.repository !== "Amir-dev-stack/win-worker-engine") return reject("invalid_task");
  if (task.approved !== true || task.productionWriteAllowed !== false ||
      task.paidSpendAllowed !== false || task.scope !== "draft_only" ||
      !Array.isArray(task.allowedPaths) || task.allowedPaths.length === 0 ||
      task.allowedPaths.some(x => typeof x !== "string" || x.startsWith("/") || x.includes("..") || x.includes("\\"))) {
    return reject("task_not_strictly_approved");
  }
  if (!primary || !VALID_STATUSES.has(primary.status) ||
      typeof primary.workerId !== "string" || !primary.workerId ||
      typeof primary.leaseId !== "string" || !primary.leaseId) return reject("invalid_primary");

  const heartbeat = validTime(primary.lastHeartbeatAt);
  const leaseEnd = validTime(primary.leaseExpiresAt);
  if (heartbeat === null || leaseEnd === null || heartbeat > nowMs ||
      leaseEnd > nowMs + 24 * 60 * 60 * 1000) return reject("invalid_timestamps");
  if (primary.status === "completed") return reject("task_completed");
  if (primary.status === "active" && nowMs - heartbeat <= MAX_HEARTBEAT_AGE_MS && nowMs < leaseEnd) {
    return reject("primary_is_healthy");
  }
  if (nowMs < leaseEnd) return reject("primary_lease_active_do_not_overlap");
  if (!backup || !VALID_BACKUPS.has(backup.kind) || typeof backup.workerId !== "string" ||
      !backup.workerId || backup.workerId === primary.workerId || backup.ready !== true ||
      backup.isolatedWorkspace !== true || backup.permissions === undefined ||
      backup.permissions !== "read_only" ||
      backup.capability !== "review_and_propose") return reject("no_safe_backup_ready");
  if (backup.kind === "local-opencode-ollama" && backup.pcOnline !== true) {
    return reject("local_backup_offline");
  }
  if (!approval || approval.taskId !== task.id ||
      approval.backupWorkerId !== backup.workerId ||
      approval.primaryLeaseId !== primary.leaseId ||
      approval.authorized !== true ||
      validTime(approval.expiresAt) === null ||
      validTime(approval.expiresAt) <= nowMs) {
    return reject("backup_handoff_not_authorized");
  }

  return {
    schema: "WIN_WORKER_FAILOVER_V1",
    action: "propose_read_only_handoff",
    reason: "primary_not_active_and_lease_expired",
    taskId: task.id,
    replacementWorkerId: backup.workerId,
    allowedPaths: [...task.allowedPaths],
    constraints: ["no_production_writes", "no_paid_calls", "no_merge", "no_deploy",
      "no_secret_access", "no_direct_execution", "independent_review_required"],
    note: "Policy proposal only. A trusted supervisor must atomically reserve a new lease and independently authenticate the backup before execution."
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { proposeDevelopmentFailover } from "./win-development-failover-policy.mjs";

const NOW = Date.parse("2026-11-08T06:00:00Z");
const stamp = ms => new Date(ms).toISOString();
function base() {
  return {
    task: {
      id: "win-doc-review-1", repository: "Amir-dev-stack/win-worker-engine",
      approved: true, productionWriteAllowed: false, paidSpendAllowed: false,
      scope: "draft_only", allowedPaths: ["docs/WIN_CURRENT_STATUS.md"]
    },
    primary: {
      workerId: "codex-primary", status: "active", leaseId: "old-lease",
      lastHeartbeatAt: stamp(NOW - 60 * 60 * 1000),
      leaseExpiresAt: stamp(NOW - 60 * 1000)
    },
    backup: {
      kind: "cloud-independent-reviewer", workerId: "backup-reviewer",
      ready: true, isolatedWorkspace: true, permissions: "read_only",
      capability: "review_and_propose"
    },
    approval: {
      authorized: true, taskId: "win-doc-review-1",
      backupWorkerId: "backup-reviewer", primaryLeaseId: "old-lease",
      expiresAt: stamp(NOW + 15 * 60 * 1000)
    }
  };
}
test("expired primary and explicit scoped approval can propose read-only backup", () => {
  const result = proposeDevelopmentFailover(base(), NOW);
  assert.equal(result.action, "propose_read_only_handoff");
  assert.deepEqual(result.allowedPaths, ["docs/WIN_CURRENT_STATUS.md"]);
  assert.ok(result.constraints.includes("no_paid_calls"));
});
test("healthy active primary cannot be replaced", () => {
  const data = base();
  data.primary.lastHeartbeatAt = stamp(NOW - 1000);
  data.primary.leaseExpiresAt = stamp(NOW + 1000 * 60);
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "primary_is_healthy");
});
test("stale heartbeats do not override an unexpired primary lease", () => {
  const data = base();
  data.primary.leaseExpiresAt = stamp(NOW + 60 * 1000);
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "primary_lease_active_do_not_overlap");
});
test("missing owner authorization fails closed", () => {
  const data = base();
  data.approval.authorized = false;
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "backup_handoff_not_authorized");
});
test("approval tied to a different lease fails closed", () => {
  const data = base();
  data.approval.primaryLeaseId = "other-lease";
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "backup_handoff_not_authorized");
});
test("unsafe task or path fails closed", () => {
  const data = base();
  data.task.allowedPaths = ["../.env"];
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "task_not_strictly_approved");
});
test("primary completion should never cause takeover", () => {
  const data = base();
  data.primary.status = "completed";
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "task_completed");
});
test("local backup unavailable when PC off", () => {
  const data = base();
  data.backup.kind = "local-opencode-ollama";
  data.backup.pcOnline = false;
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "local_backup_offline");
});
test("backup must be isolated and read-only", () => {
  const data = base();
  data.backup.permissions = "write_all";
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "no_safe_backup_ready");
});
test("untrusted timestamps cannot authorize failover", () => {
  const data = base();
  data.primary.leaseExpiresAt = "tomorrow";
  assert.equal(proposeDevelopmentFailover(data, NOW).reason, "invalid_timestamps");
});

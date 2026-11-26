import test from "node:test";
import assert from "node:assert/strict";
import { createBackupTakeoverController, createMemoryTakeoverStore } from "./win-backup-takeover.mjs";

const sourceSha = "a".repeat(40);
const backupSha = "b".repeat(40);

test("requires verified primary loss, exclusive backup claim and independent review", async () => {
  const controller = createBackupTakeoverController({ store: createMemoryTakeoverStore() });
  await controller.register({ taskId: "task-1", primaryId: "codex", sourceSha, operationId: "op-1" });
  await assert.rejects(controller.claim("task-1", "backup", "before-loss"), /BACKUP_NOT_ELIGIBLE/);
  await assert.rejects(controller.markUnavailable("task-1", "silence"), /PRIMARY_UNAVAILABLE_EVIDENCE_REQUIRED/);
  await controller.markUnavailable("task-1", "lease_expired");
  const [one, two] = await Promise.allSettled([controller.claim("task-1", "backup-a", "backup-a"), controller.claim("task-1", "backup-b", "backup-b")]);
  assert.equal([one, two].filter(item => item.status === "fulfilled").length, 1);
  const claimed = await controller.get("task-1");
  assert.equal(claimed.state, "backup_working");
  assert.match(claimed.claimToken, /^backup-[ab]$/);
});

test("restores primary only after accepted backup review", async () => {
  const controller = createBackupTakeoverController({ store: createMemoryTakeoverStore() });
  await controller.register({ taskId: "task-2", primaryId: "codex", sourceSha, operationId: "op-2" });
  await controller.markUnavailable("task-2", "quota_exhausted");
  await controller.claim("task-2", "backup", "claim-2");
  await assert.rejects(controller.complete("task-2", { backupId: "backup", claimToken: "claim-2", backupSha, testsPassed: false }), /BACKUP_EVIDENCE_REQUIRED/);
  await controller.complete("task-2", { backupId: "backup", claimToken: "claim-2", backupSha, testsPassed: true });
  await assert.rejects(controller.restore("task-2", "codex"), /PRIMARY_RESTORE_NOT_AUTHORIZED/);
  await assert.rejects(controller.review("task-2", "accepted", "backup", "claim-2"), /INDEPENDENT_REVIEW_REQUIRED/);
  await controller.review("task-2", "accepted", "codex", "claim-2");
  assert.equal((await controller.restore("task-2", "codex")).state, "primary_active");
});

test("rejected or repair-required backup never restores primary", async () => {
  const controller = createBackupTakeoverController({ store: createMemoryTakeoverStore() });
  await controller.register({ taskId: "task-3", primaryId: "codex", sourceSha, operationId: "op-3" });
  await controller.markUnavailable("task-3", "explicit_handoff");
  await controller.claim("task-3", "backup", "claim-3");
  await controller.complete("task-3", { backupId: "backup", claimToken: "claim-3", backupSha, testsPassed: true });
  await controller.review("task-3", "repair_required", "codex", "claim-3");
  await assert.rejects(controller.restore("task-3", "codex"), /PRIMARY_RESTORE_NOT_AUTHORIZED/);
});

test("rejects stale completion after a new takeover generation", async () => {
  const controller = createBackupTakeoverController({ store: createMemoryTakeoverStore() });
  await controller.register({ taskId: "task-4", primaryId: "codex", sourceSha, operationId: "op-4" });
  await controller.markUnavailable("task-4", "lease_expired");
  await controller.claim("task-4", "backup-a", "generation-a");
  await controller.complete("task-4", { backupId: "backup-a", claimToken: "generation-a", backupSha, testsPassed: true });
  await controller.review("task-4", "accepted", "codex", "generation-a");
  await controller.restore("task-4", "codex");
  await controller.markUnavailable("task-4", "lease_expired");
  await controller.claim("task-4", "backup-b", "generation-b");
  await assert.rejects(controller.complete("task-4", { backupId: "backup-a", claimToken: "generation-a", backupSha, testsPassed: true }), /BACKUP_CLAIM_MISMATCH/);
});

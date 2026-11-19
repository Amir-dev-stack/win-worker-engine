import assert from "node:assert/strict";
import test from "node:test";
import { assessCloudTaskProvenance } from "./win-cloud-task-provenance.mjs";

const valid = {
  provider: "codex_cloud",
  evidenceClass: "live_receipt",
  taskId: "task_123456",
  taskUrl: "https://chatgpt.com/codex/tasks/task_123456",
  repository: "Amir-dev-stack/win-worker-engine",
  workspace: "managed-cloud/workspace-1",
  startedAt: "2026-11-19T12:00:00Z",
  endedAt: "2026-11-19T12:05:00Z",
  permissionsVerified: true,
  finalState: "completed"
};

test("missing receipt fails closed without inventing a task", () => {
  assert.deepEqual(assessCloudTaskProvenance(), {
    status: "BLOCKED_EVIDENCE", reason: "TASK_RECEIPT_NOT_AVAILABLE",
    repository: valid.repository, dispatchOperations: 0, pcOffProof: "UNVERIFIED"
  });
});

test("ChatGPT automation cannot prove a Codex Cloud task", () => {
  const result = assessCloudTaskProvenance({
    provider: "chatgpt_automation", evidenceClass: "live_receipt",
    taskId: "Automation_123456", taskUrl: "https://chatgpt.com/tasks/Automation_123456"
  });
  assert.equal(result.status, "BLOCKED_EVIDENCE");
  assert.equal(result.reason, "NOT_CODEX_CLOUD_RECEIPT");
});

test("reported and mock records retain their evidence classification", () => {
  assert.equal(assessCloudTaskProvenance({ evidenceClass: "reported" }).status, "REPORTED");
  assert.equal(assessCloudTaskProvenance({ evidenceClass: "mock" }).status, "MOCK_ONLY");
});

test("incomplete, credentialed or temporally invalid receipts fail closed", () => {
  for (const candidate of [
    { ...valid, taskId: "bad" },
    { ...valid, taskUrl: "https://user:secret@example.com/task" },
    { ...valid, taskUrl: `${valid.taskUrl}?token=private` },
    { ...valid, endedAt: "2026-11-19T11:59:59Z" },
    { ...valid, permissionsVerified: false },
    { ...valid, finalState: "running" }
  ]) assert.equal(assessCloudTaskProvenance(candidate).status, "BLOCKED_EVIDENCE");
});

test("complete receipt verifies task provenance but not PC-off status", () => {
  const result = assessCloudTaskProvenance(valid);
  assert.equal(result.status, "LIVE_VERIFIED");
  assert.equal(result.pcOffProof, "UNVERIFIED");
  assert.equal(result.dispatchOperations, 0);
});

test("PC-off proof is separate and must be independently verified", () => {
  assert.equal(assessCloudTaskProvenance({ ...valid, pcOffProof: "owner_reported" }).pcOffProof, "UNVERIFIED");
  assert.equal(assessCloudTaskProvenance({ ...valid, pcOffProof: "independently_verified" }).pcOffProof, "LIVE_VERIFIED");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeProjectPath, prepareCloudBackupReview, requestCloudBackupReview
} from "./win-cloud-backup-review-worker.mjs";

const NOW = Date.parse("2026-11-08T09:00:00Z");
const utc = t => new Date(t).toISOString();
function fixture() {
  return {
    handoff: {
      task: {
        id: "win-123", repository: "Amir-dev-stack/win-worker-engine",
        approved: true, productionWriteAllowed: false, paidSpendAllowed: false,
        scope: "draft_only", allowedPaths: ["scripts/task.mjs"]
      },
      primary: {
        workerId: "codex", leaseId: "lease-1", status: "failed",
        lastHeartbeatAt: utc(NOW - 3600000),
        leaseExpiresAt: utc(NOW - 60000)
      },
      backup: {
        kind: "cloud-independent-reviewer", workerId: "cloud-backup-1",
        ready: true, isolatedWorkspace: true, permissions: "read_only",
        capability: "review_and_propose"
      },
      approval: {
        taskId: "win-123", backupWorkerId: "cloud-backup-1", primaryLeaseId: "lease-1",
        authorized: true, expiresAt: utc(NOW + 600000)
      }
    },
    assignment: { type: "code_review", taskId: "win-123", paidSpendAllowed: false },
    files: [{ path: "scripts/task.mjs", content: "export const x=1;" }]
  };
}
test("prepares only approved cloud-scoped files as untrusted context", () => {
  const x = prepareCloudBackupReview(fixture(), NOW);
  assert.equal(x.status, "prepared");
  assert.equal(x.writeOperations, 0);
  assert.equal(JSON.parse(x.prompt).files[0].path, "scripts/task.mjs");
  assert.match(x.prompt, /UNTRUSTED DATA/);
});
test("never infers cloud backup from local worker readiness", () => {
  const x = fixture();
  x.handoff.backup.kind = "local-opencode-ollama";
  x.handoff.backup.pcOnline = true;
  assert.equal(prepareCloudBackupReview(x, NOW).status, "hold");
});
test("no takeover while Codex primary lease active", () => {
  const x = fixture();
  x.handoff.primary.leaseExpiresAt = utc(NOW + 60000);
  assert.match(prepareCloudBackupReview(x, NOW).reason, /primary_lease_active/);
});
test("rejects unapproved paths and sensitive names", () => {
  for (const name of [".env", "secret/.env.x", "scripts/../.env", "C:/Users/secret",
    "scripts\\task.mjs", "node_modules/test.mjs", "scripts//file.mjs"]) {
    assert.equal(isSafeProjectPath(name), false, name);
  }
  const x = fixture();
  x.files[0].path = ".env";
  assert.equal(prepareCloudBackupReview(x, NOW).reason, "unapproved_or_unsafe_file");
});
test("rejects new file outside the approved set", () => {
  const x = fixture();
  x.files[0].path = "scripts/other.mjs";
  assert.equal(prepareCloudBackupReview(x, NOW).status, "hold");
});
test("no model invocation without a configured zero-cost read-only adapter", async () => {
  const p = prepareCloudBackupReview(fixture(), NOW);
  let called = 0;
  const response = await requestCloudBackupReview(p, {
    providerCostUsd: 0.01, executionMode: "cloud_read_only", toolsEnabled: false,
    generate: async () => { called++; return "Not allowed"; }
  });
  assert.equal(response.status, "hold");
  assert.equal(called, 0);
});
test("compatible free adapter returns only an unverified review proposal", async () => {
  const p = prepareCloudBackupReview(fixture(), NOW);
  const r = await requestCloudBackupReview(p, {
    providerCostUsd: 0, executionMode: "cloud_read_only", toolsEnabled: false,
    generate: async ({ taskId }) => "Review proposal for " + taskId
  });
  assert.equal(r.status, "proposal_only");
  assert.equal(r.verified, false);
  assert.equal(r.writeOperations, 0);
  assert.equal(r.requiresIndependentReview, true);
});
test("adapter failures and oversized results fail closed", async () => {
  const p = prepareCloudBackupReview(fixture(), NOW);
  const adapter = {
    providerCostUsd: 0, executionMode: "cloud_read_only", toolsEnabled: false,
    generate: async () => { throw new Error("do not expose secrets"); }
  };
  assert.equal((await requestCloudBackupReview(p, adapter)).reason, "provider_failed");
  adapter.generate = async () => "x".repeat(30000);
  assert.equal((await requestCloudBackupReview(p, adapter)).reason, "invalid_provider_response");
});
test("malformed, huge and unapproved tasks fail closed", () => {
  const x = fixture();
  x.files[0].content = "x".repeat(100000);
  assert.equal(prepareCloudBackupReview(x, NOW).status, "hold");
  x.files[0].content = "clean";
  x.assignment.paidSpendAllowed = true;
  assert.equal(prepareCloudBackupReview(x, NOW).status, "hold");
});

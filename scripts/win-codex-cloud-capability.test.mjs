import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCodexCloudCapability,
  decideCodexCloudContinuation
} from "./win-codex-cloud-capability.mjs";

function observation() {
  return {
    cli: {
      version: "codex-cli 0.167.0-alpha.4",
      cloudExecAdvertised: true,
      cloudStatusAdvertised: true
    },
    access: {
      loginReported: true,
      providerReachable: true,
      taskListReadable: true,
      environmentIdVerified: true,
      quotaVerifiedAvailable: true,
      modelVerifiedAvailable: true,
      timeBudgetVerified: true,
      taskReceiptContractVerified: true
    },
    schedule: { hourlyChatgptAutomationVerified: true }
  };
}

function continuation() {
  return {
    capabilityStatus: "LIVE_LAUNCH_READY",
    current: { taskId: "issue-81-current", status: "completed" },
    next: { taskId: "issue-81-next", status: "queued" },
    lease: { state: "free" },
    controls: {
      approved: true,
      freeOnly: true,
      quota: "verified_available",
      timeBudgetMs: 10 * 60 * 1000,
      model: "verified_available"
    },
    dispatch: {
      idempotencyKey: "issue-81-next-attempt-1",
      alreadyDispatched: false,
      activeIdempotencyKey: null
    }
  };
}

test("installed cloud commands do not become launch-ready without live access evidence", () => {
  const value = observation();
  value.access.providerReachable = false;
  value.access.taskListReadable = false;
  value.access.environmentIdVerified = false;
  value.access.quotaVerifiedAvailable = false;
  value.access.modelVerifiedAvailable = false;
  value.access.taskReceiptContractVerified = false;
  const result = assessCodexCloudCapability(value);
  assert.equal(result.status, "SUPPORTED_INTERFACE_BLOCKED_ACCESS");
  assert.equal(result.launchOperations, 0);
  assert.equal(result.matrix.find(item => item.capability === "managed_schedule").detail.includes("not a Codex Cloud task receipt"), true);
});

test("missing cloud submit or status support is a platform blocker", () => {
  const value = observation();
  value.cli.cloudExecAdvertised = false;
  assert.equal(assessCodexCloudCapability(value).status, "BLOCKED_PLATFORM");
});

test("all explicit access facts can make the interface ready without launching", () => {
  const result = assessCodexCloudCapability(observation());
  assert.equal(result.status, "LIVE_LAUNCH_READY");
  assert.equal(result.launchOperations, 0);
});

test("completed task proposes exactly one next dispatch checkpoint", () => {
  const result = decideCodexCloudContinuation(continuation());
  assert.equal(result.action, "propose_one_dispatch");
  assert.equal(result.maxDispatches, 1);
  assert.equal(result.dispatchOperations, 0);
});

test("platform refusal dead-letters instead of retrying", () => {
  const value = continuation();
  value.current.status = "platform_refused";
  assert.deepEqual(decideCodexCloudContinuation(value).action, "dead_letter");
});

test("unknown or exhausted quota and insufficient time budget wait without dispatch", () => {
  for (const quota of ["unknown", "exhausted"]) {
    const value = continuation();
    value.controls.quota = quota;
    assert.equal(decideCodexCloudContinuation(value).reason, "QUOTA_NOT_VERIFIED_AVAILABLE");
  }
  const short = continuation();
  short.controls.timeBudgetMs = 60_000;
  assert.equal(decideCodexCloudContinuation(short).reason, "TIME_BUDGET_INSUFFICIENT");
});

test("duplicate dispatch is blocked by stable idempotency state", () => {
  const value = continuation();
  value.dispatch.activeIdempotencyKey = value.dispatch.idempotencyKey;
  assert.equal(decideCodexCloudContinuation(value).reason, "DUPLICATE_DISPATCH_BLOCKED");
});

test("lease crash requires reconciliation before another worker starts", () => {
  const value = continuation();
  value.lease.state = "crash_unknown";
  assert.equal(decideCodexCloudContinuation(value).action, "reconcile_lease");
});

test("unavailable or unknown model holds without fallback", () => {
  for (const model of ["unavailable", "unknown"]) {
    const value = continuation();
    value.controls.model = model;
    assert.equal(decideCodexCloudContinuation(value).reason, "MODEL_NOT_VERIFIED_AVAILABLE");
  }
});

test("interrupted or outcome-unknown task checkpoints and never chains", () => {
  for (const status of ["interrupted", "unknown"]) {
    const value = continuation();
    value.current.status = status;
    const result = decideCodexCloudContinuation(value);
    assert.equal(result.action, "checkpoint_and_hold");
    assert.equal(result.dispatchOperations, 0);
  }
});

test("supported interface with blocked access cannot dispatch", () => {
  const value = continuation();
  value.capabilityStatus = "SUPPORTED_INTERFACE_BLOCKED_ACCESS";
  assert.equal(decideCodexCloudContinuation(value).reason, "CLOUD_ACCESS_NOT_VERIFIED");
});

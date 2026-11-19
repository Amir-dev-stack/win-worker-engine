import test from "node:test";
import assert from "node:assert/strict";
import {
  planContinuousLearningTick, CONTINUOUS_LEARNING_JOB_DEFINITIONS
} from "./win-continuous-learning-supervisor.mjs";

const now = Date.parse("2026-11-08T18:00:00.000Z");
function sample() {
  return {
    enabled: true, ownerApproved: true, allowPaidCalls: false,
    allowProductionWrites: false, authenticatedSupervisor: true,
    leaseBackendReady: true, memoryBackendReady: true,
    freeQuotaVerified: true, atomicLeaseGuaranteed: true,
    backupCheckpointReady: true,
    state: Object.fromEntries(CONTINUOUS_LEARNING_JOB_DEFINITIONS.map(x =>
      [x.id, { lastCompletedAt: "2026-11-08T15:00:00.000Z", leaseExpiresAt: null, attempts: 0 }]))
  };
}
test("never runs automatically: only returns bounded proposed jobs", () => {
  const result = planContinuousLearningTick(sample(), now);
  assert.equal(result.status, "plan_only");
  assert.equal(result.jobs.length, 5);
  assert.equal(result.paidCalls, false);
  assert.equal(result.productionWrites, false);
  assert.ok(result.jobs.every(x => x.requiresAtomicLease && !x.autoPromoteModel &&
    !x.paidCallsAllowed && !x.productionWriteAllowed));
});
test("defaults fail closed even when all work is overdue", () => {
  const s = sample(); s.ownerApproved = false;
  assert.equal(planContinuousLearningTick(s, now).reason, "explicit_safe_activation_required");
});
test("fails closed when durable storage, quota or trusted identity is not verified", () => {
  for (const key of ["leaseBackendReady", "memoryBackendReady", "freeQuotaVerified",
    "authenticatedSupervisor", "atomicLeaseGuaranteed", "backupCheckpointReady"]) {
    const s = sample(); s[key] = false;
    assert.equal(planContinuousLearningTick(s, now).reason, "trusted_cloud_prerequisites_missing", key);
  }
});
test("unexpired leases are never selected, even when stale", () => {
  const s = sample();
  s.state["odds-ingestion"].leaseExpiresAt = "2026-11-08T18:10:00.000Z";
  const x = planContinuousLearningTick(s, now);
  assert.ok(!x.jobs.some(j => j.id === "odds-ingestion"));
});
test("not-yet-due and retry exhausted jobs are skipped", () => {
  const s = sample();
  s.state["odds-ingestion"].lastCompletedAt = "2026-11-08T17:59:00.000Z";
  s.state["results-reconciliation"].attempts = 3;
  const x = planContinuousLearningTick(s, now);
  assert.ok(!x.jobs.some(j => j.id === "odds-ingestion"));
  assert.ok(!x.jobs.some(j => j.id === "results-reconciliation"));
});
test("invalid timestamps and missing checkpoint state stop entire tick", () => {
  const s = sample();
  s.state["odds-ingestion"].lastCompletedAt = "yesterday";
  assert.equal(planContinuousLearningTick(s, now).reason, "invalid_job_checkpoint");
  delete s.state["odds-ingestion"];
  assert.equal(planContinuousLearningTick(s, now).reason, "missing_or_invalid_job_checkpoint");
});
test("future timestamps cannot fast-forward execution", () => {
  const s = sample();
  s.state["odds-ingestion"].lastCompletedAt = "2026-11-09T18:00:00.000Z";
  assert.equal(planContinuousLearningTick(s, now).reason, "checkpoint_in_future");
});
test("the agent never silently turns on spending or production writes", () => {
  for (const flag of ["allowPaidCalls", "allowProductionWrites"]) {
    const s = sample(); s[flag] = true;
    assert.equal(planContinuousLearningTick(s, now).reason, "explicit_safe_activation_required");
  }
});
test("new jobs require explicit durable checkpoint placeholders", () => {
  const s = sample();
  s.state["odds-ingestion"] = {lastCompletedAt:null,leaseExpiresAt:null,attempts:0};
  assert.ok(planContinuousLearningTick(s, now).jobs.some(j => j.id === "odds-ingestion"));
});

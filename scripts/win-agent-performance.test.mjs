import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryPerformanceStore, createPerformanceLedger } from "./win-agent-performance.mjs";

const outcome = (status, overrides = {}) => ({
  agentId: "agent-a", model: "gpt-6.2-sol", status,
  durationMs: 100, resourceUnits: 2, reviewRejected: 0, ...overrides
});

test("records bounded sanitized outcomes and computes metrics", async () => {
  const ledger = createPerformanceLedger({ store: createMemoryPerformanceStore(), windowSize: 3 });
  await ledger.record(outcome("success"));
  await ledger.record(outcome("success", { recovered: true }));
  await ledger.record(outcome("failure", { durationMs: 500, resourceUnits: 5, reviewRejected: 1 }));
  await ledger.record(outcome("blocked"));
  const metrics = await ledger.metrics("agent-a");
  assert.equal(metrics.sampleSize, 3);
  assert.equal(metrics.successRate, 1 / 3);
  assert.equal(metrics.recoveryRate, 1 / 3);
  assert.equal(metrics.reviewRejectionRate, 1 / 3);
});

test("creates one bounded corrective assignment after measured deterioration", async () => {
  const ledger = createPerformanceLedger({ store: createMemoryPerformanceStore() });
  const baseline = { sampleSize: 5, successRate: 1, reviewRejectionRate: 0, meanDurationMs: 100, meanResourceUnits: 2 };
  for (let i = 0; i < 3; i++) await ledger.record(outcome("failure", { durationMs: 250, resourceUnits: 5, reviewRejected: 1 }));
  const correction = await ledger.correctiveAssignment("agent-a", baseline);
  assert.equal(correction.type, "performance_correction");
  assert.equal(correction.boundedAttempts, 1);
  assert.ok(correction.reasons.includes("SUCCESS_RATE_DROP"));
});

test("does not claim learning improvement from insufficient evidence", async () => {
  const ledger = createPerformanceLedger({ store: createMemoryPerformanceStore() });
  await ledger.record(outcome("success"));
  const result = await ledger.detectDeterioration("agent-a", { sampleSize: 5, successRate: 0 });
  assert.equal(result.deteriorating, false);
  assert.equal(result.reason, "INSUFFICIENT_EVIDENCE");
});

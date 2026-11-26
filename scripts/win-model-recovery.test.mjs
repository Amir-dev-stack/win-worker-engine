import test from "node:test";
import assert from "node:assert/strict";
import { classifyModelFailure, createMemoryRecoveryStore, createRecoveryController } from "./win-model-recovery.mjs";

const SHA = "a".repeat(40);
const base = { taskId: "task-1", checkpointSha: SHA, operationId: "op-1", sequence: 3 };

test("classifies usage limits separately from auth, network and outage failures", () => {
  assert.equal(classifyModelFailure({ code: "RATE_LIMIT" }), "usage_limit");
  assert.equal(classifyModelFailure({ status: 401 }), "authentication");
  assert.equal(classifyModelFailure({ code: "TIMEOUT" }), "network");
  assert.equal(classifyModelFailure({ status: 503 }), "service_outage");
  assert.equal(classifyModelFailure({ code: "BAD_REQUEST" }), "unknown");
});

test("preserves checkpoint, waits for reset, and resumes idempotently", async () => {
  let clock = new Date("2026-11-26T12:00:00Z");
  const controller = createRecoveryController({ store: createMemoryRecoveryStore(), now: () => clock });
  await controller.start(base);
  await controller.markRunning("task-1");
  const waiting = await controller.recordFailure("task-1", { code: "QUOTA_EXHAUSTED" }, "2026-11-26T12:30:00Z");
  assert.equal(waiting.state, "waiting_limit");
  assert.equal((await controller.get("task-1")).checkpointSha, SHA);
  assert.equal((await controller.refresh("task-1")).state, "waiting_limit");
  clock = new Date("2026-11-26T12:30:01Z");
  assert.equal((await controller.refresh("task-1")).state, "resumable");
  await assert.rejects(controller.resume("task-1", "wrong-op"), /RECOVERY_OPERATION_CONFLICT/);
  assert.equal((await controller.resumeAfterReset("task-1", "op-1")).state, "running");
  assert.equal((await controller.complete("task-1")).state, "completed");
});

test("does not convert authentication or network errors into automatic retries", async () => {
  const controller = createRecoveryController({ store: createMemoryRecoveryStore() });
  await controller.start(base);
  await controller.markRunning("task-1");
  assert.deepEqual(await controller.recordFailure("task-1", { status: 401 }, "2026-11-26T13:00:00Z"), {
    state: "running", kind: "authentication", resumed: false
  });
  assert.equal((await controller.get("task-1")).state, "running");
});

test("rejects malformed and conflicting checkpoints", async () => {
  const controller = createRecoveryController({ store: createMemoryRecoveryStore() });
  await assert.rejects(controller.start({ ...base, checkpointSha: "bad" }), /INVALID_CHECKPOINT_SHA/);
  await controller.start(base);
  await assert.rejects(controller.start({ ...base, operationId: "other-op" }), /RECOVERY_OPERATION_CONFLICT/);
});

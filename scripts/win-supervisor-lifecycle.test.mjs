import test from "node:test";
import assert from "node:assert/strict";
import { createSupervisorLifecycle } from "./win-supervisor-lifecycle.mjs";

function components(overrides = {}) {
  const events = [];
  return {
    events,
    queue: { async claim() { return { fence: 1 }; } },
    model: { async select() { return { model: "gpt-6.2-sol" }; } },
    checkpoints: { async save(taskId, value) { events.push(["checkpoint", taskId, value]); } },
    recovery: { async record(taskId, error) { events.push(["recovery", taskId, error.kind]); }, async resumeAfterReset() { return { state: "running" }; } },
    backup: { async claim(taskId, backupId, reason) { events.push(["backup", taskId, backupId, reason]); return { state: "backup_working" }; } },
    handover: { async emit(value) { events.push(["handover", value]); } },
    performance: { async record(value) { events.push(["performance", value]); } },
    ...overrides
  };
}

test("completes a task through claim, model, checkpoint, handover and performance", async () => {
  const c = components();
  const lifecycle = createSupervisorLifecycle(c);
  const result = await lifecycle.run({ taskId: "task-1", worker: async () => ({ sha: "a" }) });
  assert.equal(result.state, "completed");
  assert.equal(c.events.filter(event => event[0] === "checkpoint").length, 2);
  assert.equal(c.events.filter(event => event[0] === "handover").length, 1);
});

test("preserves a checkpoint and waits after a usage-limit failure", async () => {
  const c = components();
  const lifecycle = createSupervisorLifecycle(c);
  const result = await lifecycle.run({ taskId: "task-2", worker: async () => { throw { kind: "usage_limit" }; } });
  assert.deepEqual(result, { state: "waiting_limit", reason: "USAGE_LIMIT" });
  assert.ok(c.events.some(event => event[0] === "checkpoint" && event[2].phase === "waiting_limit"));
});

test("routes network, database and worker crashes to bounded recovery without replay", async () => {
  for (const kind of ["network", "database", "crash"]) {
    const c = components();
    const lifecycle = createSupervisorLifecycle(c);
    const result = await lifecycle.run({ taskId: `task-${kind}`, worker: async () => { throw { kind }; } });
    assert.deepEqual(result, { state: "recovery_required", reason: kind });
    assert.equal(c.events.filter(event => event[0] === "performance").length, 0);
  }
});

test("supports reset-gated resume and explicit backup takeover handoff", async () => {
  const c = components();
  const lifecycle = createSupervisorLifecycle(c);
  assert.equal((await lifecycle.resume({ taskId: "task-4", operationId: "op-4", worker: async () => "ok" })).state, "completed");
  assert.deepEqual(await lifecycle.takeover({ taskId: "task-4", reason: "lease_expired", backupId: "backup-1" }), { state: "backup_working" });
});

test("does not continue when the queue denies the claim", async () => {
  const c = components({ queue: { async claim() { return null; } } });
  const lifecycle = createSupervisorLifecycle(c);
  assert.deepEqual(await lifecycle.run({ taskId: "task-5", worker: async () => assert.fail("worker must not run") }), { state: "idle", reason: "LEASE_NOT_ACQUIRED" });
});

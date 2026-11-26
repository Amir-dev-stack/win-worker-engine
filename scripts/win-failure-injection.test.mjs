import test from "node:test";
import assert from "node:assert/strict";
import { createSupervisorLifecycle } from "./win-supervisor-lifecycle.mjs";
import { createPersistentScheduler, createMemorySchedulerStateStore } from "./win-persistent-scheduler.mjs";

function harness({ claim = async () => ({ fence: 1 }), select = async () => ({ model: "gpt-6.2-sol" }), reset = async () => ({ state: "running" }) } = {}) {
  const events = [];
  return {
    events,
    queue: { claim },
    model: { select },
    checkpoints: { async save(taskId, value) { events.push(["checkpoint", taskId, value]); } },
    recovery: { async record(taskId, error) { events.push(["recovery", taskId, error.kind]); }, resumeAfterReset: reset },
    backup: { async claim(taskId, backupId, reason) { events.push(["backup", taskId, backupId, reason]); return { state: "backup_working" }; } },
    handover: { async emit(value) { events.push(["handover", value]); } },
    performance: { async record(value) { events.push(["performance", value]); } }
  };
}

test("failure matrix preserves checkpoints and routes recoverable failures", async () => {
  for (const kind of ["network", "database", "crash", "interrupted_implementation"]) {
    const h = harness();
    const lifecycle = createSupervisorLifecycle(h);
    const result = await lifecycle.run({ taskId: `failure-${kind}`, worker: async () => { throw { kind }; } });
    assert.equal(result.state, "recovery_required");
    assert.ok(h.events.some(event => event[0] === "checkpoint" && event[2].phase === "recovery_required"));
  }
  const limited = harness();
  const lifecycle = createSupervisorLifecycle(limited);
  assert.deepEqual(await lifecycle.run({ taskId: "failure-limit", worker: async () => { throw { kind: "usage_limit" }; } }), { state: "waiting_limit", reason: "USAGE_LIMIT" });
  assert.ok(limited.events.some(event => event[0] === "checkpoint" && event[2].phase === "waiting_limit"));
});

test("reset gating, expired lease takeover and backup failure remain explicit", async () => {
  const h = harness({ reset: async () => ({ state: "blocked", reason: "RESET_NOT_VERIFIED" }) });
  const lifecycle = createSupervisorLifecycle(h);
  assert.deepEqual(await lifecycle.resume({ taskId: "expired-lease", operationId: "op-1", worker: async () => "must-not-run" }), { state: "blocked", reason: "RESET_NOT_VERIFIED" });
  assert.deepEqual(await lifecycle.takeover({ taskId: "expired-lease", reason: "lease_expired", backupId: "backup-1" }), { state: "backup_working" });
  const failedBackup = harness();
  failedBackup.backup.claim = async () => { throw { kind: "backup_unavailable" }; };
  await assert.rejects(() => createSupervisorLifecycle(failedBackup).takeover({ taskId: "task-2", reason: "primary_crash", backupId: "backup-2" }), error => error?.kind === "backup_unavailable");
});

test("concurrent claims permit one owner and duplicate handover is not replayed", async () => {
  let claimed = false;
  const h = harness({ claim: async () => { if (claimed) return null; claimed = true; return { fence: 7 }; } });
  const lifecycle = createSupervisorLifecycle(h);
  const worker = async () => ({ sha: "result-1" });
  const results = await Promise.all([lifecycle.run({ taskId: "concurrent", worker }), lifecycle.run({ taskId: "concurrent", worker })]);
  assert.equal(results.filter(result => result.state === "completed").length, 1);
  assert.equal(results.filter(result => result.state === "idle").length, 1);
  assert.equal(h.events.filter(event => event[0] === "handover").length, 1);
});

test("scheduler survives interruption with a durable checkpoint and bounded replay", async () => {
  const store = createMemorySchedulerStateStore();
  let calls = 0;
  const scheduler = createPersistentScheduler({
    queue: { async nextEligible() { return calls++ < 2 ? { taskId: `task-${calls}` } : null; } },
    lifecycle: { async run() { if (calls === 1) throw Error("interrupted"); return { state: "completed" }; } },
    stateStore: store,
    maxIterations: 2
  });
  await assert.rejects(() => scheduler.runUntilBlocked(), /interrupted/);
  const checkpoint = await scheduler.checkpoint();
  assert.equal(checkpoint.state, "running");
  const resumed = await scheduler.runUntilBlocked();
  assert.equal(resumed.state, "idle");
});

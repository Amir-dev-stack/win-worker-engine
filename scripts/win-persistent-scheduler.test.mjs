import test from "node:test";
import assert from "node:assert/strict";
import { createMemorySchedulerStateStore, createPersistentScheduler } from "./win-persistent-scheduler.mjs";

test("selects eligible tasks, persists completion and resumes after interruption", async () => {
  const tasks = [{ taskId: "task-a", ownerId: "worker-a" }, { taskId: "task-b", ownerId: "worker-a" }];
  const queue = { async nextEligible(done, blocked) { return tasks.find(task => !done.includes(task.taskId) && !blocked.includes(task.taskId)) || null; } };
  let calls = 0;
  const lifecycle = { async run() { calls += 1; return { state: "completed" }; } };
  const scheduler = createPersistentScheduler({ queue, lifecycle, stateStore: createMemorySchedulerStateStore(), maxIterations: 3 });
  const first = await scheduler.runUntilBlocked();
  assert.equal(first.state, "idle"); assert.deepEqual(first.completed, ["task-a", "task-b"]);
  const second = await scheduler.runUntilBlocked(); assert.equal(second.state, "idle"); assert.equal(calls, 2);
});

test("does not replay a blocked task and survives a later invocation", async () => {
  const queue = { async nextEligible(done, blocked) { return done.includes("task-a") || blocked.includes("task-a") ? null : { taskId: "task-a" }; } };
  let calls = 0; const lifecycle = { async run() { calls += 1; return { state: "waiting_limit", reason: "USAGE_LIMIT" }; } };
  const scheduler = createPersistentScheduler({ queue, lifecycle, stateStore: createMemorySchedulerStateStore(), maxIterations: 4 });
  const first = await scheduler.runUntilBlocked(); assert.equal(first.state, "blocked"); assert.deepEqual(first.blocked, ["task-a"]);
  const second = await scheduler.runUntilBlocked(); assert.equal(second.state, "idle"); assert.equal(calls, 1);
});

test("pauses at an iteration bound and supports explicit stop recovery", async () => {
  const queue = { async nextEligible(done) { return { taskId: `task-${done.length}` }; } };
  const lifecycle = { async run() { return { state: "completed" }; } };
  const scheduler = createPersistentScheduler({ queue, lifecycle, stateStore: createMemorySchedulerStateStore(), maxIterations: 2 });
  assert.equal((await scheduler.runUntilBlocked()).state, "paused"); await scheduler.stop("TEST_STOP");
  assert.deepEqual(await scheduler.runUntilBlocked(), { state: "stopped", reason: "CHECKPOINT_STOPPED" });
});

test("rejects malformed queue output without running a worker", async () => {
  const queue = { async nextEligible() { return { taskId: "bad task" }; } };
  const lifecycle = { async run() { assert.fail("worker must not run"); } };
  const scheduler = createPersistentScheduler({ queue, lifecycle, stateStore: createMemorySchedulerStateStore() });
  assert.equal((await scheduler.runUntilBlocked()).reason, "INVALID_OR_DUPLICATE_TASK");
});

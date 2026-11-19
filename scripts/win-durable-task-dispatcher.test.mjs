import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DurableTaskDispatcher } from "./win-durable-task-dispatcher.mjs";

function fixture(t, launcher) {
  const dir = mkdtempSync(join(tmpdir(), "win-dispatcher-")); t.after(() => rmSync(dir, { recursive: true }));
  return new DurableTaskDispatcher(join(dir, "state.json"), { clock: () => 1000, launcher });
}
const controls = { approved: true, quotaVerified: true, freeOnly: true };

test("idempotent enqueue survives restart", t => {
  const d = fixture(t); const first = d.enqueue({ idempotencyKey: "issue-81-b2", assignment: "issue-81-b2" });
  const second = d.enqueue({ idempotencyKey: "issue-81-b2", assignment: "issue-81-b2" });
  assert.equal(first.taskId, second.taskId); assert.equal(d.snapshot().tasks.length, 1);
});
test("policy gates and absent interface perform zero dispatches", async t => {
  const d = fixture(t); d.enqueue({ idempotencyKey: "issue-81-b2", assignment: "issue-81-b2" });
  assert.equal((await d.dispatchNext({})).dispatchOperations, 0);
  assert.equal((await d.dispatchNext(controls)).status, "BLOCKED_INTERFACE");
  assert.equal(d.snapshot().tasks[0].attempts, 0);
});
test("mock or unverified launch interfaces are rejected before invocation", async t => {
  let calls = 0; const d = fixture(t, { verifiedInterface: true, transport: "mock", launch: async () => { calls++; } });
  d.enqueue({ idempotencyKey: "issue-81-b2", assignment: "issue-81-b2" });
  assert.equal((await d.dispatchNext(controls)).status, "BLOCKED_INTERFACE"); assert.equal(calls, 0);
});
test("missing live receipt retries then dead-letters with redacted trace", async t => {
  const d = fixture(t, { verifiedInterface: true, transport: "live", launch: async () => undefined });
  d.enqueue({ idempotencyKey: "issue-81-b2", assignment: "issue-81-b2", maxAttempts: 2 });
  assert.equal((await d.dispatchNext(controls)).status, "queued");
  assert.equal((await d.dispatchNext(controls)).status, "dead_letter");
  assert.deepEqual(d.snapshot().trace.map(event => event.code), ["ENQUEUED", "RETRY_NO_RECEIPT", "DEAD_LETTER"]);
});
test("overlapping writer lock fails closed", t => {
  const dir = mkdtempSync(join(tmpdir(), "win-dispatcher-lock-")); t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, "state.json"); const d = new DurableTaskDispatcher(file);
  mkdirSync(`${file}.lock`);
  assert.throws(() => d.enqueue({ idempotencyKey: "issue-81-b3", assignment: "issue-81-b3" }), /EEXIST|file already exists/u);
});

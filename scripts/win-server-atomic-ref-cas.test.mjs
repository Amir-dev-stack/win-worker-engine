import assert from "node:assert/strict";
import test from "node:test";
import { createAtomicRefServer, GITHUB_REF_WRITER_ENABLED } from "./win-server-atomic-ref-cas.mjs";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const lease = { owner: "worker-a", fence: 7, expiresAt: 2_000, revoked: false };
const request = { operationId: "op-1", expectedHead: A, nextHead: B, owner: "worker-a", fence: 7 };
const server = overrides => createAtomicRefServer({ head: A, lease: { ...lease, ...overrides }, now: () => 1_000 });

test("future GitHub writer remains compile-time disabled", () => assert.equal(GITHUB_REF_WRITER_ENABLED, false));

test("two writers racing the same old head produce exactly one commit", () => {
  const state = server();
  const first = state.transact(request);
  const second = state.transact({ ...request, operationId: "op-2", nextHead: C });
  assert.equal(first.status, "committed");
  assert.equal(second.reason, "OLD_HEAD_MISMATCH");
  assert.equal(state.snapshot().head, B);
});

test("stale fence and wrong owner are rejected inside the transaction", () => {
  assert.equal(server().transact({ ...request, fence: 6 }).reason, "STALE_FENCE_OR_OWNER");
  assert.equal(server().transact({ ...request, owner: "worker-b" }).reason, "STALE_FENCE_OR_OWNER");
});

test("expired and revoked leases cannot update the head", () => {
  assert.equal(server({ expiresAt: 1_000 }).transact(request).reason, "LEASE_EXPIRED");
  assert.equal(server({ revoked: true }).transact(request).reason, "LEASE_REVOKED");
});

test("lease replacement immediately fences a previously authorized writer", () => {
  const state = server();
  state.replaceLease({ ...lease, owner: "worker-b", fence: 8 });
  assert.equal(state.transact(request).reason, "STALE_FENCE_OR_OWNER");
  assert.equal(state.snapshot().head, A);
});

test("crash before commit leaves the old head and can be safely retried", () => {
  const state = server();
  assert.throws(() => state.transact(request, "crash_before_commit"), /SIMULATED_CRASH/);
  assert.equal(state.snapshot().head, A);
  assert.equal(state.transact(request).reason, "ATOMIC_COMMIT");
});

test("lost acknowledgement returns the stored receipt without blind replay", () => {
  const state = server();
  assert.throws(() => state.transact(request, "lost_ack_after_commit"), /SIMULATED_LOST_ACK/);
  assert.equal(state.snapshot().head, B);
  const retry = state.transact(request);
  assert.equal(retry.reason, "IDEMPOTENT_RECEIPT");
  assert.equal(retry.writeOperations, 1);
});

test("operation reuse with changed intent is quarantined", () => {
  const state = server();
  state.transact(request);
  const result = state.transact({ ...request, nextHead: C });
  assert.equal(result.reason, "QUARANTINED_OPERATION_CONFLICT");
  assert.equal(result.quarantined, true);
  assert.equal(state.snapshot().head, B);
  assert.deepEqual(state.quarantine(), [{ operationId: "op-1", reason: "OPERATION_ID_CONFLICT" }]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryEffectReceiptStore,
  createNoopEffectSink,
  createReceiptBackedEffectBoundary
} from "./win-receipt-effect-boundary.mjs";

const base = { operationId: "operation-1", taskId: "task-1", ownerId: "worker-a", payload: { result: "result-1" } };

test("receipt-backed boundary applies a duplicate operation only once", async () => {
  const sink = createNoopEffectSink();
  const boundary = createReceiptBackedEffectBoundary({
    receiptStore: createMemoryEffectReceiptStore(), effectSink: sink
  });
  const first = await boundary.execute({ ...base, fence: 1 });
  const retry = await boundary.execute({ ...base, fence: 1 });
  assert.equal(first.status, "applied");
  assert.equal(retry.status, "already_applied");
  assert.equal(sink.effects.size, 1);
  assert.deepEqual(sink.attempts, ["operation-1"]);
});

test("operation IDs cannot be rebound to another task, payload or applied owner", async () => {
  const boundary = createReceiptBackedEffectBoundary({
    receiptStore: createMemoryEffectReceiptStore(), effectSink: createNoopEffectSink()
  });
  await boundary.execute({ ...base, fence: 1 });
  await assert.rejects(boundary.execute({ ...base, taskId: "task-2", fence: 2 }), /EFFECT_OPERATION_BINDING_MISMATCH/);
  await assert.rejects(boundary.execute({ ...base, payload: { result: "different" }, fence: 2 }), /EFFECT_OPERATION_BINDING_MISMATCH/);
  await assert.rejects(boundary.execute({ ...base, ownerId: "worker-b", fence: 2 }), /EFFECT_OPERATION_BINDING_MISMATCH/);
});

test("worker crash after effect and stale fence cannot duplicate the logical effect", async () => {
  const store = createMemoryEffectReceiptStore();
  const sink = createNoopEffectSink();
  let crash = true;
  const boundary = createReceiptBackedEffectBoundary({
    receiptStore: store,
    effectSink: sink,
    afterEffect: async () => { if (crash) { crash = false; throw Error("SIMULATED_WORKER_CRASH"); } }
  });
  await assert.rejects(boundary.execute({ ...base, fence: 1 }), /SIMULATED_WORKER_CRASH/);
  await assert.rejects(boundary.execute({ ...base, ownerId: "worker-stale", fence: 1 }), /STALE_EFFECT_FENCE/);
  const recovered = await boundary.execute({ ...base, ownerId: "worker-b", fence: 2 });
  assert.equal(recovered.status, "applied");
  assert.equal(sink.effects.size, 1);
  assert.deepEqual(sink.attempts, ["operation-1", "operation-1"]);
  assert.equal((await store.read("operation-1")).status, "applied");
});

test("malformed attempts fail closed before invoking receipt or sink", async () => {
  const sink = createNoopEffectSink();
  const boundary = createReceiptBackedEffectBoundary({
    receiptStore: createMemoryEffectReceiptStore(), effectSink: sink
  });
  await assert.rejects(boundary.execute({ ...base, operationId: "bad id", fence: 1 }), /INVALID_EFFECT_ATTEMPT/);
  await assert.rejects(boundary.execute({ ...base, fence: 0 }), /INVALID_EFFECT_ATTEMPT/);
  assert.equal(sink.attempts.length, 0);
});

test("untrusted receipt output fails closed before invoking the sink", async () => {
  const sink = createNoopEffectSink();
  const boundary = createReceiptBackedEffectBoundary({
    receiptStore: {
      async begin() { return { status: "claimed", receipt: { operationId: "operation-1", taskId: "task-1", payloadHash: "bad", ownerId: "worker-a", fence: 1, status: "pending" } }; },
      async complete() { throw Error("UNEXPECTED_COMPLETE"); }
    },
    effectSink: sink
  });
  await assert.rejects(boundary.execute({ ...base, fence: 1 }), /INVALID_EFFECT_RECEIPT_RESULT/);
  assert.equal(sink.attempts.length, 0);
});

import { createHash } from "node:crypto";

const ID = /^[A-Za-z0-9._:-]{1,120}$/u;

function validId(value) { return typeof value === "string" && ID.test(value); }
function validFence(value) { return Number.isSafeInteger(value) && value >= 1; }
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw Error("INVALID_EFFECT_PAYLOAD");
}
function payloadHash(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function requireInput(input) {
  if (!input || typeof input !== "object" || !validId(input.operationId)
    || !validId(input.taskId) || !validId(input.ownerId) || !validFence(input.fence)) {
    throw Error("INVALID_EFFECT_ATTEMPT");
  }
  return payloadHash(input.payload);
}

function copyReceipt(receipt) {
  return receipt ? Object.freeze({ ...receipt }) : null;
}

/**
 * Disposable in-memory receipt store for draft-only tests.
 * A production adapter must make begin/complete conditional writes atomic.
 */
export function createMemoryEffectReceiptStore() {
  const receipts = new Map();
  return Object.freeze({
    async read(operationId) {
      if (!validId(operationId)) throw Error("INVALID_EFFECT_OPERATION");
      return copyReceipt(receipts.get(operationId));
    },
    async begin({ operationId, taskId, ownerId, fence, payload }) {
      const hash = requireInput({ operationId, taskId, ownerId, fence, payload });
      const current = receipts.get(operationId);
      if (!current) {
        const next = { operationId, taskId, ownerId, fence, payloadHash: hash, status: "pending" };
        receipts.set(operationId, next);
        return { status: "claimed", receipt: copyReceipt(next) };
      }
      if (current.taskId !== taskId || current.payloadHash !== hash
        || (current.status === "applied" && current.ownerId !== ownerId)) {
        return { status: "binding_mismatch", receipt: copyReceipt(current) };
      }
      if (current.status === "applied") return { status: "already_applied", receipt: copyReceipt(current) };
      if (fence <= current.fence) {
        return { status: "stale_fence", receipt: copyReceipt(current) };
      }
      const next = { ...current, taskId, ownerId, fence, status: "pending" };
      receipts.set(operationId, next);
      return { status: "claimed", receipt: copyReceipt(next) };
    },
    async complete({ operationId, ownerId, fence, result }) {
      if (!validId(operationId) || !validId(ownerId) || !validFence(fence)
        || typeof result !== "string" || result.length < 1 || result.length > 4096) {
        throw Error("INVALID_EFFECT_COMPLETION");
      }
      const current = receipts.get(operationId);
      if (!current || current.status !== "pending" || current.ownerId !== ownerId || current.fence !== fence) {
        throw Error("STALE_EFFECT_FENCE");
      }
      const next = { ...current, status: "applied", result };
      receipts.set(operationId, next);
      return copyReceipt(next);
    }
  });
}

/**
 * Injected, externally side-effect-free sink. It records one logical effect
 * per operation ID and returns the original result for idempotent replays.
 */
export function createNoopEffectSink() {
  const effects = new Map();
  const attempts = [];
  return Object.freeze({
    effects,
    attempts,
    async apply({ operationId, payload }) {
      if (!validId(operationId)) throw Error("INVALID_EFFECT_OPERATION");
      attempts.push(operationId);
      const existing = effects.get(operationId);
      if (existing) return existing;
      const result = typeof payload?.result === "string" && payload.result.length > 0
        ? payload.result : `noop:${operationId}`;
      effects.set(operationId, result);
      return result;
    }
  });
}

export function createReceiptBackedEffectBoundary({ receiptStore, effectSink, afterEffect = async () => {} } = {}) {
  if (!receiptStore || typeof receiptStore.begin !== "function" || typeof receiptStore.complete !== "function") {
    throw Error("EFFECT_RECEIPT_STORE_REQUIRED");
  }
  if (!effectSink || typeof effectSink.apply !== "function") throw Error("EFFECT_SINK_REQUIRED");
  if (typeof afterEffect !== "function") throw Error("EFFECT_HOOK_REQUIRED");
  return Object.freeze({
    async execute(input) {
      const hash = requireInput(input);
      const started = await receiptStore.begin(input);
      if (!started || !["already_applied", "claimed", "stale_fence", "binding_mismatch"].includes(started.status)
        || !started.receipt || started.receipt.operationId !== input.operationId
        || !validFence(started.receipt.fence)) throw Error("INVALID_EFFECT_RECEIPT_RESULT");
      if (started.status === "binding_mismatch") throw Error("EFFECT_OPERATION_BINDING_MISMATCH");
      if (started.receipt.taskId !== input.taskId || started.receipt.payloadHash !== hash
        || typeof started.receipt.payloadHash !== "string") throw Error("INVALID_EFFECT_RECEIPT_RESULT");
      if (started.status === "already_applied") {
        if (started.receipt.status !== "applied" || typeof started.receipt.result !== "string") throw Error("INVALID_EFFECT_RECEIPT_RESULT");
        return { status: "already_applied", result: started.receipt.result, receipt: started.receipt };
      }
      if (started?.status === "stale_fence") throw Error("STALE_EFFECT_FENCE");
      if (started.receipt.status !== "pending" || started.receipt.ownerId !== input.ownerId || started.receipt.fence !== input.fence) {
        throw Error("INVALID_EFFECT_RECEIPT_RESULT");
      }
      const result = await effectSink.apply({ operationId: input.operationId, taskId: input.taskId, payload: input.payload });
      if (typeof result !== "string" || result.length < 1 || result.length > 4096) throw Error("INVALID_EFFECT_RESULT");
      // A worker can terminate here. The idempotent sink makes the next fence safe to retry.
      await afterEffect({ ...input, result });
      const receipt = await receiptStore.complete({ operationId: input.operationId, ownerId: input.ownerId, fence: input.fence, result });
      if (!receipt || receipt.status !== "applied" || receipt.operationId !== input.operationId
        || receipt.taskId !== input.taskId || receipt.payloadHash !== hash || receipt.ownerId !== input.ownerId
        || receipt.fence !== input.fence || receipt.result !== result) throw Error("INVALID_EFFECT_RECEIPT_RESULT");
      return { status: "applied", result, receipt };
    }
  });
}

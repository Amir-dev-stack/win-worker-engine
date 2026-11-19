import assert from "node:assert/strict";
import test from "node:test";
import { createLeaseSupervisor } from "./win-supervisor-lease-coordinator.mjs";

const A = "a".repeat(40);
function leaseStore() {
  let owner = null, fence = 0, active = true;
  return {
    revoke() { active = false; }, takeover(actor) { owner = actor; fence++; active = true; },
    async claim(taskId, actor) {
      if (owner) return null; owner = actor; fence++;
      return { task_id: taskId, task_type: "draft_only_development", fence: String(fence), source_commit_sha: A };
    },
    async renew(_taskId, actor, suppliedFence) { return active && owner === actor && fence === suppliedFence ? { fence } : null; },
    async checkpoint(_taskId, actor, suppliedFence) { return active && owner === actor && fence === suppliedFence ? { fence, checkpoint_commit_sha: A } : null; },
    async complete(_taskId, actor, suppliedFence) { return active && owner === actor && fence === suppliedFence ? { fence, status: "completed" } : null; }
  };
}
function ledger({ loseAck = false } = {}) {
  const operations = new Set(); let effects = 0;
  return { get effects() { return effects; }, async apply({ operationId }) {
    if (operations.has(operationId)) return { status: "duplicate" };
    operations.add(operationId); effects++;
    if (loseAck) { loseAck = false; throw Error("lost ack"); }
    return { status: "applied" };
  } };
}
const input = actorId => ({ taskId: "task-1", actorId, ttlSeconds: 60, operationId: "operation-1", checkpointSha: A });

test("two workers contend and only the lease winner performs the side effect", async () => {
  const store = leaseStore(), effects = ledger();
  const [one, two] = await Promise.all([
    createLeaseSupervisor({ store, effects }).run(input("worker-a")),
    createLeaseSupervisor({ store, effects }).run(input("worker-b"))
  ]);
  assert.equal([one, two].filter(item => item.status === "completed").length, 1);
  assert.equal(effects.effects, 1);
});

test("heartbeat fence loss and cancellation suppress side effects", async () => {
  const effects = ledger(), cancelled = new AbortController(); cancelled.abort();
  const first = await createLeaseSupervisor({ store: leaseStore(), effects }).run({ ...input("worker-a"), signal: cancelled.signal });
  assert.equal(first.status, "cancelled"); assert.equal(effects.effects, 0);

  const store = leaseStore();
  const original = store.claim.bind(store);
  store.claim = async (...args) => { const claim = await original(...args); store.takeover("worker-b"); return claim; };
  const stale = await createLeaseSupervisor({ store, effects }).run(input("worker-a"));
  assert.equal(stale.reason, "LEASE_LOST_BEFORE_EFFECT"); assert.equal(effects.effects, 0);
});

test("lost acknowledgement is quarantined and reconciled without duplicate effect", async () => {
  const effects = ledger({ loseAck: true });
  const first = await createLeaseSupervisor({ store: leaseStore(), effects }).run(input("worker-a"));
  assert.equal(first.reason, "EFFECT_ACK_UNKNOWN_QUARANTINE_REQUIRED");
  assert.equal(effects.effects, 1);
  const second = await createLeaseSupervisor({ store: leaseStore(), effects }).run(input("worker-b"));
  assert.equal(second.reason, "IDEMPOTENT_RECONCILIATION");
  assert.equal(second.effectOperations, 0); assert.equal(effects.effects, 1);
});

test("revocation between claim and heartbeat prevents the effect", async () => {
  const store = leaseStore(), effects = ledger(), original = store.claim.bind(store);
  store.claim = async (...args) => { const claim = await original(...args); store.revoke(); return claim; };
  const result = await createLeaseSupervisor({ store, effects }).run(input("worker-a"));
  assert.equal(result.reason, "LEASE_LOST_BEFORE_EFFECT"); assert.equal(effects.effects, 0);
});

test("non-development task type and malformed inputs fail closed", async () => {
  const effects = ledger();
  const store = leaseStore(); store.claim = async () => ({ task_type: "read_only_review", fence: "1" });
  assert.equal((await createLeaseSupervisor({ store, effects }).run(input("worker-a"))).reason, "TASK_TYPE_NOT_AUTHORIZED");
  assert.equal((await createLeaseSupervisor({ store, effects }).run({})).reason, "INVALID_TASK");
  assert.equal(effects.effects, 0);
});

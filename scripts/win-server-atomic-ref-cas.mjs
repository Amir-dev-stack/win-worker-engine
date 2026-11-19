const SHA = /^[a-f0-9]{40}$/u;

export const GITHUB_REF_WRITER_ENABLED = false;

function closed(reason, extra = {}) {
  return Object.freeze({ status: "rejected", reason, writeOperations: 0, ...extra });
}

/**
 * Deterministic model of a server-owned atomic ref transaction. This is not a
 * GitHub adapter and exposes no network or ref-writing capability.
 */
export function createAtomicRefServer({ head, lease, now = () => Date.now() } = {}) {
  if (!SHA.test(head)) throw new Error("INVALID_INITIAL_HEAD");
  let currentHead = head;
  let currentLease = structuredClone(lease);
  const receipts = new Map();
  const quarantine = [];

  function snapshot() {
    return Object.freeze({ head: currentHead, lease: structuredClone(currentLease) });
  }

  return Object.freeze({
    snapshot,
    replaceLease(nextLease) { currentLease = structuredClone(nextLease); },
    quarantine: () => Object.freeze(structuredClone(quarantine)),
    transact(request, fault = "none") {
      if (GITHUB_REF_WRITER_ENABLED || !request || typeof request.operationId !== "string" ||
          !SHA.test(request.expectedHead) || !SHA.test(request.nextHead)) {
        return closed("INVALID_OR_ENABLED_WRITER_STATE");
      }

      const prior = receipts.get(request.operationId);
      if (prior) {
        const same = prior.expectedHead === request.expectedHead && prior.nextHead === request.nextHead &&
          prior.owner === request.owner && prior.fence === request.fence;
        if (same) return Object.freeze({ status: "committed", reason: "IDEMPOTENT_RECEIPT", ...prior.receipt });
        quarantine.push({ operationId: request.operationId, reason: "OPERATION_ID_CONFLICT" });
        return closed("QUARANTINED_OPERATION_CONFLICT", { quarantined: true });
      }

      // All checks and the head change occur inside this single server method.
      // No client-side read can substitute for these predicates.
      if (currentHead !== request.expectedHead) return closed("OLD_HEAD_MISMATCH");
      if (!currentLease || currentLease.owner !== request.owner || currentLease.fence !== request.fence) {
        return closed("STALE_FENCE_OR_OWNER");
      }
      if (currentLease.revoked === true) return closed("LEASE_REVOKED");
      if (!Number.isFinite(currentLease.expiresAt) || currentLease.expiresAt <= now()) {
        return closed("LEASE_EXPIRED");
      }
      if (fault === "crash_before_commit") throw Error("SIMULATED_CRASH_BEFORE_COMMIT");

      currentHead = request.nextHead;
      const receipt = Object.freeze({ operationId: request.operationId, head: currentHead, writeOperations: 1 });
      receipts.set(request.operationId, {
        expectedHead: request.expectedHead,
        nextHead: request.nextHead,
        owner: request.owner,
        fence: request.fence,
        receipt
      });
      if (fault === "lost_ack_after_commit") throw Error("SIMULATED_LOST_ACK_AFTER_COMMIT");
      return Object.freeze({ status: "committed", reason: "ATOMIC_COMMIT", ...receipt });
    }
  });
}

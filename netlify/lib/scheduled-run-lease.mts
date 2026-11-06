import { createHash, randomUUID } from "node:crypto";
import { getWithMetadata, putIfMatch, putIfNew } from "./store.mts";

const COLLECTION = "library/scheduled-run-leases";
const DEFAULT_LEASE_MS = 30 * 60 * 1000;
const MAX_CAS_ATTEMPTS = 3;

export type WinScheduledRunLease = {
  version: "win.scheduled-run-lease.v1";
  runId: string;
  leaseId: string | null;
  claimedAt: string;
  leaseExpiresAt: string;
  releasedAt?: string | null;
};

function keyFor(runId: string): string {
  return createHash("sha256").update(runId, "utf8").digest("hex");
}

/** Claims one scheduled learning run; expired leases are reclaimed with ETag CAS. */
export async function claimWinScheduledRunLease(
  runId: string,
  nowMs = Date.now(),
  leaseMs = DEFAULT_LEASE_MS
): Promise<{ claimed: true; leaseId: string } | { claimed: false; reason: "invalid_run_id" | "already_running" | "contention" }> {
  if (typeof runId !== "string" || !runId.trim() || runId.length > 180 ||
      !Number.isFinite(nowMs) || !Number.isFinite(leaseMs) || leaseMs < 1000 || leaseMs > 60 * 60 * 1000) {
    return { claimed: false, reason: "invalid_run_id" };
  }
  const id = keyFor(runId);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const current = await getWithMetadata<WinScheduledRunLease>(COLLECTION, id);
    const leaseId = randomUUID();
    const claimedAt = new Date(nowMs).toISOString();
    const leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();
    const next: WinScheduledRunLease = {
      version: "win.scheduled-run-lease.v1",
      runId,
      leaseId,
      claimedAt,
      leaseExpiresAt,
      releasedAt: null
    };
    if (!current) {
      const created = await putIfNew(COLLECTION, id, next);
      if (created?.modified) return { claimed: true, leaseId };
      continue;
    }
    const existing = current.value;
    if (!existing || existing.version !== "win.scheduled-run-lease.v1" || existing.runId !== runId) {
      return { claimed: false, reason: "contention" };
    }
    const expiry = Date.parse(existing.leaseExpiresAt || "");
    if (existing.leaseId && Number.isFinite(expiry) && expiry > nowMs) {
      return { claimed: false, reason: "already_running" };
    }
    const replaced = await putIfMatch(COLLECTION, id, next, current.etag);
    if (replaced?.modified) return { claimed: true, leaseId };
  }
  return { claimed: false, reason: "contention" };
}

/** Releases only the caller's lease; stale workers cannot release a newer lease. */
export async function releaseWinScheduledRunLease(
  runId: string,
  leaseId: string,
  nowMs = Date.now()
): Promise<boolean> {
  if (!runId || !leaseId) return false;
  const id = keyFor(runId);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const current = await getWithMetadata<WinScheduledRunLease>(COLLECTION, id);
    if (!current || current.value.runId !== runId || current.value.leaseId !== leaseId) return false;
    const released: WinScheduledRunLease = {
      ...current.value,
      leaseId: null,
      leaseExpiresAt: new Date(nowMs).toISOString(),
      releasedAt: new Date(nowMs).toISOString()
    };
    const result = await putIfMatch(COLLECTION, id, released, current.etag);
    if (result?.modified) return true;
  }
  return false;
}

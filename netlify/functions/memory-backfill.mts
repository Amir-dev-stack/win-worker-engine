import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { requireAuth } from "../lib/auth.mts";
import { getMemoryBackendMode } from "../lib/store.mts";
import { getNeonStore } from "../lib/neon-store.mts";

const PREFIXES = [
  "library/agent-profiles/",
  "library/persistent-agent-profiles/",
  "library/agent-observations/",
  "library/agent-notes/",
  "library/agent-task-queue/",
  "library/agent-proposals/",
  "library/agent-sandbox-evaluations/",
  "library/entity-profiles/",
  "library/lessons/",
  "library/lesson-review-cases/",
  "library/settlement-learning/",
  "library/settlement-learning-cases/",
  "library/settled-results/",
  "library/frozen-predictions/",
  "library/research-runs/",
  "library/coupons/",
  "library/winning-coupons/",
  "library/losing-coupons/",
  "library/pending-coupons/",
  "library/coupon-history/",
  "library/coupon-research-cases/",
  "library/win-coupon-candidates/",
  "library/learning-cycles/",
  "library/meta/"
];
const STORE_OPTIONS = { name: "win-engine", region: "eu-central-1", consistency: "strong" as const };

function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (getMemoryBackendMode() !== "mirror") {
    return Response.json({ error: "Set WIN_MEMORY_BACKEND=mirror first. Backfill never runs against a Neon-primary store." }, { status: 409 });
  }
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  if (body?.confirm !== "BACKFILL_STRUCTURED_WIN_MEMORY") {
    return Response.json({ error: "Explicit backfill confirmation is required." }, { status: 400 });
  }

  const blobs = getStore(STORE_OPTIONS);
  const lockKey = "library/meta/neon-backfill-lock";
  const now = new Date();
  const lock = { id: randomUUID(), status: "running", startedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString() };
  const existing = await blobs.getWithMetadata(lockKey, { type: "json", consistency: "strong" });
  let claim;
  if (existing?.data?.status === "running" && Date.parse(existing.data.expiresAt || "") > now.getTime()) {
    return Response.json({ error: "A structured-memory backfill is already running.", startedAt: existing.data.startedAt }, { status: 409 });
  } else if (existing?.etag) {
    claim = await blobs.setJSON(lockKey, lock, { onlyIfMatch: existing.etag });
  } else {
    claim = await blobs.setJSON(lockKey, lock, { onlyIfNew: true });
  }
  if (!claim?.modified) return Response.json({ error: "Could not acquire the backfill lock; retry after checking memory status." }, { status: 409 });

  const neon = getNeonStore();
  const statusKey = "library/meta/neon-backfill-status";
  const status: any = { id: lock.id, status: "running", startedAt: lock.startedAt, processed: 0, verified: 0, collections: {}, lastCollection: null };
  await blobs.setJSON(statusKey, status);
  try {
    for (const prefix of PREFIXES) {
      const collection = { scanned: 0, copied: 0, verified: 0, sourceDigest: "", targetDigest: "" };
      const sourceHashes: string[] = [];
      const targetHashes: string[] = [];
      for await (const page of blobs.list({ prefix, paginate: true })) {
        const entries = await Promise.all(page.blobs.map(async (item: any) => ({
          key: item.key, value: await blobs.get(item.key, { type: "json" })
        })));
        for (let offset = 0; offset < entries.length; offset += 12) {
          const batch = entries.slice(offset, offset + 12);
          await Promise.all(batch.map(async entry => {
            if (entry.value === null || entry.value === undefined) return;
            await neon.setJSON(entry.key, entry.value);
            const stored = await neon.get(entry.key);
            const sourceHash = createHash("sha256").update(canonical(entry.value)).digest("hex");
            const targetHash = createHash("sha256").update(canonical(stored)).digest("hex");
            sourceHashes.push(entry.key + ":" + sourceHash);
            targetHashes.push(entry.key + ":" + targetHash);
            collection.scanned++;
            collection.copied++;
            if (sourceHash !== targetHash) throw new Error("Record verification failed for " + entry.key);
            collection.verified++;
          }));
        }
        status.processed += collection.copied - (status.collections[prefix]?.copied || 0);
        status.verified += collection.verified - (status.collections[prefix]?.verified || 0);
        status.lastCollection = prefix;
        status.collections[prefix] = { ...collection };
        await blobs.setJSON(statusKey, status);
      }
      sourceHashes.sort(); targetHashes.sort();
      collection.sourceDigest = createHash("sha256").update(sourceHashes.join("\n")).digest("hex");
      collection.targetDigest = createHash("sha256").update(targetHashes.join("\n")).digest("hex");
      if (collection.sourceDigest !== collection.targetDigest) throw new Error("Collection digest mismatch for " + prefix);
      status.collections[prefix] = { ...collection };
      await blobs.setJSON(statusKey, status);
    }
    status.status = "completed";
    status.completedAt = new Date().toISOString();
    status.integrity = "verified";
    await blobs.setJSON("library/meta/neon-backfill-manifest-v1", status);
    await neon.setJSON("library/meta/neon-backfill-manifest-v1", status);
    await blobs.setJSON(statusKey, status);
    await blobs.delete(lockKey);
    return Response.json({ accepted: true, status: "completed", processed: status.processed });
  } catch (error) {
    status.status = "failed";
    status.failedAt = new Date().toISOString();
    status.error = String(error).slice(0, 500);
    await blobs.setJSON(statusKey, status);
    await blobs.delete(lockKey);
    throw error;
  }
};

export const config = { path: "/api/memory-backfill", background: true };

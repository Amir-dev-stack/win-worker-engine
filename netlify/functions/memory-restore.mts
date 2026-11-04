import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
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
  "library/learning-cycles/"
];
const STORE_OPTIONS = { name: "win-engine", region: "eu-central-1", consistency: "strong" as const };

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (getMemoryBackendMode() !== "mirror") {
    return Response.json({ error: "Restore is allowed only in mirror mode, where Blobs remains the primary memory store." }, { status: 409 });
  }
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  if (body?.confirm !== "RESTORE_NEON_MEMORY_SNAPSHOT" || !/^\d{4}-\d{2}-\d{2}$/.test(body?.date || "")) {
    return Response.json({ error: "Provide a valid backup date and explicit restore confirmation." }, { status: 400 });
  }

  const keyHex = process.env.WIN_MEMORY_BACKUP_KEY?.trim() || "";
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return Response.json({ error: "WIN_MEMORY_BACKUP_KEY is not configured correctly." }, { status: 503 });
  }
  const blobs = getStore(STORE_OPTIONS);
  const date = body.date;
  const snapshotKey = "library/memory-backups/" + date + ".jsonl.gz";
  const manifestKey = "library/memory-backups/" + date + ".manifest.json";
  const manifest: any = await blobs.get(manifestKey, { type: "json" });
  if (!manifest || manifest.status !== "completed" || manifest.snapshotKey !== snapshotKey) {
    return Response.json({ error: "A completed matching snapshot manifest was not found." }, { status: 404 });
  }
  if (manifest.encryption !== "AES-256-GCM" || manifest.format !== "aes-256-gcm+gzip-jsonl" ||
      !Number.isInteger(manifest.encryptedBytes) || manifest.encryptedBytes < 28 || manifest.encryptedBytes > 180 * 1024 * 1024 ||
      !Number.isInteger(manifest.rowCount) || manifest.rowCount < 0 || manifest.rowCount > 100_000 ||
      !Number.isInteger(manifest.rawBytes) || manifest.rawBytes > 180 * 1024 * 1024) {
    return Response.json({ error: "Snapshot exceeds restore safety limits." }, { status: 413 });
  }

  const lockKey = "library/meta/neon-restore-lock";
  const lock = await blobs.setJSON(lockKey, { startedAt: new Date().toISOString(), date }, { onlyIfNew: true });
  if (!lock?.modified) return Response.json({ error: "A Neon restore is already running." }, { status: 409 });
  const statusKey = "library/meta/neon-restore-status";
  const status: any = { date, status: "running", startedAt: new Date().toISOString(), restored: 0 };
  await blobs.setJSON(statusKey, status);

  try {
    const raw = await blobs.get(snapshotKey, { type: "arrayBuffer" });
    if (!raw) throw new Error("Snapshot object is missing.");
    const encrypted = Buffer.from(raw as ArrayBuffer);
    if (encrypted.byteLength !== manifest.encryptedBytes || encrypted.byteLength < 28) throw new Error("Encrypted snapshot byte count is invalid.");
    const encryptedDigest = createHash("sha256").update(encrypted).digest("hex");
    if (encryptedDigest !== manifest.encryptedSha256) throw new Error("Encrypted snapshot SHA-256 verification failed.");
    const iv = encrypted.subarray(0, 12);
    const authTag = encrypted.subarray(12, 28);
    const ciphertext = encrypted.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
    decipher.setAuthTag(authTag);
    const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const content = gunzipSync(compressed);
    if (content.byteLength !== manifest.rawBytes) throw new Error("Snapshot byte count does not match its manifest.");
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== manifest.sha256) throw new Error("Snapshot SHA-256 verification failed.");

    const neon = getNeonStore();
    const lines = content.toString("utf8").split("\n").filter(Boolean);
    if (lines.length !== manifest.rowCount) throw new Error("Snapshot row count does not match its manifest.");
    const allowed = (key: string) => PREFIXES.some(prefix => key.startsWith(prefix));
    for (let offset = 0; offset < lines.length; offset += 12) {
      const batch = lines.slice(offset, offset + 12).map(line => JSON.parse(line));
      for (const entry of batch) {
        if (!entry || typeof entry.key !== "string" || !allowed(entry.key) || !("value" in entry)) {
          throw new Error("Snapshot contains a record outside the approved structured-memory collections.");
        }
      }
      await Promise.all(batch.map((entry: any) => neon.setJSON(entry.key, entry.value)));
      status.restored += batch.length;
      await blobs.setJSON(statusKey, status);
    }
    status.status = "completed";
    status.completedAt = new Date().toISOString();
    status.integrity = "verified";
    status.snapshotKey = snapshotKey;
    await blobs.setJSON(statusKey, status);
    await blobs.setJSON("library/meta/neon-restore-latest", status);
    await neon.setJSON("library/meta/neon-restore-latest", status);
    return Response.json({ accepted: true, status: "completed", restored: status.restored });
  } catch (error) {
    status.status = "failed";
    status.failedAt = new Date().toISOString();
    status.error = String(error).slice(0, 500);
    await blobs.setJSON(statusKey, status);
    throw error;
  } finally {
    await blobs.delete(lockKey);
  }
};

export const config = { path: "/api/memory-restore", background: true };

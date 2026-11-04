import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getStore } from "@netlify/blobs";
import { getMemoryBackendMode } from "../lib/store.mts";
import { getNeonStore } from "../lib/neon-store.mts";
import { getRuntimeEnv } from "../lib/runtime-env.mts";

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
const MAX_ROWS = 100_000;
const MAX_RAW_BYTES = 180 * 1024 * 1024;

export default async () => {
  const mode = getMemoryBackendMode();
  if (mode === "blobs") return Response.json({ skipped: true, reason: "Neon memory is not enabled." });
  const keyHex = getRuntimeEnv("WIN_MEMORY_BACKUP_KEY")?.trim() || "";
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error("WIN_MEMORY_BACKUP_KEY must be configured as a 32-byte hexadecimal secret before encrypted backups can run.");

  const blobs = getStore(STORE_OPTIONS);
  const lockKey = "library/meta/neon-backup-lock";
  const now = new Date();
  const lockValue = { startedAt: now.toISOString() };
  const existingLock = await blobs.getWithMetadata(lockKey, { type: "json", consistency: "strong" });
  if (existingLock?.data?.startedAt && now.getTime() - Date.parse(existingLock.data.startedAt) < 30 * 60_000) {
    return Response.json({ skipped: true, reason: "A backup is already running." });
  }
  const lock = existingLock?.etag
    ? await blobs.setJSON(lockKey, lockValue, { onlyIfMatch: existingLock.etag })
    : await blobs.setJSON(lockKey, lockValue, { onlyIfNew: true });
  if (!lock?.modified) return Response.json({ skipped: true, reason: "Could not acquire the backup lock." });

  try {
    const neon = getNeonStore();
    const lines: string[] = [];
    const collectionCounts: Record<string, number> = {};
    let rawBytes = 0;

    for (const prefix of PREFIXES) {
      let count = 0;
      for await (const page of neon.list({ prefix, paginate: true })) {
        const values = await Promise.all(page.blobs.map(async (item: any) => ({
          key: item.key, value: await neon.get(item.key)
        })));
        for (const entry of values) {
          if (entry.value === null || entry.value === undefined) continue;
          const line = JSON.stringify({ key: entry.key, value: entry.value });
          rawBytes += Buffer.byteLength(line) + 1;
          if (rawBytes > MAX_RAW_BYTES) throw new Error("Backup exceeded the configured 180 MiB safety limit; no partial backup was published.");
          lines.push(line);
          count++;
          if (lines.length > MAX_ROWS) throw new Error("Backup exceeded the configured row safety limit; no partial backup was published.");
        }
      }
      collectionCounts[prefix] = count;
    }

    const content = Buffer.from(lines.length ? lines.join("\n") + "\n" : "", "utf8");
    const digest = createHash("sha256").update(content).digest("hex");
    const compressed = gzipSync(content);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const encrypted = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    const encryptedDigest = createHash("sha256").update(encrypted).digest("hex");
    const date = new Date().toISOString().slice(0, 10);
    const snapshotKey = "library/memory-backups/" + date + ".jsonl.gz";
    const manifestKey = "library/memory-backups/" + date + ".manifest.json";
    await blobs.set(snapshotKey, encrypted);
    const manifest = {
      id: "neon-memory-backup-" + date,
      status: "completed",
      format: "aes-256-gcm+gzip-jsonl",
      encryption: "AES-256-GCM",
      schemaVersion: 1,
      source: "neon_postgres",
      backendMode: mode,
      snapshotKey,
      rowCount: lines.length,
      rawBytes,
      compressedBytes: compressed.byteLength,
      encryptedBytes: encrypted.byteLength,
      sha256: digest,
      encryptedSha256: encryptedDigest,
      collections: collectionCounts,
      createdAt: new Date().toISOString(),
      retentionDays: 30
    };
    await blobs.setJSON(manifestKey, manifest);

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for await (const page of blobs.list({ prefix: "library/memory-backups/", paginate: true })) {
      for (const item of page.blobs) {
        const match = item.key.match(/library\/memory-backups\/(\d{4}-\d{2}-\d{2})\./);
        if (match && Date.parse(match[1] + "T00:00:00Z") < cutoff) await blobs.delete(item.key);
      }
    }
    await blobs.setJSON("library/meta/neon-backup-latest", manifest);
    return Response.json({ ok: true, ...manifest });
  } finally {
    await blobs.delete(lockKey);
  }
};

export const config = { schedule: "23 3 * * *", background: true };

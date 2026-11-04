import { neon } from "@neondatabase/serverless";
import { getRuntimeEnv } from "./runtime-env.mts";

const DEFAULT_LIMIT_BYTES = 1024 * 1024 * 1024;
const STORE_OPTIONS = { name: "win-engine", region: "eu-central-1", consistency: "strong" as const };

function configuredLimit() {
  const raw = getRuntimeEnv("WIN_NEON_STORAGE_LIMIT_BYTES");
  if (!raw) return { bytes: DEFAULT_LIMIT_BYTES, source: "planning_default_1_gib" };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("WIN_NEON_STORAGE_LIMIT_BYTES must be a positive integer.");
  }
  return { bytes: value, source: "configured" };
}

export async function collectMemoryCapacity() {
  const connection = getRuntimeEnv("WIN_NEON_DATABASE_URL");
  const limit = configuredLimit();
  let neonUsage: any = {
    configured: Boolean(connection),
    available: false,
    usedBytes: null,
    limitBytes: limit.bytes,
    limitSource: limit.source,
    usagePercent: null,
    alertLevel: "unknown",
    tables: []
  };

  if (connection) {
    if (!/^postgres(?:ql)?:\/\//i.test(connection)) throw new Error("WIN_NEON_DATABASE_URL is not a PostgreSQL connection string.");
    const sql = neon(connection, { fetchOptions: { cache: "no-store" } });
    const [database] = await sql`SELECT pg_database_size(current_database())::text AS used_bytes`;
    const tables = await sql`SELECT schemaname AS schema, relname AS table,
      pg_total_relation_size(schemaname || '.' || relname)::text AS used_bytes
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC LIMIT 20`;
    const usedBytes = Number(database?.used_bytes || 0);
    const usagePercent = limit.bytes > 0 ? Math.round((usedBytes / limit.bytes) * 10000) / 100 : 0;
    neonUsage = {
      configured: true,
      available: true,
      usedBytes,
      usedMiB: Math.round(usedBytes / 1024 / 1024 * 100) / 100,
      limitBytes: limit.bytes,
      limitGiB: Math.round(limit.bytes / 1024 / 1024 / 1024 * 100) / 100,
      limitSource: limit.source,
      usagePercent,
      remainingBytes: Math.max(0, limit.bytes - usedBytes),
      alertLevel: usagePercent >= 90 ? "critical" : usagePercent >= 75 ? "warning" : "healthy",
      tables: tables.map((row: any) => ({
        schema: row.schema,
        table: row.table,
        usedBytes: Number(row.used_bytes || 0)
      }))
    };
  }

  // Netlify Blobs exposes object keys and ETags, but not stored byte sizes through
  // its list API. Count objects without pretending this is a byte-accurate quota.
  const { getStore } = await import("@netlify/blobs");
  const blobs = getStore(STORE_OPTIONS);
  let blobCount = 0;
  let blobCountTruncated = false;
  for await (const page of blobs.list({ prefix: "library/", paginate: true })) {
    blobCount += page.blobs.length;
    if (blobCount >= 10000) {
      blobCountTruncated = true;
      break;
    }
  }

  const alertLevel = neonUsage.alertLevel;
  return {
    checkedAt: new Date().toISOString(),
    overallStatus: alertLevel,
    thresholds: { warningPercent: 75, criticalPercent: 90 },
    neon: neonUsage,
    netlifyBlobs: {
      available: true,
      objectCount: blobCount,
      objectCountTruncated: blobCountTruncated,
      usedBytes: null,
      note: "Netlify Blobs list API does not expose object byte sizes; exact storage usage must be read from Netlify usage/billing."
    },
    actions: alertLevel === "critical"
      ? ["Urgent: review Neon capacity and expand or archive before further ingestion."]
      : alertLevel === "warning"
        ? ["Warning: review growth and plan capacity before further ingestion."]
        : alertLevel === "healthy"
          ? ["No action required."]
          : ["Configure Neon connection before database capacity can be measured."]
  };
}

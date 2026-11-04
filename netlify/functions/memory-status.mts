import { requireAuth } from "../lib/auth.mts";
import { getStore } from "@netlify/blobs";
import { getMemoryBackendMode } from "../lib/store.mts";

const STORE_OPTIONS = { name: "win-engine", region: "eu-central-1", consistency: "strong" as const };

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const mode = getMemoryBackendMode();
  const configured = Boolean(process.env.WIN_NEON_DATABASE_URL?.trim());
  let backfill: unknown = null;
  try {
    backfill = await getStore(STORE_OPTIONS).get("library/meta/neon-backfill-status", { type: "json" });
  } catch {
    backfill = null;
  }
  if (mode === "blobs") {
    return Response.json({
      ok: true, backendMode: mode, primary: "netlify_blobs",
      neonConfigured: configured, neonChecked: false, backfill,
      note: "Neon is not active. Existing WIN storage remains on Netlify Blobs."
    }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const { getNeonStore } = await import("../lib/neon-store.mts");
    const health = await getNeonStore().health();
    return Response.json({
      ok: true, backendMode: mode,
      primary: mode === "neon" ? "neon_postgres" : "netlify_blobs",
      replica: mode === "neon" ? "netlify_blobs" : "neon_postgres",
      neonConfigured: configured, neonChecked: true, backfill,
      recordCount: health.recordCount, databaseTime: health.databaseTime
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false, backendMode: mode, neonConfigured: configured,
      neonChecked: true, error: "Neon memory is unavailable or its schema has not been applied.",
      detail: String(error).slice(0, 500)
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/memory-status" };

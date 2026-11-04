import { requireAuth } from "../lib/auth.mts";
import { collectMemoryCapacity } from "../lib/memory-capacity.mts";
import { getStore } from "@netlify/blobs";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const capacity = await collectMemoryCapacity();
    const blobs = getStore({ name: "win-engine", region: "eu-central-1", consistency: "strong" });
    const dailySnapshot = await blobs.get("library/meta/memory-capacity-latest", { type: "json" });
    return Response.json({ ok: true, ...capacity, dailySnapshot: dailySnapshot || null, growthBytes: dailySnapshot?.growthBytes ?? null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Memory capacity check failed. Check WIN storage configuration and function logs." }, {
      status: 503, headers: { "cache-control": "no-store" }
    });
  }
};

export const config = { path: "/api/memory-capacity" };

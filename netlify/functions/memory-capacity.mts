import { requireAuth } from "../lib/auth.mts";
import { collectMemoryCapacity } from "../lib/memory-capacity.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const capacity = await collectMemoryCapacity();
    return Response.json({ ok: true, ...capacity }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "Memory capacity check failed. Check WIN storage configuration and function logs." }, {
      status: 503, headers: { "cache-control": "no-store" }
    });
  }
};

export const config = { path: "/api/memory-capacity" };

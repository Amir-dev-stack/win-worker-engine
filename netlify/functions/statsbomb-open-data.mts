import { requireAuth } from "../lib/auth.mts";
import { getStatsBombOpenDataCatalog, getStatsBombOpenDataStatus } from "../lib/statsbomb-open-data-adapter.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    const [catalog, status] = await Promise.all([
      getStatsBombOpenDataCatalog(),
      getStatsBombOpenDataStatus()
    ]);
    return Response.json({
      ok: true,
      provider: {
        id: "statsbomb-open-data",
        access: "free public research dataset",
        authentication: "none",
        automation: "disabled",
        usage: "private non-commercial research only",
        attribution: "If publishing, sharing or distributing analysis based on this data, credit StatsBomb and use its official logo.",
        repository: "https://github.com/hudl/open-data"
      },
      status,
      catalog
    }, { headers: { "cache-control": "private, max-age=3600" } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: "StatsBomb public catalogue is temporarily unavailable.",
      detail: String(error).slice(0, 400)
    }, { status: 502, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/statsbomb-open-data" };

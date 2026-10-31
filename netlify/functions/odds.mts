import type { Config } from "@netlify/functions";
import { requireAuth } from "../lib/auth.mts";
import { get } from "../lib/store.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const snapshot = await get<any>("odds", "latest");
  const storedStatus = await get<any>("odds-status", "current");
  const hasKey = Boolean(Netlify.env.get("ARBISCAN_API_KEY"));
  const status = storedStatus ?? {
    status: hasKey ? "waiting_for_first_sync" : "needs_configuration",
    provider: "ArbiScan independent data feed",
    source: "STS-labelled prematch odds where included by the provider",
    updatedAt: null
  };

  return Response.json({
    integration: {
      provider: "ArbiScan",
      providerType: "independent odds-data provider; not an official STS API",
      configured: hasKey,
      status: status.status,
      lastAttemptAt: status.lastAttemptAt ?? null,
      lastSuccessAt: status.lastSuccessAt ?? null,
      error: status.error ?? null,
      schedule: "Every 15 minutes (published production deploy)"
    },
    snapshot: snapshot ?? null
  }, { headers: { "cache-control": "no-store" } });
};

export const config: Config = { path: "/api/odds" };

import { requireAuth } from "../lib/auth.mts";
import { listSportCapabilities } from "../lib/sport-registry.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  return Response.json({
    count: listSportCapabilities().length,
    sports: listSportCapabilities(),
    note: "Registry coverage describes WIN methodology and supported market families; actual bookmaker/provider availability must be independently verified."
  });
};
export const config = { path: "/api/sports" };

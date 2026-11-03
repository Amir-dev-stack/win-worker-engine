import { requireAuth } from "../lib/auth.mts";
import { listHumanCouponRecords } from "../lib/source-intelligence.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  return Response.json(await listHumanCouponRecords({
    q: url.searchParams.get("q"), sport: url.searchParams.get("sport"),
    outcome: url.searchParams.get("outcome"), sourceId: url.searchParams.get("sourceId"),
    limit: url.searchParams.get("limit")
  }));
};
export const config = { path: "/api/human-coupons" };

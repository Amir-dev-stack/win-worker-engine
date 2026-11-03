import { requireAuth } from "../lib/auth.mts";
import { buildCoverageReport } from "../lib/coverage.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const report = await buildCoverageReport();
  return Response.json(report, { headers: { "cache-control": "no-store" } });
};
export const config = { path: "/api/coverage" };

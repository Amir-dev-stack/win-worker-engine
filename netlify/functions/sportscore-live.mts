import { requireAuth } from "../lib/auth.mts";
import { getSportScoreMatches } from "../lib/sportscore-live-adapter.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const sport = (url.searchParams.get("sport") || "").trim().toLowerCase();
  try {
    const result = await getSportScoreMatches(sport);
    return Response.json({
      ok: true,
      provider: "SportScore",
      sport,
      ...result
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = String(error).slice(0, 300);
    const status = message.includes("unsupported_sport") ? 400
      : message.includes("sportscore_http_") ? 502
      : message.includes("policy_blocked") ? 503 : 502;
    return Response.json({
      ok: false,
      provider: "SportScore",
      error: message,
      note: "SportScore is a supplementary source. Verify important results independently."
    }, { status, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/sportscore-live" };

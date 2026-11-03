import { requireAuth } from "../lib/auth.mts";
import { saveResearchEvidence, searchResearchEvidence } from "../lib/library.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    const url = new URL(req.url);
    return Response.json(await searchResearchEvidence({
      sport: url.searchParams.get("sport"),
      country: url.searchParams.get("country"),
      competition: url.searchParams.get("competition"),
      eventId: url.searchParams.get("eventId"),
      entityId: url.searchParams.get("entityId"),
      domain: url.searchParams.get("domain"),
      metric: url.searchParams.get("metric"),
      limit: url.searchParams.get("limit")
    }));
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  try {
    const records = Array.isArray(body?.records) ? body.records.slice(0, 500) : [body];
    const saved = [];
    for (const record of records) saved.push(await saveResearchEvidence(record));
    return Response.json({ saved: saved.length, items: saved });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
};
export const config = { path: "/api/research-data" };

import { requireAuth } from "../lib/auth.mts";
import {
  findApiFootballFixtures,
  getApiFootballSyncStatus,
  syncApiFootballFixtureDossier,
  testApiFootballConnection
} from "../lib/api-football-adapter.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    return Response.json(await getApiFootballSyncStatus(), { headers: { "cache-control": "no-store" } });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  const action = String(body?.action || "");
  try {
    if (action === "test_connection") {
      return Response.json({ accepted: true, result: await testApiFootballConnection() }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "find_fixtures") {
      const result = await findApiFootballFixtures({
        date: String(body?.date || ""),
        leagueId: body?.leagueId === undefined ? undefined : Number(body.leagueId),
        teamId: body?.teamId === undefined ? undefined : Number(body.teamId)
      });
      return Response.json({ accepted: true, result }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "sync_fixture") {
      const result = await syncApiFootballFixtureDossier(Number(body?.fixtureId), {
        includeContext: body?.includeContext === true,
        includeHalfTime: body?.includeHalfTime !== false
      });
      return Response.json({ accepted: true, result }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Unsupported API-Football action." }, { status: 400 });
  } catch (error) {
    const message = String(error).slice(0, 500);
    const status = message.startsWith("api_football_sync_blocked:") ? 409
      : message.includes("not_found") || message.includes("invalid_") ? 400 : 502;
    return Response.json({ error: message, readiness: await getApiFootballSyncStatus() }, { status, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/football-data" };

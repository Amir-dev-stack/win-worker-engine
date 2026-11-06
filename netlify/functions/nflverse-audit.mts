import { requireAuth } from "../lib/auth.mts";
import { auditNflversePlayByPlayReadOnly } from "../lib/nflverse-pbp-adapter.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }

  if (body?.action !== "audit_read_only" || body?.confirmReadOnly !== true) {
    return Response.json({
      error: "Explicit read-only confirmation is required.",
      required: { action: "audit_read_only", confirmReadOnly: true }
    }, { status: 400 });
  }

  const season = body?.season === undefined ? undefined : Number(body.season);
  if (season !== undefined && (!Number.isInteger(season) || season < 1999 || season > new Date().getUTCFullYear())) {
    return Response.json({ error: "Invalid NFL season." }, { status: 400 });
  }

  try {
    const result = await auditNflversePlayByPlayReadOnly(season);
    return Response.json({ accepted: true, result }, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: String(error).slice(0, 500), writesPerformed: 0, aiCalls: 0 }, {
      status: 502, headers: { "cache-control": "no-store" }
    });
  }
};

export const config = { path: "/api/nflverse-audit" };

import { requireAuth } from "../lib/auth.mts";
import { getAIbudgetStatus, setAIbudgetLimitEnabled } from "../lib/ai-budget.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    return Response.json(await getAIbudgetStatus(), { headers: { "cache-control": "no-store" } });
  }
  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
    if (typeof body?.limitEnabled !== "boolean") {
      return Response.json({ error: "limitEnabled must be a boolean." }, { status: 400 });
    }
    await setAIbudgetLimitEnabled(body.limitEnabled);
    return Response.json(await getAIbudgetStatus(), { headers: { "cache-control": "no-store" } });
  }
  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/ai-budget" };

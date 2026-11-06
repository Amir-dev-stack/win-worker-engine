import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { getAIbudgetStatus, ownerApproveBudgetUnlock } from "../lib/ai-budget.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    return Response.json(await getAIbudgetStatus(), { headers: { "cache-control": "no-store" } });
  }
  if (req.method === "POST") {
    const parsedRequest = await readBoundedJsonObject(req, 8 * 1024);
    if (parsedRequest instanceof Response) return parsedRequest;
    const body = parsedRequest.body;
    if (body?.action !== "owner_approve_unlock" || typeof body?.confirmation !== "string") {
      return Response.json({ error: "Budget changes are locked. Only explicit owner unlock with the exact confirmation phrase is accepted." }, { status: 403 });
    }
    try {
      await ownerApproveBudgetUnlock(body.confirmation);
      return Response.json(await getAIbudgetStatus(), { headers: { "cache-control": "no-store" } });
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 403, headers: { "cache-control": "no-store" } });
    }
  }
  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/ai-budget" };

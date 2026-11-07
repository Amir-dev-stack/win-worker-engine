import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { getTipsterSourceReport, importTipsterCoupon, listTipsterSources } from "../lib/source-intelligence.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("view") === "report") return Response.json(await getTipsterSourceReport(), { headers: { "cache-control": "no-store" } });
    return Response.json(listTipsterSources(), { headers: { "cache-control": "no-store" } });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsedRequest = await readBoundedJsonObject(req, 64 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;
  try {
    if (body?.action !== "import_coupon") return Response.json({ error: "Allowed action: import_coupon" }, { status: 400 });
    return Response.json(await importTipsterCoupon(body), { status: 201 });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
};
export const config = { path: "/api/sources" };

import { requireAuth } from "../lib/auth.mts";
import { getTipsterSourceReport, importTipsterCoupon, listTipsterSources } from "../lib/source-intelligence.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") return Response.json({ ...listTipsterSources(), report: await getTipsterSourceReport() });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  try { return Response.json(await importTipsterCoupon(body), { status: 201 }); }
  catch (error) { return Response.json({ error: String(error) }, { status: 400 }); }
};
export const config = { path: "/api/human-sources" };

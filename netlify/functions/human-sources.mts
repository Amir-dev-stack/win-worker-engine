import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { ensureHumanCouponSeedExamples, getTipsterSourceReport, importTipsterCoupon, listTipsterSources } from "../lib/source-intelligence.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") { const seedImport = await ensureHumanCouponSeedExamples(); return Response.json({ ...listTipsterSources(), seedImport, report: await getTipsterSourceReport() }); }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsedRequest = await readBoundedJsonObject(req, 64 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;
  try { return Response.json(await importTipsterCoupon(body), { status: 201 }); }
  catch (error) { return Response.json({ error: String(error) }, { status: 400 }); }
};
export const config = { path: "/api/human-sources" };

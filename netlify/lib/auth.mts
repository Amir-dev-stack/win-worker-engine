import { timingSafeEqual } from "node:crypto";

export function authorized(req: Request): boolean {
  const expected = Netlify.env.get("WIN_INTERNAL_TOKEN");
  if (!expected) return false;
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const actual = Buffer.from(match[1]);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function requireAuth(req: Request): Response | null {
  if (authorized(req)) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

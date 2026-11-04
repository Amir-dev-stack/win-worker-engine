import { requireAuth } from "../lib/auth.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }
  if (body?.action !== "run_post_match_check")
    return Response.json({ error: "Action must be run_post_match_check." }, { status: 400 });
  const url = new URL("/.netlify/functions/post-match-runner", new URL(req.url).origin);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: req.headers.get("authorization") || "" }
  });
  if (response.status !== 202 && !response.ok) {
    const detail = await response.text().catch(() => "");
    return Response.json({ error: "Could not queue the no-AI post-match run: HTTP " + response.status + " " + detail.slice(0, 240) }, { status: 502 });
  }
  return Response.json({
    accepted: true, status: "queued", aiCalls: 0, automaticBetting: false,
    message: "WIN post-match checks are queued. The background worker will retrieve public result data and search leads without using the OpenAI model."
  }, { status: 202, headers: { "cache-control": "no-store" } });
};
export const config = { path: "/api/post-match-check" };

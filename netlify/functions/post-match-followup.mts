import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  const token = Netlify.env.get("WIN_INTERNAL_TOKEN")?.trim();
  if (!token) return Response.json({ accepted: false, status: "missing_internal_token" }, { status: 503 });
  const target = new URL("/.netlify/functions/post-match-runner", new URL(req.url).origin);
  const response = await fetch(target, {
    method: "POST",
    headers: { authorization: "Bearer " + token }
  });
  if (response.status !== 202 && !response.ok)
    throw new Error("Could not queue post-match background runner: HTTP " + response.status);
  return Response.json({ accepted: true, status: "queued", aiCalls: 0 });
};
export const config: Config = { schedule: "23 */4 * * *" };

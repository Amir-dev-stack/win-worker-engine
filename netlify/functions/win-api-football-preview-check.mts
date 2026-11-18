import type { Config, Context } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { readApiFootballFixture } from "../../scripts/win-api-football-research.mjs";
import { isAllowedPreviewContext, previewStatShape } from "../../scripts/win-api-football-preview-report.mjs";

const error = (status:number, code:string) => Response.json({error:code},{status,headers:{"cache-control":"no-store"}});
const equal = (actual:string|null, expected:string|null|undefined) => {
  if (!actual || !expected) return false;
  const match = actual.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  const a = Buffer.from(match[1]), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
};

/** Does exactly one read-only API-Football request per authenticated preview invocation.
 * Does not accept URLs, league-wide crawls, raw credentials, or database writes.
 * This endpoint is NEVER enabled in production, even if someone adds a production key.
 */
export default async function handler(req:Request, context:Context) {
  if (!isAllowedPreviewContext(context?.deploy?.context)) return error(404,"NOT_AVAILABLE");
  if (req.method !== "POST") return error(405,"METHOD_NOT_ALLOWED");
  if (!equal(req.headers.get("authorization"),Netlify.env.get("WIN_PREVIEW_ACCESS_TOKEN"))) return error(401,"UNAUTHORIZED");
  const apiKey = Netlify.env.get("WIN_API_FOOTBALL_KEY");
  if (!apiKey) return error(503,"API_KEY_NOT_CONFIGURED");
  const raw = await req.text();
  if (raw.length > 2048) return error(413,"REQUEST_TOO_LARGE");
  let payload:any;
  try {payload=JSON.parse(raw);} catch {return error(400,"INVALID_JSON");}
  const resource=payload?.resource;
  const fixtureId=payload?.fixtureId;
  if (!["fixtures","fixtures/statistics","fixtures/players"].includes(resource) || !Number.isSafeInteger(fixtureId) || fixtureId<1) {
    return error(400,"INVALID_REQUEST");
  }
  try {
    const result=await readApiFootballFixture(resource,fixtureId,{
      apiKey, signal:AbortSignal.timeout(10000)
    });
    return Response.json({
      provider:result.provider, resource:result.resource, fixtureId:result.fixtureId,
      retrievedAt:result.retrievedAt, recordCount:result.recordCount,
      freeQuotaRemaining:result.freeQuotaRemaining,
      coverage:previewStatShape(result.records,resource),
      researchOnly:true, persisted:false
    },{headers:{"cache-control":"no-store"}});
  } catch {
    // Do not expose upstream responses, request headers, token, or raw provider data.
    return error(502,"PROVIDER_REQUEST_FAILED");
  }
}
export const config:Config={
  path:"/api/win-api-football-preview-check",
  method:"POST",
  rateLimit:{action:"rate_limit",aggregateBy:"ip",windowSize:60,windowLimit:3}
};

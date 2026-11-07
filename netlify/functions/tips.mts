import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { list, put } from "../lib/store.mts";

export default async (req: Request) => {
  const denied=requireAuth(req); if(denied)return denied;
  if(req.method==="GET") return Response.json(await list("tips",200));
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  const parsedRequest = await readBoundedJsonObject(req, 16 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;
  if(!body.tip || typeof body.tip!=="string") return Response.json({error:"tip text is required"},{status:400});
  const id=crypto.randomUUID();
  const tip={id,tip:body.tip,sourceUrl:body.sourceUrl??null,sourceName:body.sourceName??"User import",capturedAt:new Date().toISOString(),event:body.event??null,tipster:body.tipster??null,metadata:body.metadata??{},status:"unverified"};
  await put("tips",id,tip);
  await put("library/human-tips",id,tip);
  return Response.json(tip,{status:201});
};
export const config={path:"/api/tips"};

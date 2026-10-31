import { requireAuth } from "../lib/auth.mts";
import { list, put } from "../lib/store.mts";

export default async (req: Request) => {
  const denied=requireAuth(req); if(denied)return denied;
  if(req.method==="GET") return Response.json(await list("tips",200));
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  let body:any; try{body=await req.json()}catch{return Response.json({error:"Expected JSON"},{status:400})}
  if(!body.tip || typeof body.tip!=="string") return Response.json({error:"tip text is required"},{status:400});
  const id=crypto.randomUUID();
  const tip={id,tip:body.tip,sourceUrl:body.sourceUrl??null,sourceName:body.sourceName??"User import",capturedAt:new Date().toISOString(),event:body.event??null,tipster:body.tipster??null,metadata:body.metadata??{},status:"unverified"};
  await put("tips",id,tip);
  return Response.json(tip,{status:201});
};
export const config={path:"/api/tips"};

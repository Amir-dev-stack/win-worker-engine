import { requireAuth } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";

export default async (req: Request) => {
  const denied = requireAuth(req); if (denied) return denied;
  if (req.method === "GET") return Response.json(await list("runs",100));
  if (req.method !== "POST") return new Response("Method not allowed",{status:405});
  let brief: any;
  try { brief = await req.json(); } catch { return Response.json({error:"Expected JSON body"},{status:400}); }
  if (!brief || typeof brief !== "object" || !brief.event) return Response.json({error:"event is required"},{status:400});
  const id = crypto.randomUUID();
  const run = {id,status:"queued",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),brief,workers:[],debate:[],master:null};
  await put("runs",id,run);
  const base = new URL(req.url);
  const trigger = await fetch(new URL("/.netlify/functions/worker-runner",base),{
    method:"POST",headers:{"content-type":"application/json","authorization":req.headers.get("authorization") ?? ""},
    body:JSON.stringify({runId:id})
  });
  if (!trigger.ok && trigger.status !== 202) {
    await put("runs",id,{...run,status:"failed",error:"Could not queue worker run: HTTP "+trigger.status});
    return Response.json({error:"Could not queue background workers",runId:id},{status:502});
  }
  return Response.json({runId:id,status:"queued",message:"Independent workers queued."},{status:202});
};
export const config = {path:"/api/runs"};

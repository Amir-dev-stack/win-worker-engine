import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";
import { runDebate, runGlobalMaster, runIndependentWorkers } from "../lib/ai.mts";

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Unauthorized",{status:401});
  let body: any; try { body=await req.json(); } catch { return new Response("Bad JSON",{status:400}); }
  const run = await get<any>("runs",body.runId);
  if (!run) return new Response("Run not found",{status:404});
  await put("runs",run.id,{...run,status:"researching",updatedAt:new Date().toISOString()});
  try {
    const reports = await runIndependentWorkers(run.brief);
    const withInitial = {...run,status:"debating",workers:reports,updatedAt:new Date().toISOString()};
    await put("runs",run.id,withInitial);
    const debate = await runDebate(run.brief,reports);
    const withDebate = {...withInitial,status:"synthesizing",debate,updatedAt:new Date().toISOString()};
    await put("runs",run.id,withDebate);
    const failed = [...reports,...debate].filter(x=>x.status!=="completed" || !x.report.trim());
    const master = failed.length
      ? {workerId:crypto.randomUUID(),role:"Global Master — deterministic safety gate",phase:"final",status:"completed",report:"FINAL DECISION: NO BET\n\nThe Low-Risk Gate rejected this run because one or more required independent checks failed or returned an empty report. Failed checks: "+failed.map(x=>x.role+": "+(x.error||"empty report")).join("; ")+". Do not place a bet; rerun after the research services are restored.",citations:[],startedAt:new Date().toISOString(),completedAt:new Date().toISOString()}
      : await runGlobalMaster(run.brief,reports,debate);
    const completed = {...withDebate,status:"completed",master,decision:master.status==="completed"?master.report:"FINAL DECISION: NO BET — Global Master failed; manual review required.",updatedAt:new Date().toISOString(),completedAt:new Date().toISOString()};
    await put("runs",run.id,completed);
    if (master.status==="completed") {
      const predictionId=crypto.randomUUID();
      await put("predictions",predictionId,{id:predictionId,runId:run.id,recordedAt:new Date().toISOString(),frozen:true,brief:run.brief,decision:master.report,workerResponseIds:[...reports,...debate,master].map(x=>x.responseId).filter(Boolean)});
    }
  } catch(error) {
    await put("runs",run.id,{...run,status:"failed",error:String(error),updatedAt:new Date().toISOString()});
  }
  return new Response(null,{status:202});
};
export const config: Config = {background:true};

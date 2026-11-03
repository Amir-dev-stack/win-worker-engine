import { requireAuth } from "../lib/auth.mts";
import { createSimulationRun, createBetBuilderSimulationRun } from "../lib/simulation.mts";
import { list } from "../lib/store.mts";
export default async(req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method==="GET"){
  const url=new URL(req.url),runId=url.searchParams.get("runId"),category=url.searchParams.get("category")||"runs";
  if(category==="runs")return Response.json(await list<any>("library/simulation-runs",100));
  const collection=category==="winning"?"library/simulation-winning-coupons":category==="losing"?"library/simulation-losing-coupons":category==="other"?"library/simulation-other-coupons":"";
  if(!collection)return Response.json({error:"category must be runs, winning, losing or other"},{status:400});
  const batches=await list<any>(collection,1000),records=batches.filter(x=>!runId||x.runId===runId).flatMap(x=>x.records||[]);
  return Response.json({category,runId,count:records.length,items:records.slice(0,200)});
 }
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 let body:any;try{body=await req.json();}catch{return Response.json({error:"Expected JSON body"},{status:400});}
 try{
  const run=body?.couponType==="bet_builder"?await createBetBuilderSimulationRun(body):await createSimulationRun(body);
  const trigger=await fetch(new URL("/.netlify/functions/simulation-runner",new URL(req.url)),{method:"POST",headers:{"content-type":"application/json","authorization":req.headers.get("authorization")??""},body:JSON.stringify({runId:run.id,runType:run.runType||"accumulator"})});
  if(!trigger.ok&&trigger.status!==202)return Response.json({error:"Could not queue simulation worker",runId:run.id},{status:502});
  return Response.json({runId:run.id,status:"queued",couponCount:run.couponCount,selectionCount:run.selectionCount,couponType:run.couponType,message:"Simulation queued. Outcomes are derived from the supplied settled historical dataset."},{status:202});
 }catch(error){return Response.json({error:String(error)},{status:400});}
};
export const config={path:"/api/simulations"};

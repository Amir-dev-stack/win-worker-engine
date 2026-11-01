import { requireAuth } from "../lib/auth.mts";
import { createSimulationRun } from "../lib/simulation.mts";
import { list } from "../lib/store.mts";
export default async(req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method==="GET")return Response.json(await list<any>("library/simulation-runs",100));
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 let body:any;try{body=await req.json();}catch{return Response.json({error:"Expected JSON body"},{status:400});}
 try{
  const run=await createSimulationRun(body);
  const trigger=await fetch(new URL("/.netlify/functions/simulation-runner",new URL(req.url)),{method:"POST",headers:{"content-type":"application/json","authorization":req.headers.get("authorization")??""},body:JSON.stringify({runId:run.id})});
  if(!trigger.ok&&trigger.status!==202)return Response.json({error:"Could not queue simulation worker",runId:run.id},{status:502});
  return Response.json({runId:run.id,status:"queued",couponCount:run.couponCount,selectionCount:run.selectionCount,message:"Simulation queued. Outcomes are derived from the supplied settled historical dataset."},{status:202});
 }catch(error){return Response.json({error:String(error)},{status:400});}
};
export const config={path:"/api/simulations"};

import type { Config } from "@netlify/functions";
import { authorized } from "../lib/auth.mts";
import { executeSimulationRun } from "../lib/simulation.mts";
import { get, put } from "../lib/store.mts";
export default async(req:Request)=>{
 if(!authorized(req))return new Response("Unauthorized",{status:401});
 let body:any;try{body=await req.json();}catch{return new Response("Bad JSON",{status:400});}
 const id=typeof body?.runId==="string"?body.runId:"";if(!id)return new Response("runId required",{status:400});
 try{await executeSimulationRun(id);return new Response(null,{status:202});}
 catch(error){const current=await get<any>("library/simulation-runs",id);if(current)await put("library/simulation-runs",id,{...current,status:"failed",error:String(error),updatedAt:new Date().toISOString()});return new Response(String(error),{status:500});}
};
export const config:Config={background:true};

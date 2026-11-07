import type { Config } from "@netlify/functions";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { authorized } from "../lib/auth.mts";
import { executeSimulationRun, executeBetBuilderSimulationRun } from "../lib/simulation.mts";
import { get, put } from "../lib/store.mts";
export default async(req:Request)=>{
 if(!authorized(req))return new Response("Unauthorized",{status:401});
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 const parsedRequest = await readBoundedJsonObject(req, 8 * 1024);
 if (parsedRequest instanceof Response) return parsedRequest;
 const body = parsedRequest.body;
 const id=typeof body?.runId==="string"?body.runId:"";if(!id)return new Response("runId required",{status:400});
 try{if(body?.runType==="bet_builder")await executeBetBuilderSimulationRun(id);else await executeSimulationRun(id);return new Response(null,{status:202});}
 catch(error){const current=await get<any>("library/simulation-runs",id);if(current)await put("library/simulation-runs",id,{...current,status:"failed",error:String(error),updatedAt:new Date().toISOString()});return new Response(String(error),{status:500});}
};
export const config:Config={background:true};

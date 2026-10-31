import type { Context } from "@netlify/functions";
import { requireAuth } from "../lib/auth.mts";
import { get } from "../lib/store.mts";
export default async(req:Request,context:Context)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const id=context.params.id;
 const run=await get<any>("runs",id);
 return run?Response.json(run):Response.json({error:"Run not found"},{status:404});
};
export const config={path:"/api/runs/:id"};

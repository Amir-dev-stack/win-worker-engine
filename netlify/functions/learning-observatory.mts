import { requireAuth } from "../lib/auth.mts";
import { getLearningObservatory } from "../lib/learning-observatory.mts";
export default async (req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 return Response.json(await getLearningObservatory(),{headers:{"cache-control":"no-store"}});
};
export const config={path:"/api/learning-observatory"};

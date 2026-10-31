import { requireAuth } from "../lib/auth.mts";
import { list } from "../lib/store.mts";
export default async (req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 return Response.json(await list("predictions",500));
};
export const config={path:"/api/predictions"};

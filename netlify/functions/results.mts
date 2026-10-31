import { requireAuth } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";
export default async(req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 let body:any;try{body=await req.json()}catch{return Response.json({error:"Expected JSON"},{status:400})}
 if(!body.predictionId||!body.outcome||!body.settlementSource)return Response.json({error:"predictionId, outcome and settlementSource are required"},{status:400});
 const prediction=await get<any>("predictions",body.predictionId);
 if(!prediction)return Response.json({error:"Prediction not found"},{status:404});
 const id=crypto.randomUUID();
 const result={id,predictionId:body.predictionId,outcome:body.outcome,settlementSource:body.settlementSource,evidence:body.evidence??null,recordedAt:new Date().toISOString()};
 await put("results",id,result);
 return Response.json(result,{status:201});
};
export const config={path:"/api/results"};

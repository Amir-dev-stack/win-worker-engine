import { requireAuth } from "../lib/auth.mts";
import { get, put } from "../lib/store.mts";
import { getPublicResearchSourceDiscoveryStatus } from "../lib/public-source-discovery.mts";
export default async (req:Request)=>{
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method==="GET")return Response.json(await getPublicResearchSourceDiscoveryStatus(),{headers:{"cache-control":"no-store"}});
 if(req.method!=="POST")return new Response("Method not allowed",{status:405});
 let body:any;try{body=await req.json();}catch{return Response.json({error:"invalid_json"},{status:400});}
 const candidateId=typeof body?.candidateId==="string"?body.candidateId.trim():"";
 const decision=body?.decision;
 if(!candidateId||!["approve_for_adapter_review","reject","defer"].includes(decision))return Response.json({error:"candidateId and a valid review decision are required."},{status:400});
 const candidate=await get<any>("library/research-source-candidates",candidateId);
 if(!candidate)return Response.json({error:"candidate_not_found"},{status:404});
 const status=decision==="approve_for_adapter_review"?"approved_for_adapter_review":decision==="reject"?"rejected":"deferred";
 const updated={...candidate,reviewStatus:status,reviewNote:typeof body.reviewNote==="string"?body.reviewNote.slice(0,800):candidate.reviewNote,reviewedAt:new Date().toISOString(),reviewedBy:"authenticated_user_action",automationAllowed:false,dataRightsVerified:false};
 await put("library/research-source-candidates",candidateId,updated);
 return Response.json({candidate:{id:candidateId,name:updated.name,reviewStatus:updated.reviewStatus,automationAllowed:false},message:status==="approved_for_adapter_review"?"Approved for adapter design and source-specific terms review only. It is not connected or enabled for automatic ingestion.":"Review decision saved. No provider was activated."});
};
export const config={path:"/api/research-source-candidates"};

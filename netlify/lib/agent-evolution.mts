import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex").slice(0,32);
const clean=(v:any,n=1200)=>typeof v==="string"?v.trim().slice(0,n):"";
const arrayStrings=(v:any,max=20)=>Array.isArray(v)?v.filter(x=>typeof x==="string"&&x.trim()).map(x=>x.trim().slice(0,500)).slice(0,max):[];
function normalizeSport(v:any){
 const s=clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"_");
 const map:Record<string,string>={soccer:"football",futbol:"football",nhl:"ice_hockey",hockey:"ice_hockey",nfl:"american_football",americanfootball:"american_football",nba:"basketball",mlb:"baseball",atp:"tennis",wta:"tennis"};
 return map[s]||s;
}
function readiness(proposal:any,pack:any){
 const summary=pack?.dataSummary||{},scope=proposal.scope||{},sport=normalizeSport(scope.sport);
 const eventRows=Number(summary.eventRowsBySport?.[sport]||0),consensusRows=Number(summary.consensusRowsBySport?.[sport]||0);
 const observedRows=Number(summary.observedRowsBySport?.[sport]||0);
 const playerRows=Number(summary.playerEventRowsBySport?.[sport]||0);
 const blockers:string[]=[];
 if(!sport)blockers.push("scope_sport_missing");
 if(!proposal.evidenceRefs.length)blockers.push("evidence_refs_missing");
 if(eventRows+consensusRows+observedRows<30)blockers.push("fewer_than_30_relevant_historical_rows");
 for(const requirement of proposal.requiredData){
  const r=requirement.toLowerCase();
  if(/injur|lineup|roster/.test(r)&&playerRows===0)blockers.push("required_lineup_or_player_event_data_unavailable");
  if(/odds|market|price|closing/.test(r)&&consensusRows+observedRows<30)blockers.push("required_market_price_data_insufficient");
  if(/result|fixture|score|event/.test(r)&&eventRows<30)blockers.push("required_event_result_data_insufficient");
  if(/corner|shot|xg|possession|assist/.test(r))blockers.push("required_statistic_not_in_current_connected_sources:"+r.slice(0,80));
 }
 return {status:blockers.length?"blocked_missing_evidence_or_data":"ready_for_human_sandbox_approval",evaluationType:"data_readiness_only_not_performance_test",sport,eventRows,consensusRows,observedRows,playerEventRows:playerRows,availableRows:eventRows+consensusRows+observedRows,blockers:[...new Set(blockers)],evaluatedAt:new Date().toISOString(),humanCouponLabTouched:false,productionPromotion:"blocked_until_separate_chronological_oos_test_and_independent_review"};
}
export async function registerAgentProposals(raw:any,runId:string,modelLabResearchPack:any){
 const proposals=Array.isArray(raw?.proposals)?raw.proposals.slice(0,3):[];
 const accepted:any[]=[],rejected:any[]=[];
 for(const item of proposals){
  const name=clean(item?.name,120),role=clean(item?.role,160),mission=clean(item?.mission,1600),scope=item?.scope&&typeof item.scope==="object"&&!Array.isArray(item.scope)?item.scope:{};
  const requiredData=arrayStrings(item?.requiredData),evaluationPlan=clean(item?.evaluationPlan,1500),riskControls=arrayStrings(item?.riskControls),evidenceRefs=arrayStrings(item?.evidenceRefs).filter(x=>x.startsWith("https://"));
  if(!name||!role||!mission||!evaluationPlan||!requiredData.length||!riskControls.length){rejected.push({name,reason:"proposal_schema_incomplete"});continue;}
  const id="agent-proposal-"+hash(name.toLowerCase()+"|"+role.toLowerCase()+"|"+JSON.stringify(scope));
  const prior=await get<any>("library/agent-proposals",id);
  const proposal={id,name,role,scope,mission,requiredData,evaluationPlan,riskControls,evidenceRefs,
   parentDepartment:clean(item?.parentDepartment,100)||"global_master",status:prior?.status||"pending_sandbox_review",
   sandboxApprovalStatus:prior?.sandboxApprovalStatus||"not_approved",productionEnabled:false,agentCreated:false,
   validationStatus:"candidate_only",version:Number(prior?.version||1),seenCount:Number(prior?.seenCount||0)+1,
   sourceRunIds:[...new Set([...(prior?.sourceRunIds||[]),runId])].slice(-20),
   createdAt:prior?.createdAt||new Date().toISOString(),lastProposedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const assessment=readiness(proposal,modelLabResearchPack);
  const evaluationId=id+"-"+hash(runId+"|"+new Date().toISOString());
  await put("library/agent-sandbox-evaluations",evaluationId,{id:evaluationId,proposalId:id,runId,proposalVersion:proposal.version,...assessment,createdAt:new Date().toISOString()});
  proposal.latestSandboxEvaluationId=evaluationId;proposal.sandboxReadiness=assessment.status;
  await put("library/agent-proposals",id,proposal);
  accepted.push({id,name,status:proposal.status,sandboxReadiness:assessment.status,blockers:assessment.blockers});
 }
 return {received:proposals.length,accepted:accepted.length,rejected,proposals:accepted,autoCreated:0,autoPromoted:0};
}
export async function getAgentEvolutionStatus(){
 const [proposals,evaluations]=await Promise.all([list<any>("library/agent-proposals",500),list<any>("library/agent-sandbox-evaluations",500)]);
 return {proposalCount:proposals.length,pendingReview:proposals.filter(x=>x.status==="pending_sandbox_review").length,readyForHumanSandboxApproval:proposals.filter(x=>x.sandboxReadiness==="ready_for_human_sandbox_approval").length,blocked:proposals.filter(x=>String(x.sandboxReadiness||"").startsWith("blocked")).length,sandboxEvaluations:evaluations.length,productionAgentsCreated:proposals.filter(x=>x.productionEnabled===true||x.agentCreated===true).length,recentProposals:proposals.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,20).map(x=>({id:x.id,name:x.name,role:x.role,scope:x.scope,status:x.status,sandboxReadiness:x.sandboxReadiness,latestSandboxEvaluationId:x.latestSandboxEvaluationId,productionEnabled:false,agentCreated:false,updatedAt:x.updatedAt}))};
}

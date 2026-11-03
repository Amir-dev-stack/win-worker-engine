import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";

const HF_QUERIES=["sports odds","football results","tennis match results","cricket dataset","basketball statistics","baseball results","ice hockey results"];
const GH_QUERIES=["sports data dataset","football results dataset","tennis match dataset","cricket ball by ball dataset","basketball baseball hockey dataset"];
const ua={"user-agent":"WIN-Public-Research-Discovery/1.0","accept":"application/vnd.github+json"};
const hash=(s:string)=>createHash("sha256").update(s).digest("hex").slice(0,32);
const clean=(v:any,n=1000)=>typeof v==="string"?v.trim().slice(0,n):"";
function inferSports(text:string){
 const s=text.toLowerCase(),out:string[]=[];
 const tests:[string,RegExp][]=[["football",/football|soccer|futsal|premier league|world cup/],["basketball",/basketball|nba|wnba/],["tennis",/tennis|atp|wta|challenger/],["baseball",/baseball|mlb|npb/],["ice_hockey",/ice hockey|nhl|hockey/],["american_football",/american football|nfl|ncaa football/],["cricket",/cricket|ipl|t20|odi/],["rugby",/rugby/],["volleyball",/volleyball/],["handball",/handball/],["golf",/golf/],["esports",/esports|dota|counter strike|league of legends/],["horse_racing",/horse racing|thoroughbred/]];
 for(const [sport,re] of tests)if(re.test(s))out.push(sport);
 return out;
}
function inferDomains(text:string){
 const s=text.toLowerCase(),out:string[]=[];
 for(const [name,re] of [["odds",/odds|betting|spread|moneyline|handicap/],["fixtures",/fixture|schedule|match list/],["results",/result|score|winner|settled/],["statistics",/statistic|stats|box score|player props|performance/],["player_events",/player|goal|scorer|card|assist/],["lineups",/lineup|roster|starting/],["injuries",/injury|injuries|availability/]] as [string,RegExp][])if(re.test(s))out.push(name);
 return out;
}
function licenseOf(item:any,sourceType:string){
 if(sourceType==="huggingface_dataset"){
  const tag=(item.tags||[]).find((x:any)=>String(x).startsWith("license:"));
  return clean(item.cardData?.license)||clean(tag?String(tag).slice(8):"")||"";
 }
 return clean(item.license?.spdx_id)||"";
}
function licenseStatus(license:string,sourceType:string){
 const l=license.toLowerCase();
 if(["cc0-1.0","cc-by-4.0"].includes(l))return "open_data_license_candidate";
 if(["cc-by-sa-4.0","odc-by-1.0","odbl-1.0"].includes(l))return "sharealike_or_database_review";
 if(["mit","apache-2.0","bsd-3-clause","bsd-2-clause"].includes(l))return "code_license_only_data_rights_unverified";
 return license?"license_review_required":"license_missing";
}
async function fetchJson(url:string,headers:any={}){
 const response=await fetch(url,{headers:{...ua,...headers},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error("HTTP_"+response.status+" "+url);
 return response.json();
}
export async function discoverPublicResearchSources(){
 const startedAt=new Date().toISOString(),found:any[]=[],failures:any[]=[];
 const hfResults=await Promise.all(HF_QUERIES.map(async query=>{
  try{return {query,items:await fetchJson("https://huggingface.co/api/datasets?search="+encodeURIComponent(query)+"&limit=10&sort=downloads&direction=-1")};}
  catch(e){failures.push({source:"huggingface",query,error:String(e).slice(0,300)});return {query,items:[]};}
 }));
 for(const b of hfResults)for(const item of (Array.isArray(b.items)?b.items:[]).slice(0,6)){
  const id=clean(item.id);if(!id)continue;
  const license=licenseOf(item,"huggingface_dataset"),description=clean(item.description||item.cardData?.description,1500),textBlob=id+" "+description+" "+(item.tags||[]).join(" ");
  found.push({sourceType:"huggingface_dataset",sourceId:id,name:id,sourceUrl:"https://huggingface.co/datasets/"+id,description,license,licenseStatus:licenseStatus(license,"huggingface_dataset"),downloads:Number(item.downloads||0),likes:Number(item.likes||0),lastModified:clean(item.lastModified),tags:(item.tags||[]).slice(0,40),sports:inferSports(textBlob),dataDomains:inferDomains(textBlob),query:b.query});
 }
 const ghResults=await Promise.all(GH_QUERIES.map(async query=>{
  try{return {query,data:await fetchJson("https://api.github.com/search/repositories?q="+encodeURIComponent(query)+"&sort=stars&order=desc&per_page=10")};}
  catch(e){failures.push({source:"github",query,error:String(e).slice(0,300)});return {query,data:{items:[]}};}
 }));
 for(const b of ghResults)for(const item of (b.data?.items||[]).slice(0,6)){
  const id=clean(item.full_name);if(!id)continue;
  const license=licenseOf(item,"github_repository"),description=clean(item.description,1500),textBlob=id+" "+description+" "+(item.topics||[]).join(" ");
  found.push({sourceType:"github_repository",sourceId:id,name:id,sourceUrl:clean(item.html_url)||"https://github.com/"+id,description,license,licenseStatus:licenseStatus(license,"github_repository"),stars:Number(item.stargazers_count||0),lastModified:clean(item.pushed_at),topics:(item.topics||[]).slice(0,40),sports:inferSports(textBlob),dataDomains:inferDomains(textBlob),query:b.query});
 }
 const existing=await list<any>("library/research-source-candidates",1000),byId=new Map(existing.map(x=>[x.id,x]));
 let newCount=0,seen=0;
 for(const candidate of found){
  const id=hash(candidate.sourceType+"|"+candidate.sourceId),prior=byId.get(id);
  const merged={...prior,...candidate,id,firstSeenAt:prior?.firstSeenAt||startedAt,lastSeenAt:startedAt,seenCount:Number(prior?.seenCount||0)+1,
   searchQueries:[...new Set([...(prior?.searchQueries||[]),candidate.query])].slice(-20),
   reviewStatus:prior?.reviewStatus||"review_required",automationAllowed:false,dataRightsVerified:false,
   reviewNote:prior?.reviewNote||"Metadata discovery only. Verify dataset-specific licence, provenance, schema, terms and redistribution rights before adapter work."};
  await put("library/research-source-candidates",id,merged);byId.set(id,merged);seen++;if(!prior)newCount++;
 }
 const summary={id:"source-discovery-"+startedAt.slice(0,10),status:failures.length?(seen?"partial":"failed"):"completed",startedAt,completedAt:new Date().toISOString(),queries:{huggingface:HF_QUERIES,github:GH_QUERIES},candidatesSeen:seen,newCandidates:newCount,totalKnownCandidates:byId.size,openLicenseCandidates:[...byId.values()].filter(x=>x.licenseStatus==="open_data_license_candidate").length,licenseUnknown:[...byId.values()].filter(x=>x.licenseStatus==="license_missing").length,failures,automationEnabled:false,aiCalls:0};
 await put("library/research-source-discovery-runs",summary.id,summary);
 await put("scheduler-state","public-source-discovery",{lastCheck:summary.completedAt,status:summary.status,candidatesSeen:seen,newCandidates:newCount,totalKnownCandidates:byId.size,failures:failures.length});
 return summary;
}
export async function getPublicResearchSourceDiscoveryStatus(){
 const [state,candidates,runs]=await Promise.all([get<any>("scheduler-state","public-source-discovery"),list<any>("library/research-source-candidates",1000),list<any>("library/research-source-discovery-runs",20)]);
 const latest=runs.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0]||null;
 return {status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,totalCandidates:candidates.length,openLicenseCandidates:candidates.filter(x=>x.licenseStatus==="open_data_license_candidate").length,reviewRequired:candidates.filter(x=>x.reviewStatus==="review_required").length,approvedForAdapterReview:candidates.filter(x=>x.reviewStatus==="approved_for_adapter_review").length,rejected:candidates.filter(x=>x.reviewStatus==="rejected").length,latestRun:latest,topCandidates:candidates.sort((a,b)=>Number(b.downloads||b.stars||0)-Number(a.downloads||a.stars||0)).slice(0,25).map(x=>({id:x.id,name:x.name,sourceType:x.sourceType,sourceUrl:x.sourceUrl,license:x.license,licenseStatus:x.licenseStatus,sports:x.sports,dataDomains:x.dataDomains,downloads:x.downloads,stars:x.stars,reviewStatus:x.reviewStatus,lastSeenAt:x.lastSeenAt}))};
}

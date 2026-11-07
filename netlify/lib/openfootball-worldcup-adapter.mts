import { createHash, randomUUID } from "node:crypto";
import { get, put, list } from "./store.mts";
import { assertProviderImportAllowed } from "./data-provider-registry.mts";

const YEARS=[1930,1934,1938,1950,1954,1958,1962,1966,1970,1974,1978,1982,1986,1990,1994,1998,2002,2006,2010,2014,2018,2022,2026];
const PATHS=[
 ...YEARS.map(year=>({year,file:[1990,1994,1998,2002,2006,2010,2014,2018,2022,2026].includes(year)?"worldcup-full.json":"worldcup.json",competition:"FIFA World Cup"})),
 {year:2025,file:"clubworldcup.json",competition:"FIFA Club World Cup"}
] as const;
const RAW_BASE="https://raw.githubusercontent.com/openfootball/worldcup.json";
const GITHUB_API="https://api.github.com/repos/openfootball/worldcup.json";
export function isPinnedOpenFootballWorldCupRevision(value:unknown):value is string{return typeof value==="string"&&/^[a-f0-9]{40}$/i.test(value);}
export function buildOpenFootballWorldCupSyncRunId(startedAt:string,sourceRevision:string){
 if(!Number.isFinite(Date.parse(startedAt))||!isPinnedOpenFootballWorldCupRevision(sourceRevision))throw Error("worldcup_sync_run_identity_invalid");
 return "openfootball-worldcup-sync-"+Date.parse(startedAt).toString(36)+"-"+sourceRevision.slice(0,12).toLowerCase()+"-"+randomUUID();
}

const UPSTREAM_TIMEOUT_MS=12_000;
const MAX_REVISION_RESPONSE_BYTES=256_000;
const MAX_DATASET_RESPONSE_BYTES=4_000_000;

export async function readBoundedWorldCupResponse(response:Response,maxBytes=MAX_DATASET_RESPONSE_BYTES):Promise<string>{
 const declared=Number(response.headers.get("content-length"));
 if(Number.isFinite(declared)&&declared>maxBytes)throw Error("worldcup_dataset_over_limit");
 if(!response.body)throw Error("worldcup_response_body_missing");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];
 let total=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   total+=part.value.byteLength;
   if(total>maxBytes){await reader.cancel();throw Error("worldcup_dataset_over_limit");}
   chunks.push(part.value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
 catch{throw Error("worldcup_response_invalid_utf8");}
}
const validScore=(v:any)=>Array.isArray(v)&&v.length===2&&v.every((n:any)=>Number.isInteger(n)&&n>=0&&n<=30);
const arr=(v:any)=>Array.isArray(v)?v:[];
function scorerEvents(match:any){
 const out:any[]=[];
 for(const [side,team] of [[1,match.team1],[2,match.team2]] as any[]){
  const goals=arr(match["goals"+side]);
  for(const g of goals){if(typeof g?.name==="string")out.push({player:g.name,team,side,minute:String(g.minute??""),penalty:Boolean(g.penalty),ownGoal:Boolean(g.owngoal||g.ownGoal),eventType:"goal"});}
 }
 return out;
}
function lineupEvents(match:any){
 const sides=arr(match.lineup);
 const players:any[]=[],substitutions:any[]=[];
 sides.forEach((side:any,index:number)=>{
  const team=index===0?match.team1:match.team2;
  for(const p of arr(side?.starter))if(typeof p?.name==="string")players.push({player:p.name,team,side:index===0?1:2,role:"starter",captain:Boolean(p.captain)});
  for(const p of arr(side?.bench))if(typeof p?.name==="string")players.push({player:p.name,team,side:index===0?1:2,role:"bench",captain:Boolean(p.captain)});
  for(const sub of arr(side?.subs))if(sub&&typeof sub.on==="string"&&typeof sub.off==="string")substitutions.push({team,side:index===0?1:2,on:sub.on,off:sub.off,minute:String(sub.minute??"")});
 });
 return {players,substitutions};
}
function bookingEvents(match:any){
 const out:any[]=[];arr(match.bookings).forEach((side:any,index:number)=>arr(side).forEach((b:any)=>{if(typeof b?.name==="string")out.push({player:b.name,team:index===0?match.team1:match.team2,side:index===0?1:2,cardType:String(b.type||"unknown"),minute:String(b.minute??"")});}));
 return out;
}
async function syncOne(path:typeof PATHS[number],sourceRevision:string){
 const url=RAW_BASE+"/"+sourceRevision+"/"+path.year+"/"+path.file;
 const response=await fetch(url,{headers:{"user-agent":"WIN-ResearchEngine/1.0"},signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)});
 if(!response.ok)throw Error("worldcup_dataset_http_"+response.status);
 const raw=await readBoundedWorldCupResponse(response);
 const parsed=JSON.parse(raw),matches=arr(parsed.matches);
 if(!matches.length)throw Error("worldcup_dataset_has_no_matches");
 const records=matches.flatMap((m:any,index:number)=>{
  const date=String(m.date||""),home=String(m.team1||"").trim(),away=String(m.team2||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!home||!away)return[];
  const ft=validScore(m.score?.ft)?m.score.ft:null,ht=validScore(m.score?.ht)?m.score.ht:null;
  const id=createHash("sha256").update([path.year,path.file,date,home,away,index].join("|")).digest("hex").slice(0,32);
  const playerLineup=lineupEvents(m),goals=scorerEvents(m),bookings=bookingEvents(m);
  return [{id,eventId:id,sport:"football",season:String(path.year),competition:parsed.name||path.competition,competitionFile:path.file,
   event:home+" vs "+away,homeTeam:home,awayTeam:away,eventStart:date,eventTimeRaw:m.time||null,eventTimePrecision:m.time?"local_time_without_timezone":"date_only",resultAvailableAt:null,trainingEligible:false,
   round:m.round||null,group:m.group||null,venue:m.ground||null,attendance:Number.isFinite(Number(m.attendance))?Number(m.attendance):null,
   fullTimeScore:ft,halfTimeScore:ht,extraTimeScore:validScore(m.score?.et)?m.score.et:null,penaltyShootoutScore:validScore(m.score?.p)?m.score.p:null,
   resultBasis:"regulation_90min",status:ft?"completed":"scheduled_or_unscored",
   playerEvents:{goals,lineup:playerLineup.players,substitutions:playerLineup.substitutions,bookings,goalsAvailable:Array.isArray(m.goals1)&&Array.isArray(m.goals2),bookingsAvailable:Array.isArray(m.bookings),lineupAvailable:Array.isArray(m.lineup)},
   referee:m.referee||m.referees||null,sourceProvider:"openfootball-worldcup-json",sourceUrl:url,
   retrievedAt:new Date().toISOString(),sourceLicence:"CC0-1.0",origin:"provider_historical_data"}];
 });
 const checksum=createHash("sha256").update(raw).digest("hex");
 const datasetId="openfootball-worldcup-"+path.year+"-"+path.file.replace(/\.json$/,"");
 const playerEventRows=records.flatMap((m:any)=>[
  ...m.playerEvents.goals.map((e:any)=>({...e,eventId:m.id,eventStart:m.eventStart,competition:m.competition,sourceUrl:url,sourceLicence:"CC0-1.0",origin:"provider_historical_data"})),
  ...m.playerEvents.bookings.map((e:any)=>({...e,eventId:m.id,eventStart:m.eventStart,competition:m.competition,sourceUrl:url,sourceLicence:"CC0-1.0",origin:"provider_historical_data"})),
  ...m.playerEvents.lineup.map((e:any)=>({...e,eventId:m.id,eventStart:m.eventStart,competition:m.competition,sourceUrl:url,sourceLicence:"CC0-1.0",origin:"provider_historical_data"}))
 ]);
 await put("library/model-lab/historical-event-datasets",datasetId,{
  id:datasetId,providerId:"openfootball-worldcup-json",sourceRevision,sourceCommitUrl:"https://github.com/openfootball/worldcup.json/commit/"+sourceRevision,sport:"football",season:String(path.year),competition:parsed.name||path.competition,
  sourceUrl:url,sourceRevision,sourceCommitUrl:"https://github.com/openfootball/worldcup.json/commit/"+sourceRevision,sourceLicence:"CC0-1.0",licenceReference:"https://creativecommons.org/publicdomain/zero/1.0/",
  retrievedAt:new Date().toISOString(),rawChecksum:checksum,totalRows:records.length,scoredRows:records.filter(x=>x.fullTimeScore).length,
  playerEventRows:playerEventRows.length,records,origin:"provider_historical_data",lab:"model-lab",
  attribution:"OpenFootball worldcup.json — public-domain data (CC0-1.0)."
 });
 await put("library/model-lab/player-event-datasets",datasetId,{id:datasetId,providerId:"openfootball-worldcup-json",sourceRevision,sourceCommitUrl:"https://github.com/openfootball/worldcup.json/commit/"+sourceRevision,sport:"football",season:String(path.year),competition:parsed.name||path.competition,sourceUrl:url,sourceLicence:"CC0-1.0",licenceReference:"https://github.com/openfootball/worldcup.json/blob/"+sourceRevision+"/LICENSE.md",attribution:"OpenFootball worldcup.json — CC0 1.0.",rawChecksum:checksum,totalRows:playerEventRows.length,records:playerEventRows,origin:"provider_historical_data",lab:"model-lab"});
 return {datasetId,year:path.year,competition:parsed.name||path.competition,matches:records.length,scored:records.filter(x=>x.fullTimeScore).length,playerEvents:playerEventRows.length,checksum};
}
export async function syncOpenFootballWorldCupData(){
 assertProviderImportAllowed("openfootball-worldcup-json",["fixtures","results","player_events"]);
 const startedAt=new Date().toISOString();
 const revisionResponse=await fetch(GITHUB_API+"/commits/master",{headers:{"user-agent":"WIN-ResearchEngine/1.0","accept":"application/vnd.github+json"},signal:AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)});
 if(!revisionResponse.ok)throw Error("worldcup_revision_http_"+revisionResponse.status);
 const revisionPayload:any=JSON.parse(await readBoundedWorldCupResponse(revisionResponse,MAX_REVISION_RESPONSE_BYTES));
 const sourceRevision=revisionPayload?.sha;
 if(!isPinnedOpenFootballWorldCupRevision(sourceRevision))throw Error("worldcup_source_revision_not_pinned");
 const previous=await get<any>("scheduler-state","openfootball-worldcup-daily-sync");
 if(previous?.sourceRevision===sourceRevision&&previous?.status==="completed"){
  const completedAt=new Date().toISOString();
  const unchanged={id:buildOpenFootballWorldCupSyncRunId(startedAt,sourceRevision),startedAt,completedAt,status:"unchanged",sourceRevision,sourceCommitUrl:"https://github.com/openfootball/worldcup.json/commit/"+sourceRevision,datasetsImported:0,datasetsUnchanged:PATHS.length,matchesImported:Number(previous.matchesImported||0),scoredMatches:Number(previous.scoredMatches||0),playerEventsImported:Number(previous.playerEventsImported||0),results:[],failures:[],reusedExistingSnapshot:true,origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false};
  await put("library/model-lab/provider-sync-runs",unchanged.id,unchanged);
  await put("scheduler-state","openfootball-worldcup-daily-sync",{...previous,lastCheck:completedAt,status:"unchanged",sourceRevision});
  return unchanged;
 }
 const results:any[]=[],failures:any[]=[];
 // Four concurrent downloads keep the daily job bounded and avoid a request burst.
 for(let i=0;i<PATHS.length;i+=4){
  const batch=await Promise.all(PATHS.slice(i,i+4).map(async path=>{try{return {ok:true,value:await syncOne(path,sourceRevision)};}catch(e){return {ok:false,path:path.year+"/"+path.file,error:String(e).slice(0,350)};}}));
  for(const item of batch){if(item.ok)results.push(item.value);else failures.push(item);}
 }
 const summary={id:buildOpenFootballWorldCupSyncRunId(startedAt,sourceRevision),startedAt,completedAt:new Date().toISOString(),sourceRevision,sourceCommitUrl:"https://github.com/openfootball/worldcup.json/commit/"+sourceRevision,status:results.length===PATHS.length?"completed":results.length?"partial":"failed",datasetsImported:results.length,matchesImported:results.reduce((n,x)=>n+x.matches,0),scoredMatches:results.reduce((n,x)=>n+x.scored,0),playerEventsImported:results.reduce((n,x)=>n+x.playerEvents,0),results,failures,origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false};
 await put("library/model-lab/provider-sync-runs",summary.id,summary);
 await put("scheduler-state","openfootball-worldcup-daily-sync",{lastCheck:summary.completedAt,status:summary.status,sourceRevision,sourceCommitUrl:summary.sourceCommitUrl,datasetsImported:summary.datasetsImported,matchesImported:summary.matchesImported,scoredMatches:summary.scoredMatches,playerEventsImported:summary.playerEventsImported,failures:failures.length});
 return summary;
}
export async function getOpenFootballWorldCupSyncStatus(){
 const state=await get<any>("scheduler-state","openfootball-worldcup-daily-sync");
 const datasets=await list<any>("library/model-lab/historical-event-datasets",25);
 const tournament=datasets.filter(d=>d.providerId==="openfootball-worldcup-json");
 return {sampled:true,status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,totals:state||null,datasetCount:tournament.length,matchCount:tournament.reduce((n,d)=>n+Number(d.totalRows||0),0),scoredMatches:tournament.reduce((n,d)=>n+Number(d.scoredRows||0),0),playerEventCount:tournament.reduce((n,d)=>n+Number(d.playerEventRows||0),0)};
}

import { get, put } from "./store.mts";

type Pick = { id:string; eventId:string; event:string; sport:string; competition?:string; market:string; pick:string; odds:number; result:"won"|"lost"|"void"; eventStart:string; oddsCapturedAt:string; oddsSource:string; resultSource:string };
const clean=(v:unknown,n=500)=>typeof v==="string"?v.trim().slice(0,n):"";
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
function random(seed:number){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function validate(raw:any[]):Pick[]{
 if(!Array.isArray(raw)||raw.length<2||raw.length>10000)throw Error("Provide 2–10,000 historical settled selections.");
 const ids=new Set<string>();
 return raw.map((x,i)=>{const p:Pick={id:clean(x?.id)||"pick-"+i,eventId:clean(x?.eventId),event:clean(x?.event),sport:clean(x?.sport),competition:clean(x?.competition)||undefined,market:clean(x?.market),pick:clean(x?.pick),odds:Number(x?.odds),result:x?.result,eventStart:clean(x?.eventStart),oddsCapturedAt:clean(x?.oddsCapturedAt),oddsSource:clean(x?.oddsSource),resultSource:clean(x?.resultSource)};
 if(!p.eventId||!p.event||!p.sport||!p.market||!p.pick||!Number.isFinite(p.odds)||p.odds<=1||!["won","lost","void"].includes(p.result)||!p.eventStart||!p.oddsCapturedAt||!p.oddsSource||!p.resultSource)throw Error("Selection "+(i+1)+" is missing required historical odds, result or provenance fields.");
 const start=Date.parse(p.eventStart),captured=Date.parse(p.oddsCapturedAt);if(!Number.isFinite(start)||!Number.isFinite(captured)||captured>=start)throw Error("Odds timestamp must precede event start for "+p.id+".");
 if(ids.has(p.id))throw Error("Duplicate selection id: "+p.id);ids.add(p.id);return p;});
}
export async function createSimulationRun(input:any){
 const picks=validate(input?.selections),count=Math.min(100000,Math.max(100,Math.floor(Number(input?.couponCount)||1000)));
 const minLegs=Math.min(50,Math.max(2,Math.floor(Number(input?.minLegs)||2))),maxLegs=Math.min(50,Math.max(minLegs,Math.floor(Number(input?.maxLegs)||5)));
 const uniqueEvents=new Set(picks.map(p=>p.eventId)).size;if(uniqueEvents<maxLegs)throw Error("Dataset has "+uniqueEvents+" distinct events; at least "+maxLegs+" are required.");
 const id=crypto.randomUUID(),datasetId="dataset-"+id,createdAt=new Date().toISOString();
 const sportSet=[...new Set(picks.map(p=>p.sport))];const mixedSportOnly=input?.couponType==="mixed_sport"||input?.mixedSportOnly===true;if(mixedSportOnly&&sportSet.length<2)throw Error("Mixed-sport mode requires settled selections from at least two sports.");const run={id,datasetId,status:"queued",createdAt,updatedAt:createdAt,mode:"historical_random_coupon_combinations",couponType:mixedSportOnly?"mixed_sport_multi_event":"multi_event_accumulator",mixedSportOnly,sportScope:sportSet.length>1?"mixed_sport":sportSet[0]||"unknown",sports:sportSet,mixedSportEnabled:sportSet.length>1,couponCount:count,minLegs,maxLegs,seed:clean(input?.seed)||id,selectionCount:picks.length,dataQuality:{uniqueEvents,uniqueSports:sportSet.length,allOddsPreEvent:true,allResultsSettled:true},sourceDisclosure:"Supplied historical odds and settled results only. This is descriptive coupon-construction analysis, not proof of predictive edge."};
 await put("library/simulation-datasets",datasetId,{id:datasetId,runId:id,selections:picks,createdAt});await put("library/simulation-runs",id,run);return run;
}
export async function executeSimulationRun(id:string){
 const run=await get<any>("library/simulation-runs",id);if(!run)throw Error("Simulation run not found");if(run.status==="completed")return run;
 const data=await get<any>("library/simulation-datasets",run.datasetId);if(!data)throw Error("Historical dataset missing");
 const picks=validate(data.selections),groups=new Map<string,Pick[]>();for(const p of picks){const a=groups.get(p.eventId)||[];a.push(p);groups.set(p.eventId,a);}const events=[...groups.values()];
 if(events.length<run.maxLegs)throw Error("Not enough distinct events for the requested maximum coupon legs.");
 const rand=random(hash(run.seed)),wins:any[]=[],losses:any[]=[],other:any[]=[];let batch=0,won=0,lost=0,voided=0,returns=0;
 const stats=new Map<string,{appearances:number;losses:number;lostLegsInLosingCoupons:number}>();const bySport:Record<string,{selections:number;won:number;lost:number;voided:number}>={};let mixedSportCouponCount=0;const byLegCount:Record<string,{coupons:number;won:number;lost:number;voided:number}>={};
 const flush=async()=>{for(const [kind,arr] of [["winning",wins],["losing",losses],["other",other]] as const){if(arr.length)await put("library/simulation-"+kind+"-coupons",id+"-"+batch,{id:id+"-"+batch,runId:id,records:arr.splice(0)});}batch++;};
 await put("library/simulation-runs",id,{...run,status:"running",startedAt:new Date().toISOString()});
 for(let n=0;n<run.couponCount;n++){
  const legCount=run.minLegs+Math.floor(rand()*(run.maxLegs-run.minLegs+1)),pool=events.slice(),chosen:Pick[]=[];
  if(run.mixedSportOnly){
   const sportGroups=new Map<string,Pick[][]>();for(const group of pool){const sport=group[0]?.sport||"unknown";const list=sportGroups.get(sport)||[];list.push(group);sportGroups.set(sport,list);}
   const available=[...sportGroups.entries()].filter(([,groups])=>groups.length>0);
   if(available.length<2)throw Error("Mixed-sport simulation requires at least two sports with distinct events.");
   const firstIndex=Math.floor(rand()*available.length),first=available.splice(firstIndex,1)[0];
   const secondIndex=Math.floor(rand()*available.length),second=available.splice(secondIndex,1)[0];
   for(const [,groups] of [first,second]){const ix=Math.floor(rand()*groups.length),group=groups[ix];pool.splice(pool.indexOf(group),1);chosen.push(group[Math.floor(rand()*group.length)]);}
  }
  while(chosen.length<legCount){const ix=Math.floor(rand()*pool.length),group=pool.splice(ix,1)[0];chosen.push(group[Math.floor(rand()*group.length)]);}
  const active=chosen.filter(p=>p.result!=="void"),couponSports=[...new Set(chosen.map(p=>p.sport))],outcome=active.length===0?"void":active.some(p=>p.result==="lost")?"lost":"won";
  const odds=active.reduce((v,p)=>v*p.odds,1),legKey=String(legCount),legStats=byLegCount[legKey]||(byLegCount[legKey]={coupons:0,won:0,lost:0,voided:0}),record={id:id+"-coupon-"+(n+1),runId:id,recordType:"simulation_coupon",origin:"simulation",couponType:couponSports.length>1?"mixed_sport_multi_event":"single_sport_multi_event",sports:couponSports,isMixedSport:couponSports.length>1,outcome,combinedOdds:Number(odds.toFixed(5)),legCount,selections:chosen,createdAt:new Date().toISOString()};
  if(couponSports.length>1)mixedSportCouponCount++;for(const p of chosen){const ss=bySport[p.sport]||(bySport[p.sport]={selections:0,won:0,lost:0,voided:0});ss.selections++;if(p.result==="won")ss.won++;else if(p.result==="lost")ss.lost++;else ss.voided++;}legStats.coupons++;if(outcome==="won")legStats.won++;else if(outcome==="lost")legStats.lost++;else legStats.voided++;
  for(const p of chosen){const s=stats.get(p.id)||{appearances:0,losses:0,lostLegsInLosingCoupons:0};s.appearances++;if(p.result==="lost"){s.losses++;if(outcome==="lost")s.lostLegsInLosingCoupons++;}stats.set(p.id,s);}
  if(outcome==="won"){won++;returns+=odds;wins.push(record);}else if(outcome==="lost"){lost++;losses.push(record);}else{voided++;returns+=1;other.push(record);}
  if((n+1)%500===0)await flush();
 }await flush();
 const worst=[...stats.entries()].map(([selectionId,s])=>({selectionId,...s,lossRate:Number((s.losses/Math.max(1,s.appearances)).toFixed(4))})).sort((a,b)=>b.lostLegsInLosingCoupons-a.lostLegsInLosingCoupons).slice(0,25);
 const summary={couponCount:run.couponCount,won,lost,voided,mixedSportCouponCount,bySport,winRate:Number((won/Math.max(1,run.couponCount-voided)).toFixed(4)),flatStakeRoi:Number(((returns-run.couponCount)/run.couponCount).toFixed(4)),flatStakeReturnUnits:Number(returns.toFixed(3)),mostFrequentLosingSelections:worst,performanceByLegCount:byLegCount,caveat:"Random combinations reuse historical picks and known outcomes. This does not test pre-match predictive skill or establish future profitability."};
 const finished={...run,status:"completed",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary,batchCount:batch};
 await put("library/simulation-runs",id,finished);await put("library/simulation-lessons",id,{id,recordType:"simulation_analysis",runId:id,validationStatus:"candidate_for_validation",sampleSize:run.couponCount,summary,createdAt:finished.completedAt});return finished;
}


type BetBuilderCandidate = {
 id:string; eventId:string; event:string; sport:string; competition?:string;
 legs:Array<{market:string;pick:string;line?:string;period?:string}>;
 combinedOdds:number; result:"won"|"lost"|"void"; eventStart:string;
 oddsCapturedAt:string; oddsSource:string; resultSource:string;
};
function validateBetBuilderCandidates(raw:any[]):BetBuilderCandidate[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>10000)throw Error("Provide 1–10,000 historically offered Bet Builder combinations.");
 const ids=new Set<string>();
 return raw.map((x:any,i:number)=>{
  const legs=Array.isArray(x?.legs)?x.legs.slice(0,20).map((leg:any)=>({market:clean(leg?.market),pick:clean(leg?.pick),line:clean(leg?.line)||undefined,period:clean(leg?.period)||undefined})):[];
  const item:BetBuilderCandidate={id:clean(x?.id)||"builder-"+i,eventId:clean(x?.eventId),event:clean(x?.event),sport:clean(x?.sport),competition:clean(x?.competition)||undefined,legs,combinedOdds:Number(x?.combinedOdds),result:x?.result,eventStart:clean(x?.eventStart),oddsCapturedAt:clean(x?.oddsCapturedAt),oddsSource:clean(x?.oddsSource),resultSource:clean(x?.resultSource)};
  if(!item.eventId||!item.event||!item.sport||item.legs.length<2||item.legs.some(l=>!l.market||!l.pick)||!Number.isFinite(item.combinedOdds)||item.combinedOdds<=1||!["won","lost","void"].includes(item.result)||!item.eventStart||!item.oddsCapturedAt||!item.oddsSource||!item.resultSource)throw Error("Bet Builder combination "+(i+1)+" is missing legs, a real combined price, settlement or provenance.");
  const start=Date.parse(item.eventStart),captured=Date.parse(item.oddsCapturedAt);if(!Number.isFinite(start)||!Number.isFinite(captured)||captured>=start)throw Error("Bet Builder odds must be captured before the event starts for "+item.id+".");
  if(ids.has(item.id))throw Error("Duplicate Bet Builder combination id: "+item.id);ids.add(item.id);return item;
 });
}
export async function createBetBuilderSimulationRun(input:any){
 const combinations=validateBetBuilderCandidates(input?.combinations);
 const id=crypto.randomUUID(),datasetId="builder-dataset-"+id,createdAt=new Date().toISOString();
 const sports=[...new Set(combinations.map(x=>x.sport))];
 const run={id,datasetId,status:"queued",createdAt,updatedAt:createdAt,runType:"bet_builder",mode:"historical_same_event_bet_builder_audit",couponType:"single_event_bet_builder",couponCount:combinations.length,selectionCount:combinations.reduce((n,x)=>n+x.legs.length,0),sports,sportScope:sports.length>1?"multi_sport_builder_audit":sports[0]||"unknown",dataQuality:{allCombinedPricesObserved:true,allOddsPreEvent:true,allResultsSettled:true,uniqueEvents:new Set(combinations.map(x=>x.eventId)).size},sourceDisclosure:"Audits only historically offered same-event combinations with bookmaker-observed combined prices and evidenced settlements. It does not invent correlated prices or imply future predictive edge."};
 await put("library/simulation-datasets",datasetId,{id:datasetId,runId:id,combinations,createdAt});
 await put("library/simulation-runs",id,run);return run;
}
export async function executeBetBuilderSimulationRun(id:string){
 const run=await get<any>("library/simulation-runs",id);if(!run)throw Error("Bet Builder simulation run not found");if(run.status==="completed")return run;
 const data=await get<any>("library/simulation-datasets",run.datasetId);if(!data)throw Error("Bet Builder dataset missing");
 const combinations=validateBetBuilderCandidates(data.combinations);
 const wins:any[]=[],losses:any[]=[],other:any[]=[];let returns=0,won=0,lost=0,voided=0;
 const bySport:Record<string,{combinations:number;won:number;lost:number;voided:number}>={};
 const byMarket:Record<string,{combinations:number;won:number;lost:number;voided:number}>={};
 for(const combo of combinations){
  const record={id:run.id+"-"+combo.id,runId:run.id,recordType:"simulation_coupon",origin:"simulation",couponType:"single_event_bet_builder",eventId:combo.eventId,event:combo.event,sport:combo.sport,competition:combo.competition||null,legs:combo.legs,legCount:combo.legs.length,combinedOdds:combo.combinedOdds,outcome:combo.result,oddsSource:combo.oddsSource,resultSource:combo.resultSource,oddsCapturedAt:combo.oddsCapturedAt,eventStart:combo.eventStart,createdAt:new Date().toISOString()};
  const sport=bySport[combo.sport]||(bySport[combo.sport]={combinations:0,won:0,lost:0,voided:0});sport.combinations++;
  if(combo.result==="won"){won++;returns+=combo.combinedOdds;sport.won++;wins.push(record);}
  else if(combo.result==="lost"){lost++;sport.lost++;losses.push(record);}
  else{voided++;returns+=1;sport.voided++;other.push(record);}
  for(const leg of combo.legs){const key=leg.market;const m=byMarket[key]||(byMarket[key]={combinations:0,won:0,lost:0,voided:0});m.combinations++;if(combo.result==="won")m.won++;else if(combo.result==="lost")m.lost++;else m.voided++;}
 }
 let batch=0;
 for(let offset=0;offset<Math.max(wins.length,losses.length,other.length);offset+=500){
  const batchId=run.id+"-"+batch++;
  const winBatch=wins.slice(offset,offset+500),lossBatch=losses.slice(offset,offset+500),otherBatch=other.slice(offset,offset+500);
  if(winBatch.length)await put("library/simulation-winning-coupons",batchId,{id:batchId,runId:run.id,records:winBatch});
  if(lossBatch.length)await put("library/simulation-losing-coupons",batchId,{id:batchId,runId:run.id,records:lossBatch});
  if(otherBatch.length)await put("library/simulation-other-coupons",batchId,{id:batchId,runId:run.id,records:otherBatch});
 }
 const summary={couponCount:combinations.length,won,lost,voided,hitRate:Number((won/Math.max(1,won+lost)).toFixed(4)),flatStakeRoi:Number(((returns-combinations.length)/Math.max(1,combinations.length)).toFixed(4)),flatStakeReturnUnits:Number(returns.toFixed(3)),bySport,byMarket,caveat:"Descriptive historical audit of observed Bet Builder combinations. It is not an out-of-sample forecast test and does not establish a future edge."};
 const finished={...run,status:"completed",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary,batchCount:batch};
 await put("library/simulation-runs",id,finished);
 await put("library/simulation-lessons",id,{id:run.id,recordType:"bet_builder_simulation_analysis",runId:id,validationStatus:"candidate_for_validation",sampleSize:combinations.length,summary,createdAt:finished.completedAt});
 return finished;
}

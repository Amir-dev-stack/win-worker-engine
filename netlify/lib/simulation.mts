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

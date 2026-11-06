import { list, get, putIfNew } from "./store.mts";
import { hashWinMLProvenance } from "./ml-provenance.mts";

type Observation={id:string;sport:string;eventStart:string;homeTeam:string;awayTeam:string;closing:any;settlements:any;homeScore:number|null;awayScore:number|null;providerId:string;};
type Trial={p:number;y:number;};
type MultiTrial={p:number[];y:number};
const MINIMUM_MARKET_SAMPLE=30;
const clamp=(p:number)=>Math.max(1e-6,Math.min(1-1e-6,p));
function validProb(x:any):x is number{return typeof x==="number"&&Number.isFinite(x)&&x>0&&x<1;}
function validThreeWay(p:number[]){return p.length===3&&p.every(validProb)&&p.reduce((s,x)=>s+x,0)>0;}
function binaryMetrics(trials:Trial[]){
 const n=trials.length;if(!n)return null;
 let brier=0,logLoss=0,correct=0;
 const bins=Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,count:0,meanProbability:0,observedRate:0}));
 for(const t of trials){const p=clamp(t.p);brier+=(p-t.y)**2;logLoss-=t.y*Math.log(p)+(1-t.y)*Math.log(1-p);if((p>=.5)===(t.y===1))correct++;
  const idx=Math.min(9,Math.floor(p*10));bins[idx].count++;bins[idx].meanProbability+=p;bins[idx].observedRate+=t.y;
 }
 return {count:n,brier:brier/n,logLoss:logLoss/n,accuracy:correct/n,calibrationBins:bins.filter(b=>b.count).map(b=>({...b,meanProbability:b.meanProbability/b.count,observedRate:b.observedRate/b.count}))};
}
function multiclassMetrics(input:MultiTrial[]){
 const trials=input.filter(t=>Number.isInteger(t.y)&&t.y>=0&&t.y<3&&validThreeWay(t.p));
 const n=trials.length;if(!n)return null;let brier=0,logLoss=0,correct=0;
 for(const t of trials){const sum=t.p.reduce((s,p)=>s+p,0);const probs=t.p.map(p=>p/sum);
  brier+=probs.reduce((s,p,i)=>s+(p-(i===t.y?1:0))**2,0);
  logLoss-=Math.log(clamp(probs[t.y]));
  if(probs.indexOf(Math.max(...probs))===t.y)correct++;
 }
 return {count:n,brier:brier/n,logLoss:logLoss/n,accuracy:correct/n};
}
function binaryMarket(name:string,rows:Observation[],getP:(r:Observation)=>any,getY:(r:Observation)=>any){
 const all=rows.map(r=>({p:getP(r),y:getY(r),date:r.eventStart})).filter(x=>validProb(x.p)&&(x.y===0||x.y===1)).sort((a,b)=>a.date.localeCompare(b.date));
 if(all.length<MINIMUM_MARKET_SAMPLE)return {market:name,status:"insufficient_sample",observations:all.length,minimum:MINIMUM_MARKET_SAMPLE};
 const cut=Math.floor(all.length*.7),train=all.slice(0,cut),test=all.slice(cut);
 return {market:name,status:"evaluated",observations:all.length,trainingCount:train.length,testCount:test.length,trainingPeriod:{from:train[0].date,to:train.at(-1)?.date},testPeriod:{from:test[0].date,to:test.at(-1)?.date},testMetrics:binaryMetrics(test)};
}
function seededRandom(seed:string){
 let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
 let a=h>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
function resolveThreeWayWinner(r:Observation){
 const s=r.settlements||{};
 if(s.moneylineWinner==="home")return 0;
 if(s.moneylineWinner==="draw")return 1;
 if(s.moneylineWinner==="away")return 2;
 if(s.moneylineWinner==="push")return -1;
 if(Number.isFinite(r.homeScore)&&Number.isFinite(r.awayScore))return r.homeScore>r.awayScore?0:r.homeScore===r.awayScore?1:2;
 return -1;
}
function resolveTwoWayWinner(r:Observation){
 const s=String(r.settlements?.moneylineWinner||"").toLowerCase();
 if(["home","player1","participant1","1"].includes(s))return 0;
 if(["away","player2","participant2","2"].includes(s))return 1;
 if(["draw","push","void","retired","walkover"].includes(s))return -1;
 if(Number.isFinite(r.homeScore)&&Number.isFinite(r.awayScore)){
  return r.homeScore===r.awayScore?-1:r.homeScore>r.awayScore?0:1;
 }
 return -1;
}
function validBinaryVector(home:any,away:any):number[]|null{
 const p=[Number(home),Number(away)];
 return p.every(validProb)&&p.reduce((sum,x)=>sum+x,0)>0?p:null;
}
export function evaluateSameSlateFavouritePairs(input:Array<{eventId:string;eventStart:string;p:number;won:boolean}>){
 const MIN_PAIRS=100,MAX_PAIRS=100_000;
 const seen=new Set<string>(),groups=new Map<string,Array<{eventId:string;p:number;won:boolean}>>();
 for(const item of Array.isArray(input)?input:[]){
  const eventId=typeof item?.eventId==="string"?item.eventId.trim():"";
  const day=typeof item?.eventStart==="string"?item.eventStart.slice(0,10):"";
  if(!eventId||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!validProb(item.p)||typeof item.won!=="boolean"||seen.has(eventId))continue;
  seen.add(eventId);
  const group=groups.get(day)||[];
  group.push({eventId,p:item.p,won:item.won});
  groups.set(day,group);
 }
 let pairCount=0,predictedTotal=0,observedTotal=0,slateCount=0;
 for(const group of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,items])=>items)){
  if(group.length<2)continue;
  group.sort((a,b)=>a.eventId.localeCompare(b.eventId));
  const pairs=group.length*(group.length-1)/2;
  if(pairCount+pairs>MAX_PAIRS)return {status:"sample_cap_exceeded",method:"same_utc_calendar_day_distinct_event_favourite_pairs_v1",pairCount:0,slateCount:0,minimumPairs:MIN_PAIRS,maximumPairs:MAX_PAIRS,meanPredictedJointHitProbability:null,realizedJointHitRate:null,calibrationGap:null,jointModelQualificationAllowed:false,couponQualificationAllowed:false,productionUseAllowed:false,limitations:["Pair sample exceeded the fixed computation cap; no partial metrics are reported."]};
  slateCount++;
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
   pairCount++;
   predictedTotal+=group[i].p*group[j].p;
   observedTotal+=group[i].won&&group[j].won?1:0;
  }
 }
 if(pairCount<MIN_PAIRS)return {status:"insufficient_sample",method:"same_utc_calendar_day_distinct_event_favourite_pairs_v1",pairCount,slateCount,minimumPairs:MIN_PAIRS,meanPredictedJointHitProbability:null,realizedJointHitRate:null,calibrationGap:null,jointModelQualificationAllowed:false,couponQualificationAllowed:false,productionUseAllowed:false,limitations:["At least 100 same-UTC-day distinct-event pairs are required for a descriptive diagnostic."]};
 const meanPredictedJointHitProbability=predictedTotal/pairCount,realizedJointHitRate=observedTotal/pairCount;
 return {status:"diagnostic_only",method:"same_utc_calendar_day_distinct_event_favourite_pairs_v1",pairCount,slateCount,minimumPairs:MIN_PAIRS,meanPredictedJointHitProbability,realizedJointHitRate,calibrationGap:realizedJointHitRate-meanPredictedJointHitProbability,jointModelQualificationAllowed:false,couponQualificationAllowed:false,productionUseAllowed:false,limitations:["UTC calendar date is only a proxy for a bookmaker coupon slate; it does not prove the events were offered together.","This measures consensus-favourite outcomes, not WIN model probabilities or executable bookmaker prices.","A descriptive pair gap is not a validated joint-probability model and cannot qualify any coupon."]};
}

function simulateConsensusCoupons(rows:Observation[],providerId:string,sport:string){
 const football=sport==="football";
 const favourites=rows.map(r=>{
  const c=r.closing||{};
  if(football){
   const p=[Number(c.homeWinProbability),Number(c.drawProbability),Number(c.awayWinProbability)];
   if(!validThreeWay(p))return null;
   const winner=resolveThreeWayWinner(r);if(winner<0)return null;
   const favouriteIndex=p.indexOf(Math.max(...p));
   return {eventId:r.id,eventStart:r.eventStart,p:p[favouriteIndex]/p.reduce((a,b)=>a+b,0),won:winner===favouriteIndex};
  }
  const p=validBinaryVector(c.homeWinProbability,c.awayWinProbability);
  if(!p)return null;
  const winner=resolveTwoWayWinner(r);if(winner<0)return null;
  const favouriteIndex=p[0]>=p[1]?0:1;
  return {eventId:r.id,eventStart:r.eventStart,p:p[favouriteIndex]/p.reduce((a,b)=>a+b,0),won:winner===favouriteIndex};
 }).filter((x:any)=>x!==null).sort((a,b)=>a.eventStart.localeCompare(b.eventStart));
 if(favourites.length<MINIMUM_MARKET_SAMPLE)return {status:"insufficient_sample",settledEvents:favourites.length,minimum:MINIMUM_MARKET_SAMPLE,couponCount:0};
 const holdout=favourites.slice(Math.floor(favourites.length*.7));
 const sameSlatePairDependence=evaluateSameSlateFavouritePairs(holdout);
 if(holdout.length<10)return {status:"insufficient_holdout",settledEvents:favourites.length,holdoutEvents:holdout.length,couponCount:0};
 const random=seededRandom(providerId+"|consensus-coupon-simulation-v3|"+sport);
 const legCounts=[2,3,4,5,8,10].filter(n=>n<=holdout.length);
 const results=legCounts.map(legs=>{
  const samples=1500;let predicted=0,actual=0;
  for(let n=0;n<samples;n++){
   const pool=holdout.slice(),selected:any[]=[];
   for(let j=0;j<legs;j++){const index=Math.floor(random()*pool.length);selected.push(pool[index]);pool.splice(index,1);}
   const probability=selected.reduce((p,x)=>p*x.p,1);
   predicted+=probability;if(selected.every(x=>x.won))actual++;
  }
  return {legs,couponsSimulated:samples,meanPredictedHitProbability:predicted/samples,realizedHitRate:actual/samples,calibrationGap:(actual-predicted)/samples};
 });
 return {status:"completed",method:football?"random_distinct_event_three_way_favourite_accumulators_v3":"random_distinct_event_two_way_favourite_accumulators_v3",couponCount:results.reduce((n,x)=>n+x.couponsSimulated,0),settledEvents:favourites.length,holdoutEvents:holdout.length,sameSlatePairDependence,trainingEnd:favourites[Math.floor(favourites.length*.7)-1]?.eventStart||null,holdoutStart:holdout[0]?.eventStart||null,holdoutEnd:holdout.at(-1)?.eventStart||null,results,limitations:["Only complete probability vectors and unambiguous match-winner outcomes are included; draws, pushes, voids and ambiguous outcomes are excluded where they cannot be graded by the model.","Favourite-only market consensus simulation; it does not test WIN's own predictions.","Consensus probabilities are normalized consensus benchmarks, not executable bookmaker prices.","No stake return, ROI, payout, or bookmaker settlement is simulated.","Coupons are random distinct-event combinations; legs are not assumed independent for real betting advice."]};
}
export function evaluateMarketDataset(dataset:any){
 const sport=String(dataset.sport||"").toLowerCase();
 const rows:Observation[]=(Array.isArray(dataset.records)?dataset.records:[]).filter((r:any)=>r.status==="completed"&&r.eventStart&&Number.isFinite(Date.parse(r.eventStart))).map((r:any)=>({...r,sport:r.sport||sport,providerId:dataset.providerId}));
 const sorted=rows.sort((a,b)=>a.eventStart.localeCompare(b.eventStart));
 let moneyline:any;
 if(sport==="football"){
  const oneXTwo=sorted.map(r=>{
   const c=r.closing||{},p=[Number(c.homeWinProbability),Number(c.drawProbability),Number(c.awayWinProbability)];
   return {date:r.eventStart,p,y:resolveThreeWayWinner(r)};
  }).filter(x=>x.y>=0&&validThreeWay(x.p));
  moneyline={status:"insufficient_sample",observations:oneXTwo.length,minimum:MINIMUM_MARKET_SAMPLE,market:"1X2",classCount:3,excludedMissingClassOrAmbiguousOutcome:sorted.length-oneXTwo.length};
  if(oneXTwo.length>=MINIMUM_MARKET_SAMPLE){const cut=Math.floor(oneXTwo.length*.7),train=oneXTwo.slice(0,cut),test=oneXTwo.slice(cut);moneyline={status:"evaluated",observations:oneXTwo.length,minimum:MINIMUM_MARKET_SAMPLE,trainingCount:train.length,testCount:test.length,trainingPeriod:{from:train[0].date,to:train.at(-1)?.date},testPeriod:{from:test[0].date,to:test.at(-1)?.date},excludedMissingClassOrAmbiguousOutcome:sorted.length-oneXTwo.length,market:"1X2",classCount:3,testMetrics:multiclassMetrics(test)};}
 }else{
  const twoWay=sorted.map(r=>({date:r.eventStart,p:Number(r.closing?.homeWinProbability),y:resolveTwoWayWinner(r)})).filter(x=>validProb(x.p)&&(x.y===0||x.y===1));
  moneyline={status:"insufficient_sample",observations:twoWay.length,minimum:MINIMUM_MARKET_SAMPLE,market:"two_way_moneyline",classCount:2,excludedMissingProbabilityOrAmbiguousOutcome:sorted.length-twoWay.length};
  if(twoWay.length>=MINIMUM_MARKET_SAMPLE){const cut=Math.floor(twoWay.length*.7),train=twoWay.slice(0,cut),test=twoWay.slice(cut);moneyline={status:"evaluated",observations:twoWay.length,minimum:MINIMUM_MARKET_SAMPLE,trainingCount:train.length,testCount:test.length,trainingPeriod:{from:train[0].date,to:train.at(-1)?.date},testPeriod:{from:test[0].date,to:test.at(-1)?.date},excludedMissingProbabilityOrAmbiguousOutcome:sorted.length-twoWay.length,market:"two_way_moneyline",classCount:2,testMetrics:binaryMetrics(test.map(x=>({p:x.p,y:x.y===0?1:0})))};}
 }
 const couponSimulation=simulateConsensusCoupons(sorted,dataset.providerId,sport);
 const markets=[
  binaryMarket("spread_or_puck_line",sorted,r=>r.closing?.homeSpreadCoverProbability,r=>r.settlements?.spreadResult==="home"?1:r.settlements?.spreadResult==="away"?0:null),
  binaryMarket("game_total_over",sorted,r=>r.closing?.overProbability,r=>r.settlements?.totalResult==="over"?1:r.settlements?.totalResult==="under"?0:null),
  binaryMarket("btts_yes",sorted,r=>r.closing?.bttsYesProbability,r=>r.settlements?.bttsResult==="yes"?1:r.settlements?.bttsResult==="no"?0:null)
 ];
 return {providerId:dataset.providerId,sport:dataset.sport,sourceLicence:dataset.sourceLicence,marketDataType:dataset.marketDataType,bookmakerIdentityIncluded:dataset.bookmakerIdentityIncluded===true,events:sorted.length,moneyline,markets,couponSimulation};
}
export async function runMarketCalibrationLab(){
 const datasets=await list<any>("library/model-lab/market-consensus-datasets",100);
 const evaluated=datasets.map(evaluateMarketDataset);

 const totalEvents=evaluated.reduce((n,x)=>n+x.events,0);
 const report={status:totalEvents?"completed":"waiting_for_data",createdAt:new Date().toISOString(),sourceDatasetCount:datasets.length,totalEvents,splitMethod:"chronological_70_30_per_dataset",reports:evaluated,interpretation:"This evaluates closing consensus markets as benchmarks, not a WIN predictive model. Test metrics are out-of-time. It does not establish betting ROI, bookmaker execution price or a profitable edge.",guardrails:["No random train/test split.","No future rows used in training portion.","Football 1X2 requires all three valid class probabilities and an unambiguous three-way result; incomplete class vectors are excluded.","Two-way sports use home/player-one win probability and an unambiguous home/player-one or away/player-two result; draws, pushes, voids and ambiguous outcomes are excluded.","Every market requires at least 30 valid events and uses a chronological 70/30 split.","Consensus fair probabilities are not individual bookmaker prices.","Human Coupon Lab was not read or written."],origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false,calibrationVersion:"sport_aware_two_way_and_1x2_v3"};
 const reportDigest=hashWinMLProvenance(report).sha256;
 const id="market-calibration-"+reportDigest.slice(0,32);
 const immutableReport={...report,id,reportSha256:reportDigest,storagePolicy:"immutable_content_addressed_v1"};
 const stored=await putIfNew("library/model-lab/market-calibration-reports",id,immutableReport);
 if(stored?.modified)return immutableReport;
 const existing=await get<any>("library/model-lab/market-calibration-reports",id);
 if(existing&&existing.reportSha256===reportDigest&&hashWinMLProvenance({...Object.fromEntries(Object.entries(existing).filter(([key])=>key!=="id"&&key!=="reportSha256"&&key!=="storagePolicy"))}).sha256===reportDigest)return existing;
 throw new Error("market_calibration_immutable_record_conflict");
}
export async function getMarketCalibrationStatus(){
 const reports=await list<any>("library/model-lab/market-calibration-reports",20);
 return {reportCount:reports.length,latest:reports.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null};
}

import { list, put } from "./store.mts";
export async function runOpenFootballBaselineLab() {
 const sets=await list<any>("library/model-lab/historical-event-datasets",1000);
 const id="openfootball-baseline-"+new Date().toISOString().slice(0,10);
 const reports=sets.map(dataset=>{
  const rows=(Array.isArray(dataset.records)?dataset.records:[])
   .filter((x:any)=>x.origin==="provider_historical_data"&&Array.isArray(x.fullTimeScore)&&x.fullTimeScore.length===2&&x.fullTimeScore.every((n:any)=>Number.isInteger(n)&&n>=0))
   .sort((a:any,b:any)=>String(a.eventStart).localeCompare(String(b.eventStart)));
  if(rows.length<30)return {datasetId:dataset.id,providerId:dataset.providerId,competition:dataset.competition,season:dataset.season,status:"insufficient_sample",scoredMatches:rows.length,minimumRequired:30};
  const cut=Math.floor(rows.length*.7),train=rows.slice(0,cut),test=rows.slice(cut);
  const pHome=train.filter((x:any)=>x.fullTimeScore[0]>x.fullTimeScore[1]).length/train.length;
  const pDraw=train.filter((x:any)=>x.fullTimeScore[0]===x.fullTimeScore[1]).length/train.length;
  const pAway=1-pHome-pDraw,probs=[pHome,pDraw,pAway];
  let brier=0,logLoss=0,correct=0;
  for(const x of test){const [h,a]=x.fullTimeScore,y=h>a?0:h===a?1:2;brier+=probs.reduce((sum,p,i)=>sum+(p-(i===y?1:0))**2,0);logLoss-=Math.log(Math.max(1e-6,probs[y]));if(probs.indexOf(Math.max(...probs))===y)correct++;}
  const goalLines=[1.5,2.5,3.5,4.5].map(line=>{const p=train.filter((x:any)=>x.fullTimeScore[0]+x.fullTimeScore[1]>line).length/train.length;let score=0;for(const x of test){const y=x.fullTimeScore[0]+x.fullTimeScore[1]>line?1:0;score+=(p-y)**2;}return {line,trainingProbability:p,testBrier:score/test.length,testCount:test.length};});
  return {datasetId:dataset.id,providerId:dataset.providerId,competition:dataset.competition,season:dataset.season,status:"evaluated",scoredMatches:rows.length,trainingMatches:train.length,testMatches:test.length,split:"chronological_70_30",trainingPeriod:{from:train[0].eventStart,to:train.at(-1)?.eventStart},testPeriod:{from:test[0].eventStart,to:test.at(-1)?.eventStart},oneXTwo:{trainingProbabilities:{home:pHome,draw:pDraw,away:pAway},testAccuracy:correct/test.length,testBrier:brier/test.length,testLogLoss:logLoss/test.length},goalLines};
 });
 const evaluated=reports.filter(x=>x.status==="evaluated");
 const result={id,status:evaluated.length?"completed":"waiting_for_data",lab:"model-lab",origin:"provider_historical_data",modelVersion:"competition_frequency_baseline_v1",datasetCount:sets.length,evaluatedDatasets:evaluated.length,insufficientSampleDatasets:reports.length-evaluated.length,scoredMatches:reports.reduce((n,x)=>n+Number(x.scoredMatches||0),0),reports,limitations:["Each competition/season is evaluated separately; no cross-competition pooling.","Chronological 70/30 split; no random split or future-to-past leakage.","No historical bookmaker execution prices in the OpenFootball source; no ROI or CLV.","Frequency baseline only, not evidence of a predictive edge."],humanCouponLabTouched:false,createdAt:new Date().toISOString()};
 await put("library/model-lab/experiments",id,result);return result;
}
export async function getModelLabResearchPack(){
 const [events,consensus,observed,calibrations,experiments,runs,playerEventDatasets]=await Promise.all([
  list<any>("library/model-lab/historical-event-datasets",1000),
  list<any>("library/model-lab/market-consensus-datasets",100),
  list<any>("library/model-lab/observed-market-snapshots",100),
  list<any>("library/model-lab/market-calibration-reports",20),
  list<any>("library/model-lab/experiments",50),
  list<any>("library/model-lab/provider-sync-runs",30),
  list<any>("library/model-lab/player-event-datasets",1000)
 ]);
 const latestCalibration=calibrations.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
 const playerStats=new Map<string,any>();
 for(const dataset of playerEventDatasets)for(const event of (Array.isArray(dataset.records)?dataset.records:[])){
  if(event.origin!=="provider_historical_data"||typeof event.player!=="string")continue;
  const key=event.player+"|"+(event.team||"");const p=playerStats.get(key)||{player:event.player,team:event.team||null,goals:0,yellowCards:0,redCards:0,starts:0,benchListings:0};
  if(event.eventType==="goal")p.goals++;
  if(event.cardType==="Y")p.yellowCards++;
  if(event.cardType==="R")p.redCards++;
  if(event.role==="starter")p.starts++;
  if(event.role==="bench")p.benchListings++;
  playerStats.set(key,p);
 }
 const playerSummary=[...playerStats.values()];
 return {
  generatedAt:new Date().toISOString(),
  dataSummary:{
   historicalEventDatasets:events.length,historicalEventRows:events.reduce((n,d)=>n+Number(d.totalRows||0),0),historicalScoredRows:events.reduce((n,d)=>n+Number(d.scoredRows||0),0),
   consensusDatasets:consensus.length,consensusMarketRows:consensus.reduce((n,d)=>n+Number(d.totalRows||0),0),consensusSettledRows:consensus.reduce((n,d)=>n+Number(d.settledRows||0),0),
   observedMarketSnapshots:observed.length,observedMarketRows:observed.reduce((n,d)=>n+Number(d.recordCount||0),0),
   playerEventDatasets:playerEventDatasets.length,playerEventRows:playerEventDatasets.reduce((n,d)=>n+Number(d.totalRows||0),0),
   worldCupPlayerStats:{uniquePlayers:playerSummary.length,topScorers:playerSummary.filter(x=>x.goals>0).sort((a,b)=>b.goals-a.goals).slice(0,20),mostYellowCards:playerSummary.filter(x=>x.yellowCards>0).sort((a,b)=>b.yellowCards-a.yellowCards).slice(0,10),mostStarts:playerSummary.filter(x=>x.starts>0).sort((a,b)=>b.starts-a.starts).slice(0,10)},
   observedSports:[...new Set(observed.flatMap(d=>(d.records||[]).map(r=>r.sportId)))],
   observedBookmakerSources:[...new Set(observed.flatMap(d=>(d.records||[]).map(r=>r.bookmakerId)))],
   observedMarketFamilies:[...new Set(observed.flatMap(d=>(d.records||[]).map(r=>r.canonicalMarketId)))]
  },
  latestCalibration:latestCalibration?{
   createdAt:latestCalibration.createdAt,status:latestCalibration.status,totalEvents:latestCalibration.totalEvents,
   datasets:(latestCalibration.reports||[]).map(x=>({providerId:x.providerId,sport:x.sport,events:x.events,moneylineStatus:x.moneyline?.status,moneylineTestMetrics:x.moneyline?.testMetrics,markets:x.markets,couponSimulation:x.couponSimulation}))
  }:null,
  recentExperiments:experiments.slice(-8).map(x=>({id:x.id,status:x.status,scoredMatches:x.scoredMatches,evaluatedDatasets:x.evaluatedDatasets,insufficientSampleDatasets:x.insufficientSampleDatasets,reports:(x.reports||[]).slice(0,30).map((r:any)=>({providerId:r.providerId,competition:r.competition,season:r.season,status:r.status,scoredMatches:r.scoredMatches,testMatches:r.testMatches,oneXTwo:r.oneXTwo,goalLines:r.goalLines})),createdAt:x.createdAt})),
  recentProviderSyncs:runs.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,8).map(x=>({id:x.id,status:x.status,startedAt:x.startedAt,completedAt:x.completedAt,rowsImported:x.rowsImported??x.matchesImported??x.marketsImported??0,failures:(x.failures||[]).length})),
  restrictions:["This is a read-only research context for WIN agents.","Consensus probabilities are benchmarks, not individual bookmaker prices.","Static SharpAPI samples are point-in-time snapshots, not live odds.","No human coupon or tipster-origin data is included.","No strategy is validated by this summary."]
 };
}

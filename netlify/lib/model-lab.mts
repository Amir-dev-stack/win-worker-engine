import { list, put } from "./store.mts";
export async function runOpenFootballBaselineLab() {
 const sets=await list<any>("library/model-lab/historical-event-datasets",1000);
 const rows=sets.flatMap(x=>Array.isArray(x.records)?x.records:[]).filter(x=>x.origin==="provider_historical_data"&&Array.isArray(x.fullTimeScore)&&x.fullTimeScore.length===2).sort((a,b)=>String(a.eventStart).localeCompare(String(b.eventStart)));
 const id="openfootball-baseline-"+new Date().toISOString().slice(0,10);
 if(rows.length<30){const r={id,status:"waiting_for_data",scoredMatches:rows.length,minimumRequired:30,lab:"model-lab",origin:"provider_historical_data",humanCouponLabTouched:false};await put("library/model-lab/experiments",id,r);return r;}
 const cut=Math.floor(rows.length*.7),train=rows.slice(0,cut),test=rows.slice(cut);
 const pHome=train.filter(x=>x.fullTimeScore[0]>x.fullTimeScore[1]).length/train.length;
 const pDraw=train.filter(x=>x.fullTimeScore[0]===x.fullTimeScore[1]).length/train.length;
 const pAway=1-pHome-pDraw;
 const goalLines=[1.5,2.5,3.5,4.5].map(line=>{const p=train.filter(x=>x.fullTimeScore[0]+x.fullTimeScore[1]>line).length/train.length;let brier=0;for(const x of test){const y=x.fullTimeScore[0]+x.fullTimeScore[1]>line?1:0;brier+=(p-y)**2;}return {line,trainingProbability:p,testBrier:brier/test.length,testCount:test.length};});
 const result={id,status:"completed",lab:"model-lab",origin:"provider_historical_data",scoredMatches:rows.length,trainingMatches:train.length,testMatches:test.length,split:"chronological_70_30",oneXTwoTrainingProbabilities:{home:pHome,draw:pDraw,away:pAway},goalLines,limitations:["No historical bookmaker odds; no ROI or CLV.","Baseline frequencies only, not a demonstrated betting edge."],humanCouponLabTouched:false,createdAt:new Date().toISOString()};
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
  recentExperiments:experiments.slice(-8).map(x=>({id:x.id,status:x.status,scoredMatches:x.scoredMatches,testMatches:x.testMatches,createdAt:x.createdAt})),
  recentProviderSyncs:runs.sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,8).map(x=>({id:x.id,status:x.status,startedAt:x.startedAt,completedAt:x.completedAt,rowsImported:x.rowsImported??x.matchesImported??x.marketsImported??0,failures:(x.failures||[]).length})),
  restrictions:["This is a read-only research context for WIN agents.","Consensus probabilities are benchmarks, not individual bookmaker prices.","Static SharpAPI samples are point-in-time snapshots, not live odds.","No human coupon or tipster-origin data is included.","No strategy is validated by this summary."]
 };
}

import { requireAuth } from "../lib/auth.mts";
import { DATA_PROVIDER_REGISTRY } from "../lib/data-provider-registry.mts";
import { getOpenFootballSyncStatus } from "../lib/openfootball-adapter.mts";
import { getOpenFootballWorldCupSyncStatus } from "../lib/openfootball-worldcup-adapter.mts";
import { getConsensusMarketSyncStatus } from "../lib/consensus-market-adapter.mts";
import { getSharpApiSampleStatus } from "../lib/sharpapi-sample-adapter.mts";
import { getMarketCalibrationStatus } from "../lib/market-calibration.mts";
import { list } from "../lib/store.mts";
export default async (req: Request) => {
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const [openfootball,openfootballWorldCup,consensus,sharpapi,calibration,experiments,datasets,consensusDatasets,observedMarketDatasets,playerEventDatasets,agentTasks,agentProfiles]=await Promise.all([
  getOpenFootballSyncStatus(),getOpenFootballWorldCupSyncStatus(),getConsensusMarketSyncStatus(),getSharpApiSampleStatus(),getMarketCalibrationStatus(),
  list<any>("library/model-lab/experiments",30),
  list<any>("library/model-lab/historical-event-datasets",1000),
  list<any>("library/model-lab/market-consensus-datasets",100),
  list<any>("library/model-lab/observed-market-snapshots",100),
  list<any>("library/model-lab/player-event-datasets",1000),
  list<any>("library/agent-task-queue",1000),
  list<any>("library/persistent-agent-profiles",1000)
 ]);
 return Response.json({
  providers:DATA_PROVIDER_REGISTRY.map(p=>({
   id:p.id,name:p.name,accessMode:p.accessMode,licenceReview:p.licenceReview,automationAllowed:p.automationAllowed,
   status:p.id==="openfootball"?openfootball.status:p.id==="openfootball-worldcup-json"?openfootballWorldCup.status:p.id.startsWith("hf-minmaxxxer-")?(consensus.sourceStatuses?.[p.id]||"not_yet_run"):p.id==="sharpapi-sample-data"?sharpapi.status:"not_connected"
  })),
  openfootball,openfootballWorldCup,consensus,sharpapi,calibration,
  persistentAgents:{profiles:agentProfiles.length,queued:agentTasks.filter(x=>x.status==="queued").length,running:agentTasks.filter(x=>x.status==="running").length,completed:agentTasks.filter(x=>x.status==="completed").length,failed:agentTasks.filter(x=>x.status==="failed").length,recentTasks:agentTasks.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,10).map(x=>({id:x.id,agentId:x.agentId,name:x.name,tier:x.tier,status:x.status,attempts:x.attempts,createdAt:x.createdAt,updatedAt:x.updatedAt}))},
  modelLab:{
   eventDatasetCount:datasets.length,
   eventMatchCount:datasets.reduce((n,d)=>n+Number(d.totalRows||0),0),
   eventScoredMatchCount:datasets.reduce((n,d)=>n+Number(d.scoredRows||0),0),
   worldCupDatasetCount:datasets.filter(d=>d.providerId==="openfootball-worldcup-json").length,
   worldCupMatchCount:datasets.filter(d=>d.providerId==="openfootball-worldcup-json").reduce((n,d)=>n+Number(d.totalRows||0),0),
   worldCupScoredMatches:datasets.filter(d=>d.providerId==="openfootball-worldcup-json").reduce((n,d)=>n+Number(d.scoredRows||0),0),
   playerEventDatasetCount:playerEventDatasets.length,
   playerEventRows:playerEventDatasets.reduce((n,d)=>n+Number(d.totalRows||0),0),
   consensusDatasetCount:consensusDatasets.length,
   consensusMarketRows:consensusDatasets.reduce((n,d)=>n+Number(d.totalRows||0),0),
   consensusSettledRows:consensusDatasets.reduce((n,d)=>n+Number(d.settledRows||0),0),
   observedMarketSnapshotCount:observedMarketDatasets.length,
   observedMarketRows:observedMarketDatasets.reduce((n,d)=>n+Number(d.recordCount||0),0),
   observedSports:[...new Set(observedMarketDatasets.flatMap(d=>(d.records||[]).map(r=>r.sportId)))],
   observedBookmakers:[...new Set(observedMarketDatasets.flatMap(d=>(d.records||[]).map(r=>r.bookmakerId)))],
   observedMarketFamilies:[...new Set(observedMarketDatasets.flatMap(d=>(d.records||[]).map(r=>r.canonicalMarketId)))],
   experiments:experiments.slice(-10)
  },
  humanCouponLab:"isolated_not_read_or_written"
 },{headers:{"cache-control":"no-store"}});
};
export const config={path:"/api/research-status"};

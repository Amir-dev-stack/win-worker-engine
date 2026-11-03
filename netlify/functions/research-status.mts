import { requireAuth } from "../lib/auth.mts";
import { DATA_PROVIDER_REGISTRY } from "../lib/data-provider-registry.mts";
import { getOpenFootballSyncStatus } from "../lib/openfootball-adapter.mts";
import { getConsensusMarketSyncStatus } from "../lib/consensus-market-adapter.mts";
import { getSharpApiSampleStatus } from "../lib/sharpapi-sample-adapter.mts";
import { getMarketCalibrationStatus } from "../lib/market-calibration.mts";
import { list } from "../lib/store.mts";
export default async (req: Request) => {
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const [openfootball,consensus,sharpapi,calibration,experiments,datasets,consensusDatasets,observedMarketDatasets]=await Promise.all([
  getOpenFootballSyncStatus(),getConsensusMarketSyncStatus(),getSharpApiSampleStatus(),getMarketCalibrationStatus(),
  list<any>("library/model-lab/experiments",30),
  list<any>("library/model-lab/historical-event-datasets",1000),
  list<any>("library/model-lab/market-consensus-datasets",100),
  list<any>("library/model-lab/observed-market-snapshots",100)
 ]);
 return Response.json({
  providers:DATA_PROVIDER_REGISTRY.map(p=>({
   id:p.id,name:p.name,accessMode:p.accessMode,licenceReview:p.licenceReview,automationAllowed:p.automationAllowed,
   status:p.id==="openfootball"?openfootball.status:p.id.startsWith("hf-minmaxxxer-")?consensus.status:p.id==="sharpapi-sample-data"?sharpapi.status:"not_connected"
  })),
  openfootball,consensus,sharpapi,calibration,
  modelLab:{
   eventDatasetCount:datasets.length,
   eventMatchCount:datasets.reduce((n,d)=>n+Number(d.totalRows||0),0),
   eventScoredMatchCount:datasets.reduce((n,d)=>n+Number(d.scoredRows||0),0),
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

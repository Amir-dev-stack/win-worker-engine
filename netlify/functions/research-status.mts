import { requireAuth } from "../lib/auth.mts";
import { DATA_PROVIDER_REGISTRY } from "../lib/data-provider-registry.mts";
import { getOpenFootballSyncStatus } from "../lib/openfootball-adapter.mts";
import { list } from "../lib/store.mts";
export default async (req: Request) => {
 const denied=requireAuth(req);if(denied)return denied;
 if(req.method!=="GET")return new Response("Method not allowed",{status:405});
 const [openfootball,experiments,datasets]=await Promise.all([
  getOpenFootballSyncStatus(),list<any>("library/model-lab/experiments",30),list<any>("library/model-lab/historical-event-datasets",1000)
 ]);
 return Response.json({
  providers:DATA_PROVIDER_REGISTRY.map(p=>({id:p.id,name:p.name,accessMode:p.accessMode,licenceReview:p.licenceReview,automationAllowed:p.automationAllowed,status:p.id==="openfootball"?openfootball.status:"not_connected"})),
  openfootball,
  modelLab:{datasetCount:datasets.length,matchCount:datasets.reduce((n,d)=>n+Number(d.totalRows||0),0),scoredMatchCount:datasets.reduce((n,d)=>n+Number(d.scoredRows||0),0),experiments:experiments.slice(-10)},
  humanCouponLab:"isolated_not_read_or_written"
 },{headers:{"cache-control":"no-store"}});
};
export const config={path:"/api/research-status"};

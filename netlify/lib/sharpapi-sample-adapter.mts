import { createHash } from "node:crypto";
import { get, put, list } from "./store.mts";
import { validateObservedMarket, type ObservedMarket } from "./market-catalog.mts";

const FILES=[
 {id:"worldcup-2026",path:"data/worldcup_2026_odds_snapshot.csv",sport:"football"},
 {id:"mlb-2026",path:"data/mlb_odds_snapshot.csv",sport:"baseball"}
] as const;
const BASE="https://raw.githubusercontent.com/Sharp-API/SharpAPI-Sample-Data/main/";
const ATTRIBUTION="Odds data from SharpAPI (sharpapi.io), Sports Betting Odds Sample Dataset, 2026. CC BY 4.0.";

function parseCsv(input:string):string[][]{
 const out:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
 for(let i=0;i<input.length;i++){const c=input[i];
  if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
  if(c==='"'){quoted=true;continue;}if(c===","){row.push(cell);cell="";continue;}
  if(c==="\n"){row.push(cell.replace(/\r$/,""));if(row.some(x=>x!==""))out.push(row);row=[];cell="";continue;}cell+=c;
 }
 if(cell.length||row.length){row.push(cell.replace(/\r$/,""));if(row.some(x=>x!==""))out.push(row);}
 if(quoted)throw Error("csv_unclosed_quote");
 return out;
}
function parseBool(v:string){return v.toLowerCase()==="true";}
function marketSlug(v:string){return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||"unknown_market";}
function periodFor(v:string):ObservedMarket["period"]{
 const s=v.toLowerCase();
 if(/first_half|1h|first_period|1st_inning/.test(s))return "first_half";
 if(/second_half|2h|second_period/.test(s))return "second_half";
 if(/quarter/.test(s))return "quarter";
 if(/inning/.test(s))return "inning";
 if(/set/.test(s))return "set";
 if(/map/.test(s))return "map";
 if(/round/.test(s))return "round";
 if(/player/.test(s))return "player_performance";
 if(/futures|outright|champion|winner/.test(s))return "tournament";
 return "unknown";
}
function classifySource(name:string):ObservedMarket["bookmakerType"]{
 const s=name.toLowerCase();
 if(["kalshi","polymarket"].some(x=>s.includes(x)))return "prediction_market";
 if(["betfair","matchbook","novig"].some(x=>s.includes(x)))return "exchange";
 if(["draftkings","fanduel","pinnacle","bovada","betmgm","betrivers","caesars","espnbet","bet365","betway","fanatics","hardrock"].some(x=>s.includes(x)))return "sportsbook";
 return "unknown";
}
async function syncOne(file:typeof FILES[number]){
 const url=BASE+file.path,res=await fetch(url,{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!res.ok)throw Error("source_http_"+res.status);
 const raw=await res.text();if(raw.length>5_000_000)throw Error("source_file_over_5mb");
 const rows=parseCsv(raw);if(rows.length<2)throw Error("no_csv_rows");
 const headers=rows[0].map(x=>x.trim()),required=["id","sportsbook","event_id","sport","league","market_type","selection","selection_type","odds_american","odds_decimal","odds_probability","event_start_time","is_live","timestamp"];
 const missing=required.filter(x=>!headers.includes(x));if(missing.length)throw Error("schema_missing_"+missing.join("_"));
 const records:ObservedMarket[]=[];let rejected=0;
 for(let i=1;i<rows.length;i++){
  const obj=Object.fromEntries(headers.map((h,j)=>[h,rows[i][j]??""])) as Record<string,string>;
  const odds=Number(obj.odds_decimal),observedAt=obj.timestamp,startsAt=obj.event_start_time;
  const sportId=(obj.sport==="soccer"?"football":obj.sport==="ice-hockey"?"ice_hockey":obj.sport||file.sport).toLowerCase().replace(/[^a-z0-9]+/g,"_");
  const m:ObservedMarket={
   providerId:"sharpapi-sample-data",bookmakerId:obj.sportsbook||"unknown",
   sportId,eventId:obj.event_id||"unknown",
   providerMarketId:obj.id||undefined,providerMarketName:obj.market_type||"unknown",
   canonicalMarketId:marketSlug(obj.market_type||"unknown"),
   league:obj.league||undefined,homeTeam:obj.home_team||undefined,awayTeam:obj.away_team||undefined,selectionType:obj.selection_type||undefined,selection:obj.selection||undefined,
   period:periodFor(obj.market_type||""),
   ...(obj.line!==""&&Number.isFinite(Number(obj.line))?{line:Number(obj.line)}:{}),
   selectionName:[obj.selection,obj.selection_type].filter(Boolean).join(" — "),
   oddsDecimal:odds,oddsAmerican:obj.odds_american!==""&&Number.isFinite(Number(obj.odds_american))?Number(obj.odds_american):undefined,
   impliedProbability:obj.odds_probability!==""&&Number.isFinite(Number(obj.odds_probability))?Number(obj.odds_probability):undefined,
   impliedProbabilityType:"vig_included",
   bookmakerType:classifySource(obj.sportsbook),sourceSnapshotOnly:true,
   eventTimeSemantics:classifySource(obj.sportsbook)==="prediction_market"?"market_expiry":"scheduled_event_start",
   observedAt,startsAt,live:parseBool(obj.is_live),
   sourceRecordId:[obj.event_id,obj.sportsbook,obj.market_type,obj.selection,obj.selection_type,obj.line,obj.home_team,observedAt].join("|"),
   availabilityStatus:"unknown"
  };
  if(validateObservedMarket(m).length||!Number.isFinite(Date.parse(startsAt))||!Number.isFinite(Date.parse(observedAt))){rejected++;continue;}
  records.push(m);
 }
 const checksum=createHash("sha256").update(raw).digest("hex");
 const datasetId="sharpapi-"+file.id;
 const dataset={id:datasetId,providerId:"sharpapi-sample-data",sourceUrl:url,sourceRepository:"https://github.com/Sharp-API/SharpAPI-Sample-Data",sourceLicence:"CC-BY-4.0",licenceReference:"https://creativecommons.org/licenses/by/4.0/",attribution:ATTRIBUTION,retrievedAt:new Date().toISOString(),rawChecksum:checksum,sport:file.sport,recordCount:records.length,rejectedRows:rejected,sourceSnapshotTimeRange:{from:records.map(x=>x.observedAt).sort()[0]||null,to:records.map(x=>x.observedAt).sort().at(-1)||null},sourceClassification:"multi_source_snapshot",bookmakerIdentityPreserved:true,records,origin:"provider_historical_data",lab:"model-lab"};
 await put("library/model-lab/observed-market-snapshots",datasetId,dataset);
 return {datasetId,sport:file.sport,imported:records.length,rejected,checksum};
}
export async function syncSharpApiSampleMarkets(){
 const startedAt=new Date().toISOString(),results:any[]=[],failures:any[]=[];
 for(const f of FILES){try{results.push(await syncOne(f));}catch(e){failures.push({file:f.path,error:String(e).slice(0,350)});}}
 const summary={id:"sharpapi-sample-sync-"+startedAt.slice(0,10),startedAt,completedAt:new Date().toISOString(),status:results.length===FILES.length?"completed":results.length?"partial":"failed",datasetsImported:results.length,marketsImported:results.reduce((n,x)=>n+x.imported,0),rejectedRows:results.reduce((n,x)=>n+x.rejected,0),results,failures,origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false};
 await put("library/model-lab/provider-sync-runs",summary.id,summary);
 await put("scheduler-state","sharpapi-sample-sync",{lastCheck:summary.completedAt,status:summary.status,datasetsImported:summary.datasetsImported,marketsImported:summary.marketsImported,rejectedRows:summary.rejectedRows});
 return summary;
}
export async function getSharpApiSampleStatus(){
 const state=await get<any>("scheduler-state","sharpapi-sample-sync");
 const datasets=await list<any>("library/model-lab/observed-market-snapshots",100);
 return {status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,totals:state||null,datasetCount:datasets.length,marketRows:datasets.reduce((n,d)=>n+Number(d.recordCount||0),0),rejectedRows:datasets.reduce((n,d)=>n+Number(d.rejectedRows||0),0)};
}

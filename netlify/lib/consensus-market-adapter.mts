import { createHash } from "node:crypto";
import { get, put, list } from "./store.mts";
import { assertProviderImportAllowed } from "./data-provider-registry.mts";
import { isStrictIsoTimestamp } from "./strict-timestamp.mts";

export const CONSENSUS_SOURCES = [
 {id:"hf-minmaxxxer-nfl-2026",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/nfl-odds-2026",sport:"american_football"},
 {id:"hf-minmaxxxer-nfl-2025",requiredDomains:["historical_consensus_moneyline","spread","totals","settled_results"],repo:"minmaxxxer/nfl-closing-lines-ats-2025",sport:"american_football"},
 {id:"hf-minmaxxxer-nba-2025-26",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/nba-closing-lines-ats-2025-26",sport:"basketball"},
 {id:"hf-minmaxxxer-nba-2024-25",requiredDomains:["historical_consensus_moneyline","spread","totals","settled_results"],repo:"minmaxxxer/nba-closing-lines-ats-2024-25",sport:"basketball"},
 {id:"hf-minmaxxxer-nba-2026-27",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/nba-odds-2026-27",sport:"basketball"},
 {id:"hf-minmaxxxer-nhl-2026-27",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/nhl-odds-2026-27",sport:"ice_hockey"},
 {id:"hf-minmaxxxer-nhl-2025-26",requiredDomains:["historical_consensus_moneyline","puck_line","totals","settled_results"],repo:"minmaxxxer/nhl-closing-odds-2025-26",sport:"ice_hockey"},
 {id:"hf-minmaxxxer-mlb-2025",requiredDomains:["historical_consensus_moneyline","run_line","totals","settled_results"],repo:"minmaxxxer/mlb-closing-odds-2025",sport:"baseball"},
 {id:"hf-minmaxxxer-epl-2025-26",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/premier-league-closing-odds-2025-26",sport:"football"},
 {id:"hf-minmaxxxer-top3-europe-2025-26",requiredDomains:["historical_consensus_1x2","totals","btts","asian_handicap","settled_results"],repo:"minmaxxxer/laliga-serie-a-bundesliga-closing-odds-2025-26",sport:"football"},
 {id:"hf-minmaxxxer-atp-wta-2025",requiredDomains:["historical_match_winner_probabilities","fair_closing_odds","best_available_closing_price","match_results","player_metadata"],repo:"minmaxxxer/atp-wta-closing-odds-2025",sport:"tennis"},
 {id:"hf-minmaxxxer-epl-2026-27",requiredDomains:["historical_consensus_market_lines","results"],repo:"minmaxxxer/premier-league-odds-2026-27",sport:"football"}
] as const;

function parseCsv(text:string):string[][] {
 const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;continue;}
  if(ch==='"'){quoted=true;continue;}
  if(ch===","){row.push(cell);cell="";continue;}
  if(ch==="\n"){row.push(cell.replace(/\r$/,""));cell="";if(row.some(v=>v!==""))rows.push(row);row=[];continue;}
  cell+=ch;
 }
 if(cell.length||row.length){row.push(cell.replace(/\r$/,""));if(row.some(v=>v!==""))rows.push(row);}
 return rows;
}
const number=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;};

export function isPinnedDatasetRevision(value: unknown): value is string {
 return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

const MARKET_SNAPSHOT_TIMESTAMP_FIELDS = [
 "market_snapshot_at", "closing_snapshot_at", "close_time_utc",
 "odds_timestamp_utc", "snapshot_time_utc", "last_updated_utc"
] as const;

/** Uses only a timestamp explicitly present in the source row; never substitutes retrieval or kickoff time. */
export function readSourceMarketSnapshotTimestamp(row: Record<string, unknown>) {
 let invalidField: string | null = null;
 for (const field of MARKET_SNAPSHOT_TIMESTAMP_FIELDS) {
  const value = row?.[field];
  if (value === undefined || value === null || value === "") continue;
  if (typeof value === "string" && isStrictIsoTimestamp(value)) {
   return { at: value, sourceField: field, status: "source_timestamp" as const };
  }
  invalidField ??= field;
 }
 return invalidField
  ? { at: null, sourceField: invalidField, status: "invalid_source_timestamp" as const }
  : { at: null, sourceField: null, status: "source_timestamp_not_provided" as const };
}

async function syncOne(source:typeof CONSENSUS_SOURCES[number]){
 assertProviderImportAllowed(source.id,source.requiredDomains);
 const revisionResponse=await fetch("https://huggingface.co/api/datasets/"+source.repo+"/revision/main",{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!revisionResponse.ok)throw Error("huggingface_revision_http_"+revisionResponse.status);
 const revisionPayload:any=await revisionResponse.json();
 const sourceRevision=revisionPayload?.sha;
 if(!isPinnedDatasetRevision(sourceRevision))throw Error("dataset_revision_not_pinned");
 const datasetId="consensus-"+source.id;
 const existing=await get<any>("library/model-lab/market-consensus-datasets",datasetId);
 if(existing?.sourceRevision===sourceRevision&&/^[a-f0-9]{64}$/i.test(String(existing.rawChecksum||""))&&Array.isArray(existing.records)){
  return {providerId:source.id,repository:source.repo,rows:existing.records.length,settledRows:Number(existing.settledRows||0),rawChecksum:existing.rawChecksum,sourceRevision,status:"unchanged"};
 }
 const treeRes=await fetch("https://huggingface.co/api/datasets/"+source.repo+"/tree/"+sourceRevision+"?recursive=true&expand=false",{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!treeRes.ok)throw Error("huggingface_tree_http_"+treeRes.status);
 const tree:any[]=await treeRes.json();
 const csvs=tree.filter(x=>x.type==="file"&&String(x.path).toLowerCase().endsWith(".csv")&&!String(x.path).includes("/"));
 if(csvs.length!==1)throw Error("expected_one_root_csv_found_"+csvs.length);
 const path=String(csvs[0].path),url="https://huggingface.co/datasets/"+source.repo+"/resolve/"+sourceRevision+"/"+encodeURIComponent(path);
 const response=await fetch(url,{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!response.ok)throw Error("dataset_http_"+response.status);
 const raw=await response.text();if(raw.length>8_000_000)throw Error("dataset_exceeds_8mb_guard");
 const parsed=parseCsv(raw);if(parsed.length<2)throw Error("dataset_has_no_rows");
 const headers=parsed[0].map(x=>x.replace(/^\uFEFF/,"").trim());
 const rawRows=parsed.slice(1);
 const rows=rawRows.map(cells=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]??""])));
 const first=rows[0] as any;
 const football=source.sport==="football",tennis=source.sport==="tennis";
 const required=football
  ? ["kickoff_utc","home_team","away_team","home_goals","away_goals","close_home_prob","close_draw_prob","close_away_prob"]
  : tennis
   ? ["start_time_utc","player1","player2","winner","status","close_prob1","close_fair_odds1","close_fair_odds2"]
   : ["start_time_utc","home_team","away_team","home_score","away_score","close_home_win_prob","close_spread_home","close_total"];
 const missing=required.filter(k=>!(k in first));if(missing.length)throw Error("schema_missing_"+missing.join("_"));
 const records=rows.map((r:any,index:number)=>{
  const homeScore=number(tennis?r.sets_won1:(r.home_score??r.home_goals));
  const awayScore=number(tennis?r.sets_won2:(r.away_score??r.away_goals));
  const homeTeam=String(tennis?r.player1:(r.home_team||"")).trim();
  const awayTeam=String(tennis?r.player2:(r.away_team||"")).trim();
  const eventStart=String(r.start_time_utc||r.kickoff_utc||r.date_utc||"");
  const id=String(r.game_id||r.match_id||source.id+"-"+index);
  const closeHome=number(tennis?r.close_prob1:(r.close_home_win_prob??r.close_home_prob));
  const closeAway=tennis?(closeHome===null?null:1-closeHome):number(r.close_away_prob??(closeHome!==null&&!football?1-closeHome:null));
  const moneylineWinner=tennis?(Number(r.winner)===1?"home":Number(r.winner)===2?"away":""):String(r.moneyline_winner||r.result||"");
  const completed=tennis?String(r.status).toLowerCase()==="finished"&&(Number(r.winner)===1||Number(r.winner)===2):homeScore!==null&&awayScore!==null;
  const marketSnapshot = readSourceMarketSnapshotTimestamp(r);
  return {
   id,providerId:source.id,sport:source.sport,season:String(r.season||""),
   competition:String(r.league||r.tournament||r.tour||""),
   eventStart,homeTeam,awayTeam,
   ...(tennis?{participantType:"tennis_player",participant1:homeTeam,participant2:awayTeam,tour:String(r.tour||""),surface:String(r.surface||""),tournamentCountry:String(r.tournament_country||""),rawMatchStatus:String(r.status||"")} : {}),
   homeScore,awayScore,status:completed?"completed":"unsettled",
   bookmakerCount:number(r.bookmakers),
   marketDataType:"consensus_market_lines",
   opening:{
    homeWinProbability:number(tennis?r.open_prob1:(r.open_home_win_prob??r.open_home_prob)),
    drawProbability:football?number(r.open_draw_prob):null,
    awayWinProbability:tennis?(number(r.open_prob1)===null?null:1-number(r.open_prob1)):number(r.open_away_prob??(number(r.open_home_win_prob)!==null&&!football?1-number(r.open_home_win_prob):null))
   },
   closing:{
    marketSnapshotAt:marketSnapshot.at,
    marketSnapshotTimestampSourceField:marketSnapshot.sourceField,
    marketSnapshotTimestampStatus:marketSnapshot.status,
    homeWinProbability:closeHome,
    drawProbability:football?number(r.close_draw_prob):null,
    awayWinProbability:closeAway,
    fairHomeOdds:number(tennis?r.close_fair_odds1:r.close_fair_home_odds),
    fairDrawOdds:football?number(r.close_fair_draw_odds):null,
    fairAwayOdds:number(tennis?r.close_fair_odds2:r.close_fair_away_odds),
    bestHomeOdds:tennis?number(r.best_close_odds1):null,
    bestAwayOdds:tennis?number(r.best_close_odds2):null,
    homeSpread:number(football?r.close_ah_line_home:r.close_spread_home),
    homeSpreadCoverProbability:number(football?r.close_ah_home_prob:r.close_home_cover_prob),
    totalLine:number(r.close_total),
    overProbability:number(football?r.close_over25_prob:r.close_over_prob),
    bttsYesProbability:number(r.close_btts_prob)
   },
   settlements:{
    moneylineWinner,
    spreadResult:String(r.ats_result||r.ah_result||""),
    totalResult:String(r.total_result||r.ou25_result||""),
    bttsResult:String(r.btts_result||"")
   },
   sourceUrl:url,sourceLicence:"CC-BY-4.0",licenceReference:"https://huggingface.co/datasets/"+source.repo,attribution:"Min Maxxxer via Hugging Face; CC BY 4.0.",
   retrievedAt:new Date().toISOString(),origin:"provider_historical_data",lab:"model-lab",
   rawIndex:index
  };
 }).filter(r=>r.eventStart&&r.homeTeam&&r.awayTeam);
 const checksum=createHash("sha256").update(raw).digest("hex");
 const dataset={
  id:datasetId,providerId:source.id,repository:source.repo,sourceRevision,sourceCommitUrl:"https://huggingface.co/datasets/"+source.repo+"/commit/"+sourceRevision,sport:source.sport,
  sourceUrl:url,sourceLicence:"CC-BY-4.0",licenceReference:"https://creativecommons.org/licenses/by/4.0/",
  retrievedAt:new Date().toISOString(),rawChecksum:checksum,
  totalRows:records.length,settledRows:records.filter(x=>x.status==="completed").length,
  marketDataType:"consensus_market_lines",bookmakerIdentityIncluded:false,priceType:source.sport==="tennis"?"consensus_fair_probabilities_with_unattributed_best_prices":"consensus_fair_probabilities",bestPriceAvailable:source.sport==="tennis",bestPriceBookmakerIdentityIncluded:false,
  records,origin:"provider_historical_data",lab:"model-lab",
  attribution:"Dataset by minmaxxxer, via Hugging Face. CC BY 4.0."
 };
 await put("library/model-lab/market-consensus-datasets",datasetId,dataset);
 return {providerId:source.id,repository:source.repo,rows:records.length,settledRows:dataset.settledRows,rawChecksum:checksum,sourceRevision,status:"imported"};
}

export async function syncConsensusMarketDatasets(){
 const startedAt=new Date().toISOString(),results:any[]=[],failures:any[]=[];
 for(let i=0;i<CONSENSUS_SOURCES.length;i+=3){
  const batch=await Promise.all(CONSENSUS_SOURCES.slice(i,i+3).map(async source=>{try{return {ok:true,value:await syncOne(source)};}catch(e){return {ok:false,providerId:source.id,error:String(e).slice(0,400)};}}));
  for(const item of batch){if(item.ok)results.push(item.value);else failures.push(item);}
 }
 const imported=results.filter(x=>x.status==="imported"),unchanged=results.filter(x=>x.status==="unchanged");
  const summary={id:"consensus-market-sync-"+startedAt.slice(0,10),startedAt,completedAt:new Date().toISOString(),status:results.length===CONSENSUS_SOURCES.length?"completed":results.length?"partial":"failed",datasetsChecked:results.length,datasetsImported:imported.length,datasetsUnchanged:unchanged.length,rowsImported:imported.reduce((n,x)=>n+x.rows,0),rowsAvailable:results.reduce((n,x)=>n+x.rows,0),settledRows:results.reduce((n,x)=>n+x.settledRows,0),results,failures,origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false};
 await put("library/model-lab/provider-sync-runs",summary.id,summary);
 await put("scheduler-state","consensus-market-daily-sync",{lastCheck:summary.completedAt,status:summary.status,datasetsImported:summary.datasetsImported,rowsImported:summary.rowsImported,settledRows:summary.settledRows,failures:failures.length});
 return summary;
}
export async function getConsensusMarketSyncStatus(){
 const state=await get<any>("scheduler-state","consensus-market-daily-sync");
 const [datasets,runs]=await Promise.all([list<any>("library/model-lab/market-consensus-datasets",100),list<any>("library/model-lab/provider-sync-runs",30)]);
 const latest=runs.filter(x=>String(x.id||"").startsWith("consensus-market-sync-")).sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0]||null;
 const sourceStatuses:Record<string,string>={};
 for(const x of latest?.results||[])sourceStatuses[x.providerId]=x.status||"imported";
 for(const x of latest?.failures||[])sourceStatuses[x.providerId]="failed";
 return {status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,totals:state||null,datasetCount:datasets.length,rowCount:datasets.reduce((n,d)=>n+Number(d.totalRows||0),0),settledRows:datasets.reduce((n,d)=>n+Number(d.settledRows||0),0),sourceStatuses,latestRun:latest?{id:latest.id,status:latest.status,startedAt:latest.startedAt,datasetsImported:latest.datasetsImported,rowsImported:latest.rowsImported,failures:latest.failures}:null};
}

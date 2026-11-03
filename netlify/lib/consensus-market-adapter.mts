import { createHash } from "node:crypto";
import { get, put, list } from "./store.mts";

const SOURCES = [
 {id:"hf-minmaxxxer-nfl-2026",repo:"minmaxxxer/nfl-odds-2026",sport:"american_football"},
 {id:"hf-minmaxxxer-nba-2025-26",repo:"minmaxxxer/nba-closing-lines-ats-2025-26",sport:"basketball"},
 {id:"hf-minmaxxxer-nba-2026-27",repo:"minmaxxxer/nba-odds-2026-27",sport:"basketball"},
 {id:"hf-minmaxxxer-nhl-2026-27",repo:"minmaxxxer/nhl-odds-2026-27",sport:"ice_hockey"},
 {id:"hf-minmaxxxer-epl-2025-26",repo:"minmaxxxer/premier-league-closing-odds-2025-26",sport:"football"},
 {id:"hf-minmaxxxer-epl-2026-27",repo:"minmaxxxer/premier-league-odds-2026-27",sport:"football"}
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

async function syncOne(source:typeof SOURCES[number]){
 const treeRes=await fetch("https://huggingface.co/api/datasets/"+source.repo+"/tree/main?recursive=true&expand=false",{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!treeRes.ok)throw Error("huggingface_tree_http_"+treeRes.status);
 const tree:any[]=await treeRes.json();
 const csvs=tree.filter(x=>x.type==="file"&&String(x.path).toLowerCase().endsWith(".csv")&&!String(x.path).includes("/"));
 if(csvs.length!==1)throw Error("expected_one_root_csv_found_"+csvs.length);
 const path=String(csvs[0].path),url="https://huggingface.co/datasets/"+source.repo+"/resolve/main/"+encodeURIComponent(path);
 const response=await fetch(url,{headers:{"user-agent":"WIN-ResearchEngine/1.0"}});
 if(!response.ok)throw Error("dataset_http_"+response.status);
 const raw=await response.text();if(raw.length>8_000_000)throw Error("dataset_exceeds_8mb_guard");
 const parsed=parseCsv(raw);if(parsed.length<2)throw Error("dataset_has_no_rows");
 const headers=parsed[0].map(x=>x.replace(/^\uFEFF/,"").trim());
 const rawRows=parsed.slice(1);
 const rows=rawRows.map(cells=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]??""])));
 const first=rows[0] as any;
 const football=source.sport==="football";
 const required=football?["kickoff_utc","home_team","away_team","home_goals","away_goals","close_home_prob","close_draw_prob","close_away_prob"]:["start_time_utc","home_team","away_team","home_score","away_score","close_home_win_prob","close_spread_home","close_total"];
 const missing=required.filter(k=>!(k in first));if(missing.length)throw Error("schema_missing_"+missing.join("_"));
 const records=rows.map((r:any,index:number)=>{
  const homeScore=number(r.home_score??r.home_goals),awayScore=number(r.away_score??r.away_goals);
  const id=String(r.game_id||r.match_id||source.id+"-"+index);
  return {
   id,providerId:source.id,sport:source.sport,
   eventStart:String(r.start_time_utc||r.kickoff_utc||""),
   homeTeam:String(r.home_team||""),awayTeam:String(r.away_team||""),
   homeScore,awayScore,status:homeScore!==null&&awayScore!==null?"completed":"unsettled",
   bookmakerCount:number(r.bookmakers),
   marketDataType:"consensus_market_lines",
   opening:{
    homeWinProbability:number(r.open_home_win_prob??r.open_home_prob),
    drawProbability:number(r.open_draw_prob),
    awayWinProbability:number(r.open_away_prob)
   },
   closing:{
    homeWinProbability:number(r.close_home_win_prob??r.close_home_prob),
    drawProbability:number(r.close_draw_prob),
    awayWinProbability:number(r.close_away_prob??(number(r.close_home_win_prob)!==null?1-number(r.close_home_win_prob):null)),
    fairHomeOdds:number(r.close_fair_home_odds),
    fairDrawOdds:number(r.close_fair_draw_odds),
    fairAwayOdds:number(r.close_fair_away_odds),
    homeSpread:number(r.close_spread_home??r.close_ah_line_home),
    homeSpreadCoverProbability:number(r.close_home_cover_prob??r.close_ah_home_prob),
    totalLine:number(r.close_total),
    overProbability:number(r.close_over_prob??r.close_over25_prob),
    bttsYesProbability:number(r.close_btts_prob)
   },
   settlements:{
    moneylineWinner:String(r.moneyline_winner||r.result||""),
    spreadResult:String(r.ats_result||r.ah_result||""),
    totalResult:String(r.total_result||r.ou25_result||""),
    bttsResult:String(r.btts_result||"")
   },
   sourceUrl:url,sourceLicence:"CC-BY-4.0",licenceReference:"https://creativecommons.org/licenses/by/4.0/",
   retrievedAt:new Date().toISOString(),origin:"provider_historical_data",lab:"model-lab",
   rawIndex:index
  };
 }).filter(r=>r.eventStart&&r.homeTeam&&r.awayTeam);
 const checksum=createHash("sha256").update(raw).digest("hex");
 const datasetId="consensus-"+source.id;
 const dataset={
  id:datasetId,providerId:source.id,repository:source.repo,sport:source.sport,
  sourceUrl:url,sourceLicence:"CC-BY-4.0",licenceReference:"https://creativecommons.org/licenses/by/4.0/",
  retrievedAt:new Date().toISOString(),rawChecksum:checksum,
  totalRows:records.length,settledRows:records.filter(x=>x.status==="completed").length,
  marketDataType:"consensus_market_lines",bookmakerIdentityIncluded:false,
  records,origin:"provider_historical_data",lab:"model-lab",
  attribution:"Dataset by minmaxxxer, via Hugging Face. CC BY 4.0."
 };
 await put("library/model-lab/market-consensus-datasets",datasetId,dataset);
 return {providerId:source.id,repository:source.repo,rows:records.length,settledRows:dataset.settledRows,rawChecksum:checksum,status:"imported"};
}

export async function syncConsensusMarketDatasets(){
 const startedAt=new Date().toISOString(),results:any[]=[],failures:any[]=[];
 for(const source of SOURCES){try{results.push(await syncOne(source));}catch(e){failures.push({providerId:source.id,error:String(e).slice(0,400)});}}
 const summary={id:"consensus-market-sync-"+startedAt.slice(0,10),startedAt,completedAt:new Date().toISOString(),status:results.length===SOURCES.length?"completed":results.length?"partial":"failed",datasetsImported:results.length,rowsImported:results.reduce((n,x)=>n+x.rows,0),settledRows:results.reduce((n,x)=>n+x.settledRows,0),results,failures,origin:"provider_historical_data",lab:"model-lab",humanCouponLabTouched:false};
 await put("library/model-lab/provider-sync-runs",summary.id,summary);
 await put("scheduler-state","consensus-market-daily-sync",{lastCheck:summary.completedAt,status:summary.status,datasetsImported:summary.datasetsImported,rowsImported:summary.rowsImported,settledRows:summary.settledRows,failures:failures.length});
 return summary;
}
export async function getConsensusMarketSyncStatus(){
 const state=await get<any>("scheduler-state","consensus-market-daily-sync");
 const datasets=await list<any>("library/model-lab/market-consensus-datasets",100);
 return {status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,totals:state||null,datasetCount:datasets.length,rowCount:datasets.reduce((n,d)=>n+Number(d.totalRows||0),0),settledRows:datasets.reduce((n,d)=>n+Number(d.settledRows||0),0)};
}

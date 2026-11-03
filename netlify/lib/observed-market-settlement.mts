import { createHash } from "node:crypto";
import { get, put, list } from "./store.mts";
import { createSimulationRun, executeSimulationRun } from "./simulation.mts";

const norm=(v:any)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
const aliases:Record<string,string>={"usa":"united states","us":"united states","korea republic":"south korea","republic of korea":"south korea","cote divoire":"ivory coast","cote d ivoire":"ivory coast","iran":"iran","ir iran":"iran","turkiye":"turkey","turkiye":"turkey","czechia":"czech republic","bosnia herzegovina":"bosnia and herzegovina"};
const teamKey=(v:any)=>aliases[norm(v)]||norm(v);
const validDate=(v:any)=>Number.isFinite(Date.parse(String(v||"")));
const dateShift=(date:string,days:number)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const sideFor=(selection:string,selectionType:string,home:string,away:string):"home"|"away"|"draw"|null=>{
 const s=norm(selection),t=norm(selectionType);
 if(["draw","tie","x"].includes(s)||["draw","tie"].includes(t))return "draw";
 if(["home","1"].includes(s)||["home"].includes(t))return "home";
 if(["away","2"].includes(s)||["away"].includes(t))return "away";
 if(s===teamKey(home))return "home";if(s===teamKey(away))return "away";
 return null;
};
const overUnder=(selection:string,selectionType:string):"over"|"under"|null=>{
 const s=norm(selection),t=norm(selectionType);
 if(t==="over"||s.startsWith("over"))return "over";
 if(t==="under"||s.startsWith("under"))return "under";
 return null;
};
function settleOverUnder(total:number,line:number,side:"over"|"under"){
 if(total===line)return "void" as const;
 return (side==="over"?total>line:total<line)?"won" as const:"lost" as const;
}
function scoreResult(home:number,away:number):"home"|"draw"|"away"{return home>away?"home":home<away?"away":"draw";}
function settleMarket(price:any,match:any,orientationReversed:boolean){
 const market=norm(price.providerMarketName||price.canonicalMarketId).replace(/ /g,"_");
 const selection=String(price.selection||"").trim(),selectionType=String(price.selectionType||"").trim(),line=typeof price.line==="number"?price.line:null;
 const regulation=match.fullTimeScore,half=match.halfTimeScore;
 if(!Array.isArray(regulation)||regulation.length!==2)return null;
 const home=orientationReversed?regulation[1]:regulation[0],away=orientationReversed?regulation[0]:regulation[1];
 const side=sideFor(selection,selectionType,price.homeTeam,price.awayTeam);
 if(/first_half.*(moneyline|match_winner|1x2)/.test(market)){
  if(!Array.isArray(half)||!side)return null;const h=orientationReversed?half[1]:half[0],a=orientationReversed?half[0]:half[1],actual=scoreResult(h,a);return {result:actual===side?"won":"lost",rule:"half_time_1x2",actual,selected:side};
 }
 if(/first_half.*(total_goals|goals_total)|total_goals.*first_half/.test(market)){
  if(!Array.isArray(half)||line===null)return null;const sideOU=overUnder(selection,selectionType);if(!sideOU)return null;return {result:settleOverUnder(half[0]+half[1],line,sideOU),rule:"half_time_total_goals",actual:half[0]+half[1],line,selected:sideOU};
 }
 const goals=Array.isArray(match.playerEvents?.goals)?match.playerEvents.goals:[];
 const bookings=Array.isArray(match.playerEvents?.bookings)?match.playerEvents.bookings:[];
 if(/player.*(total_goals|goals_total)/.test(market)){
  if(!match.playerEvents?.goalsAvailable||line===null)return null;const player=teamKey(selection),count=goals.filter((g:any)=>teamKey(g.player)===player).length,sideOU=overUnder(selection,selectionType);if(!player||!sideOU)return null;
  return {result:settleOverUnder(count,line,sideOU),rule:"player_total_goals",actual:count,line,selected:selection};
 }
 if(/player.*(to_score|goalscorer|anytime)|anytime.*goalscorer/.test(market)){
  if(!match.playerEvents?.goalsAvailable)return null;
  const player=teamKey(selection);if(!player)return null;
  const scored=goals.some((g:any)=>teamKey(g.player)===player);
  return {result:scored?"won":"lost",rule:"player_anytime_goalscorer",actual:scored,selected:selection};
 }
 if(/player.*(card|booked)|to_be_booked/.test(market)){
  if(!match.playerEvents?.bookingsAvailable)return null;
  const player=teamKey(selection);if(!player)return null;const booked=bookings.some((b:any)=>teamKey(b.player)===player);
  return {result:booked?"won":"lost",rule:"player_to_be_booked",actual:booked,selected:selection};
 }
 if(/team_total_goals/.test(market)){
  if(line===null)return null;const teamSide=sideFor(selection,"",price.homeTeam,price.awayTeam),sideOU=overUnder(selection,selectionType);if(!teamSide||teamSide==="draw"||!sideOU)return null;const count=teamSide==="home"?home:away;
  return {result:settleOverUnder(count,line,sideOU),rule:"team_total_goals_90min",actual:count,line,selected:teamSide};
 }
 if(/btts|both_teams_to_score/.test(market)){
  const s=norm(selection),t=norm(selectionType);const yes=["yes","both","true"].includes(s)||t==="yes",no=["no","false"].includes(s)||t==="no";if(!yes&&!no)return null;
  const actual=home>0&&away>0;return {result:actual===yes?"won":"lost",rule:"both_teams_to_score_90min",actual,selected:yes?"yes":"no"};
 }
 if(/correct_score|exact_score/.test(market)){
  const m=selection.match(/^(\d+)\s*[-:]\s*(\d+)$/);if(!m)return null;
  const a=Number(m[1]),b=Number(m[2]),targetHome=orientationReversed?b:a,targetAway=orientationReversed?a:b;
  return {result:regulation[0]===targetHome&&regulation[1]===targetAway?"won":"lost",rule:"exact_regulation_score",actual:regulation,selected:[targetHome,targetAway]};
 }
 if(/first_half.*handicap/.test(market))return null;
 if(/asian_handicap|handicap/.test(market)&&!/player/.test(market)){
  if(line===null||Math.abs(line*2-Math.round(line*2))>1e-8)return null;
  if(!side||side==="draw")return null;
  const selectedScore=side==="home"?home:away,otherScore=side==="home"?away:home,margin=selectedScore-otherScore+line;
  return {result:margin===0?"void":margin>0?"won":"lost",rule:"asian_handicap_whole_or_half_line",actualMargin:margin,line,selected:side};
 }
 if(/total_cards|cards_total/.test(market)){
  if(!match.playerEvents?.bookingsAvailable||line===null)return null;const sideOU=overUnder(selection,selectionType);if(!sideOU)return null;return {result:settleOverUnder(bookings.length,line,sideOU),rule:"total_bookings",actual:bookings.length,line,selected:sideOU};
 }
 if(/red_cards/.test(market)){
  if(!match.playerEvents?.bookingsAvailable||line===null)return null;const reds=bookings.filter((b:any)=>String(b.cardType).toUpperCase()==="R").length,sideOU=overUnder(selection,selectionType);if(!sideOU)return null;return {result:settleOverUnder(reds,line,sideOU),rule:"total_red_cards",actual:reds,line,selected:sideOU};
 }
 if(/total_goals|goals_total|over_under_goals/.test(market)){
  if(line===null)return null;const sideOU=overUnder(selection,selectionType);if(!sideOU)return null;return {result:settleOverUnder(home+away,line,sideOU),rule:"total_goals_90min",actual:home+away,line,selected:sideOU};
 }
 if(/moneyline|match_winner|match_result|1x2/.test(market)){
  if(!side)return null;const actual=scoreResult(home,away);return {result:actual===side?"won":"lost",rule:"regulation_time_1x2",actual,selected:side};
 }
 return null;
}
function hash(value:string){return createHash("sha256").update(value).digest("hex");}

export async function settleObservedWorldCupMarkets(){
 const [snapshots,eventDatasets]=await Promise.all([
  list<any>("library/model-lab/observed-market-snapshots",100),
  list<any>("library/model-lab/historical-event-datasets",1000)
 ]);
 const allPrices=snapshots.flatMap(d=>Array.isArray(d.records)?d.records:[]);
 const excluded={otherSport:allPrices.filter((p:any)=>p.sportId!=="football").length,live:allPrices.filter((p:any)=>p.sportId==="football"&&p.live).length,nonEventTimeOrPredictionMarket:allPrices.filter((p:any)=>p.sportId==="football"&&(p.eventTimeSemantics!=="scheduled_event_start"||p.bookmakerType==="prediction_market")).length,invalidTimestamps:allPrices.filter((p:any)=>p.sportId==="football"&&!validDate(p.observedAt)||p.sportId==="football"&&!validDate(p.startsAt)).length,postStartPrice:allPrices.filter((p:any)=>p.sportId==="football"&&validDate(p.observedAt)&&validDate(p.startsAt)&&Date.parse(p.observedAt)>=Date.parse(p.startsAt)).length};
 const prices=allPrices.filter((p:any)=>p.sportId==="football"&&!p.live&&p.eventTimeSemantics==="scheduled_event_start"&&p.bookmakerType!=="prediction_market"&&validDate(p.observedAt)&&validDate(p.startsAt)&&Date.parse(p.observedAt)<Date.parse(p.startsAt));
 const matches=eventDatasets.filter(d=>d.providerId==="openfootball-worldcup-json").flatMap(d=>Array.isArray(d.records)?d.records:[]);
 const matchIndex=new Map<string,any[]>();
 for(const m of matches){const key=teamKey(m.homeTeam)+"|"+teamKey(m.awayTeam);const a=matchIndex.get(key)||[];a.push(m);matchIndex.set(key,a);}
 const latest=new Map<string,any>();
 for(const p of prices){const key=[p.eventId,p.bookmakerId,p.canonicalMarketId,p.selection,p.selectionType,p.line].join("|");const old=latest.get(key);if(!old||Date.parse(p.observedAt)>Date.parse(old.observedAt))latest.set(key,p);}
 const picks:any[]=[],settledRecords:any[]=[],unmatched={no_match:0,ambiguous_match:0,unsupported_market:0,invalid_selection:0};
 for(const price of latest.values()){
  const startDate=new Date(price.startsAt).toISOString().slice(0,10),homeKey=teamKey(price.homeTeam),awayKey=teamKey(price.awayTeam);
  const candidates=[-1,0,1].flatMap(delta=>{
   const date=dateShift(startDate,delta);
   return [...(matchIndex.get(homeKey+"|"+awayKey)||[]),...(matchIndex.get(awayKey+"|"+homeKey)||[])].filter(m=>m.eventStart===date);
  });
  const unique=[...new Map(candidates.map(m=>[m.id,m])).values()];
  if(unique.length===0){unmatched.no_match++;continue;}
  if(unique.length!==1){unmatched.ambiguous_match++;continue;}
  const match=unique[0],reversed=teamKey(match.homeTeam)===awayKey&&teamKey(match.awayTeam)===homeKey;
  const settled=settleMarket(price,match,reversed);
  if(!settled){unmatched.unsupported_market++;continue;}
  const id=hash(String(price.sourceRecordId||price.eventId+"|"+price.bookmakerId+"|"+price.canonicalMarketId+"|"+price.selection));
  const pick={id,eventId:String(price.eventId),event:String(match.event||price.homeTeam+" vs "+price.awayTeam),sport:"football",competition:String(match.competition||"FIFA World Cup"),market:String(price.providerMarketName||price.canonicalMarketId),pick:String(price.selection||price.selectionName),odds:Number(price.oddsDecimal),result:settled.result,eventStart:String(price.startsAt),oddsCapturedAt:String(price.observedAt),oddsSource:String(price.bookmakerId)+" ["+String(price.bookmakerType||"unknown")+"] via SharpAPI CC BY 4.0 snapshot",resultSource:String(match.sourceUrl)};
  if(!Number.isFinite(pick.odds)||pick.odds<=1){unmatched.invalid_selection++;continue;}
  picks.push(pick);
  settledRecords.push({...pick,settlementRule:settled.rule,settlementDetails:settled,matchRecordId:match.id,matchSourceUrl:match.sourceUrl,sourceRecordId:price.sourceRecordId,providerMarketId:price.providerMarketId,bookmakerType:price.bookmakerType,marketLine:price.line,sourceLicence:"CC-BY-4.0",resultLicence:"CC0-1.0",settledAt:new Date().toISOString(),origin:"provider_historical_data",lab:"model-lab"});
 }
 const sourceHash=hash(picks.map(p=>p.id+"|"+p.result+"|"+p.odds).sort().join("\n"));
 const datasetId="sharpapi-worldcup-settled";
 await put("library/model-lab/settled-observed-markets",datasetId,{id:datasetId,providerId:"sharpapi-sample-data",sourceHash,retrievedAt:new Date().toISOString(),sourceLicence:"CC-BY-4.0",resultLicence:"CC0-1.0",attribution:"Odds data from SharpAPI (sharpapi.io), Sports Betting Odds Sample Dataset, 2026. Results joined to OpenFootball worldcup.json CC0 records.",settledSelectionCount:picks.length,uniqueEvents:new Set(picks.map(p=>p.eventId)).size,unmatched,records:settledRecords,origin:"provider_historical_data",lab:"model-lab"});
 const existing=await get<any>("library/model-lab/observed-market-settlement-runs",sourceHash);
 if(existing?.status==="completed")return {...existing,skippedDuplicate:true};
 let simulation:any=null;
 const uniqueEvents=new Set(picks.map(p=>p.eventId)).size;
 if(picks.length>=2&&uniqueEvents>=2){
  let simRun=existing?.simulationRunId?await get<any>("library/simulation-runs",existing.simulationRunId):null;
  if(!simRun||simRun.status!=="completed"){
   if(!simRun){
    const created=await createSimulationRun({selections:picks,couponCount:5000,minLegs:2,maxLegs:Math.min(5,uniqueEvents),seed:sourceHash.slice(0,24)});
    await put("library/model-lab/observed-market-settlement-runs",sourceHash,{id:sourceHash,status:"simulation_running",createdAt:new Date().toISOString(),sourceHash,settledSelections:picks.length,uniqueEvents,simulationRunId:created.id,unmatched});
    simRun=await executeSimulationRun(created.id);
   }else simRun=await executeSimulationRun(simRun.id);
  }
  simulation={id:simRun.id,status:simRun.status,summary:simRun.summary||null};
 }
 const summary={id:sourceHash,status:simulation?.status==="completed"?"completed":picks.length>=2?"settled_no_simulation":"waiting_for_more_settled_prices",createdAt:new Date().toISOString(),sourceHash,snapshotRows:allPrices.length,eligiblePreMatchRows:prices.length,excluded,settledSelections:picks.length,uniqueEvents,settledByMarket:settledRecords.reduce((a:any,r:any)=>{a[r.market]=(a[r.market]||0)+1;return a;},{}),settledByBookmaker:settledRecords.reduce((a:any,r:any)=>{a[r.oddsSource]=(a[r.oddsSource]||0)+1;return a;},{}),unmatched,simulation,simulationRunId:simulation?.id||existing?.simulationRunId||null,caveats:["Only exact normalized team matches within one calendar day are joined.","Only pre-match, non-live sportsbook/exchange quotes are eligible; prediction-market expiry rows are excluded.","Only explicitly implemented and score-verifiable markets are settled; unsupported markets are left out.","This is a single historical snapshot, not a continuous odds history.","Simulation results are retrospective random coupon combinations, not predictive validation."]};
 await put("library/model-lab/observed-market-settlement-runs",sourceHash,summary);
 await put("scheduler-state","observed-market-settlement",{lastCheck:summary.createdAt,status:summary.status,settledSelections:summary.settledSelections,uniqueEvents:summary.uniqueEvents,simulationRunId:summary.simulationRunId});
 return summary;
}
export async function getObservedMarketSettlementStatus(){
 const state=await get<any>("scheduler-state","observed-market-settlement");
 const runs=await list<any>("library/model-lab/observed-market-settlement-runs",20);
 const latest=runs.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]||null;
 const datasets=await list<any>("library/model-lab/settled-observed-markets",20);
 return {status:state?.status||"not_yet_run",lastCheck:state?.lastCheck||null,settledSelections:state?.settledSelections||0,uniqueEvents:state?.uniqueEvents||0,simulationRunId:state?.simulationRunId||null,latest,datasetCount:datasets.length};
}

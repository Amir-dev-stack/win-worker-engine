import { get, list, put } from "./store.mts";

const API = "https://api.openligadb.de";
const SOURCE_ROOT = "https://api.openligadb.de";
const BATCH_LIMIT = 30;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKBACK_WEEKS = 14;

type Match = any;
const clean=(value:unknown,max=300)=>typeof value==="string"?value.trim().slice(0,max):"";
const normalized=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const dateMs=(v:unknown)=>{const n=Date.parse(typeof v==="string"?v:"");return Number.isFinite(n)?n:0;};
function parseParticipants(event:string,leg:any){
 const home=clean(leg.homeTeam,160),away=clean(leg.awayTeam,160);
 if(home&&away)return {home,away};
 const separators=/\s+(?:vs?\.?|v\.?|@)\s+/i;
 const parts=event.split(separators);
 if(parts.length!==2)return null;
 return {home:clean(parts[0],160),away:clean(parts[1],160)};
}
function sameTeam(a:string,b:string){
 const x=normalized(a),y=normalized(b);
 return Boolean(x&&y&&(x===y||(x.length>=7&&y.length>=7&&(x.includes(y)||y.includes(x)))));
}
function eventTime(leg:any):number{
 const explicit=dateMs(leg.eventStart||leg.kickoff||leg.matchDateTimeUTC);
 if(explicit)return explicit;
 const inText=String(leg.event||"").match(/\b20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/);
 return inText?dateMs(inText[0]):0;
}
function extractFinalScore(match:Match){
 if(!match?.matchIsFinished)return null;
 const results=Array.isArray(match.matchResults)?match.matchResults:[];
 const candidates=results.filter((r:any)=>{
  const name=normalized(String(r.resultName||""));
  return Number.isFinite(Number(r.pointsTeam1))&&Number.isFinite(Number(r.pointsTeam2))&&
    (name==="endergebnis"||name==="final"||name==="full time"||name==="fulltime");
 });
 if(candidates.length!==1)return null;
 const result=candidates[0];
 return {home:Number(result.pointsTeam1),away:Number(result.pointsTeam2),resultName:clean(result.resultName,80),resultTypeId:result.resultTypeID??null};
}
function parseLine(text:string){
 const match=text.match(/(?:\+|over\s*|under\s*|o\s*|u\s*|[<>]\s*)?(\d+(?:[.,]\d+)?)/i);
 if(!match)return null;
 const value=Number(match[1].replace(",","."));return Number.isFinite(value)?value:null;
}
function evaluateLeg(leg:any,score:{home:number;away:number}):{status:string;reason:string}{
 const market=normalized(clean(leg.market,180)+" "+clean(leg.settlementRule,500));
 const pick=normalized(clean(leg.pick||leg.selection,180));
 const total=score.home+score.away;
 if(/first half|1st half|1st period|half time|halftime|1 polowa|pierwsza polowa/.test(market+" "+pick))
  return {status:"unsupported_market",reason:"The source provides a match-final score; this period-specific market needs a period score."};
 if(/both teams to score|btts|obie druzyny strzela|obie druzyny/.test(market)){
  const yes=score.home>0&&score.away>0;
  const saysYes=/\b(yes|tak)\b/.test(" "+pick),saysNo=/\b(no|nie)\b/.test(" "+pick);
  if(!saysYes&&!saysNo)return {status:"unsupported_market",reason:"BTTS pick could not be parsed safely."};
  return {status:(yes===saysYes)?"won":"lost",reason:"Settled from the verified full-time score."};
 }
 if(/over|under|total goals|liczba goli|gole/.test(market)){
  const line=parseLine(clean(leg.pick||leg.selection,180)+" "+clean(leg.market,180));
  if(line===null)return {status:"unsupported_market",reason:"Goal-total line could not be extracted."};
  const under=/under|ponizej|less than|poniżej/.test(pick)||/under|ponizej|less than/.test(market);
  const over=/over|powyzej|more than/.test(pick)||/over|powyzej|more than/.test(market);
  if(!under&&!over)return {status:"unsupported_market",reason:"Over/under direction could not be extracted."};
  const status=total===line?"void":(over?(total>line):(total<line))?"won":"lost";
  return {status,reason:"Settled from the verified full-time score and stated goal line."};
 }
 if(/1x2|match winner|moneyline|full time result|wynik meczu|zwyciezca meczu|zwycięzca meczu/.test(market)){
  const selectedHome=/\b(1|home| gospodarze|team 1)\b/.test(" "+pick)||sameTeam(pick,leg.homeTeam||"");
  const selectedAway=/\b(2|away|goście|goscie|team 2)\b/.test(" "+pick)||sameTeam(pick,leg.awayTeam||"");
  const selectedDraw=/\b(x|draw|remis)\b/.test(" "+pick);
  const result=score.home>score.away?"home":score.home<score.away?"away":"draw";
  const chosen=selectedHome?"home":selectedAway?"away":selectedDraw?"draw":null;
  if(!chosen)return {status:"unsupported_market",reason:"1X2 selection could not be mapped to home/draw/away."};
  return {status:chosen===result?"won":"lost",reason:"Settled from the verified full-time score."};
 }
 return {status:"unsupported_market",reason:"This market is not yet supported by the deterministic result adapter."};
}
async function fetchTeamMatches(team:string){
 const url=API+"/getmatchesbyteam/"+encodeURIComponent(team)+"/"+LOOKBACK_WEEKS+"/0";
 const response=await fetch(url,{headers:{"user-agent":"WIN-PostMatch-Learning/1.0","accept":"application/json"},signal:AbortSignal.timeout(10000),cache:"no-store"});
 if(!response.ok)throw new Error("openligadb_http_"+response.status);
 const payload=await response.json();
 return {url,matches:Array.isArray(payload)?payload:[]};
}
async function cachedMatches(team:string){
 const key=normalized(team).replace(/\s+/g,"-").slice(0,80);
 const cached=await get<any>("library/post-match-source-cache",key);
 if(cached&&Date.now()-dateMs(cached.fetchedAt)<CACHE_TTL_MS)return cached;
 const fetched=await fetchTeamMatches(team);
 const record={id:key,providerId:"openligadb",queryTeam:team,sourceUrl:fetched.url,fetchedAt:new Date().toISOString(),matches:fetched.matches};
 await put("library/post-match-source-cache",key,record);
 return record;
}
function matchForLeg(matches:Match[],leg:any){
 const participants=parseParticipants(clean(leg.event,250),leg);
 const when=eventTime(leg);
 if(!participants)return {status:"unresolved",reason:"Event needs separate home and away team names; automatic match identity was not safe."};
 if(!when)return {status:"unresolved",reason:"No exact kickoff date/time was saved with this coupon leg; repeated fixtures cannot be disambiguated safely."};
 const matchesByIdentity=matches.filter(m=>{
  const one=clean(m?.team1?.teamName,160),two=clean(m?.team2?.teamName,160);
  const direct=sameTeam(one,participants.home)&&sameTeam(two,participants.away);
  const reverse=sameTeam(one,participants.away)&&sameTeam(two,participants.home);
  const matchTime=dateMs(m?.matchDateTimeUTC||m?.matchDateTime);
  return (direct||reverse)&&matchTime>0&&Math.abs(matchTime-when)<=36*60*60*1000;
 });
 if(matchesByIdentity.length!==1)return {status:"unresolved",reason:matchesByIdentity.length?"Multiple result records match the teams and kickoff date.":"No exact team/date fixture was found in OpenLigaDB."};
 const match=matchesByIdentity[0],final=extractFinalScore(match);
 if(!match.matchIsFinished||!final)return {status:"awaiting_result",reason:"A unique fixture was found, but the source has not published an unambiguous final score.",matchId:match.matchID,matchUrl:SOURCE_ROOT+"/getmatchdata/"+match.matchID};
 const one=clean(match?.team1?.teamName,160),two=clean(match?.team2?.teamName,160);
 const legOutcome=evaluateLeg({...leg,homeTeam:one,awayTeam:two},final);
 return {
  ...legOutcome,matchId:match.matchID,matchDateTimeUTC:match.matchDateTimeUTC||match.matchDateTime,
  homeTeam:one,awayTeam:two,homeScore:final.home,awayScore:final.away,
  resultLabel:final.resultName,sourceUrl:SOURCE_ROOT+"/getmatchdata/"+match.matchID,
  sourceApiUrl:SOURCE_ROOT+"/getmatchdata/"+match.matchID,sourceProvider:"OpenLigaDB",
  sourceRetrievedAt:new Date().toISOString(),verifiedEventIdentity:true
 };
}
function historicalDatasetResult(datasets:any[],leg:any,sport:string){
 const participants=parseParticipants(clean(leg.event,250),leg),when=eventTime(leg);
 if(!participants||!when)return {status:"unresolved",reason:"Historical data lookup requires exact home/away teams and a saved event date."};
 const candidates:any[]=[];
 for(const dataset of datasets){
  if(normalized(clean(dataset.sport,80))!==normalized(sport))continue;
  for(const row of Array.isArray(dataset.records)?dataset.records:[]){
   const one=clean(row.homeTeam||row.participant1,160),two=clean(row.awayTeam||row.participant2,160);
   const direct=sameTeam(one,participants.home)&&sameTeam(two,participants.away);
   const reverse=sameTeam(one,participants.away)&&sameTeam(two,participants.home);
   const t=dateMs(row.eventStart);
   if((direct||reverse)&&t&&Math.abs(t-when)<=36*60*60*1000)candidates.push({dataset,row,direct});
  }
 }
 if(candidates.length!==1)return {status:"unresolved",reason:candidates.length?"Multiple historical rows match this event; no result was selected.":"No exact event was found in imported public historical datasets."};
 const {dataset,row,direct}=candidates[0];
 if(row.status!=="completed"||!Number.isFinite(Number(row.homeScore))||!Number.isFinite(Number(row.awayScore)))
  return {status:"awaiting_result",reason:"The exact historical event row exists but it has no completed score."};
 let outcome:any=null,reason="Settled from an exact completed historical event row.";
 const market=normalized(clean(leg.market,180)+" "+clean(leg.settlementRule,500));
 const pickRaw=clean(leg.pick||leg.selection,180).toLowerCase();
 const pick=normalized(pickRaw);
 const settlement=row.settlements||{};
 if(/spread|handicap|puck line|run line|asian handicap/.test(market)){
  const side=/\b(away|2)\b/.test(" "+pick)||sameTeam(pick,participants.away)?"away":/\b(home|1)\b/.test(" "+pick)||sameTeam(pick,participants.home)?"home":null;
  if(side&&["home","away","push"].includes(String(settlement.spreadResult)))outcome=settlement.spreadResult==="push"?"void":((direct?settlement.spreadResult:(settlement.spreadResult==="home"?"away":"home"))===side?"won":"lost");
 }else if(/over|under|total|totals|total goals|liczba goli/.test(market)){
  const direction=/over|powyzej|more than|^\+/.test(pickRaw)?"over":/under|ponizej|less than|^[-–−]/.test(pickRaw)?"under":null;
  const settled=String(settlement.totalResult||"").toLowerCase();
  if(direction&&["over","under","push"].includes(settled))outcome=settled==="push"?"void":(settled===direction?"won":"lost");
 }else if(/both teams to score|btts/.test(market)){
  const direction=/\b(yes|tak)\b/.test(" "+pick)?"yes":/\b(no|nie)\b/.test(" "+pick)?"no":null;
  const settled=String(settlement.bttsResult||"").toLowerCase();
  if(direction&&["yes","no"].includes(settled))outcome=settled===direction?"won":"lost";
 }else if(/1x2|moneyline|match winner|winner|match result|wynik meczu/.test(market)){
  const side=/\b(1|home)\b/.test(" "+pick)||sameTeam(pick,participants.home)?"home":/\b(2|away)\b/.test(" "+pick)||sameTeam(pick,participants.away)?"away":/\b(x|draw|remis)\b/.test(" "+pick)?"draw":null;
  const settled=String(settlement.moneylineWinner||"").toLowerCase();
  if(side&&["home","away","draw"].includes(settled)){
   const normalizedSide=direct?settled:settled==="home"?"away":settled==="away"?"home":"draw";
   outcome=side===normalizedSide?"won":"lost";
  }else{
   const score=evaluateLeg({...leg,homeTeam:direct?participants.home:participants.away,awayTeam:direct?participants.away:participants.home}, {home:Number(row.homeScore),away:Number(row.awayScore)});
   if(["won","lost","void"].includes(score.status))outcome=direct?score.status:(score.status==="won"?"lost":"won");
  }
 }
 const url=clean(row.sourceUrl||dataset.sourceUrl||dataset.repositoryUrl,1500);
 if(!outcome)return {status:"unsupported_market",reason:"The event result is confirmed, but this market does not have an applicable settlement field in the imported dataset.",matchId:row.id,homeTeam:clean(row.homeTeam||row.participant1,160),awayTeam:clean(row.awayTeam||row.participant2,160),homeScore:Number(row.homeScore),awayScore:Number(row.awayScore),sourceUrl:url,sourceProvider:dataset.providerId||"historical_open_dataset"};
 return {
  status:outcome,reason,matchId:row.id,matchDateTimeUTC:row.eventStart,
  homeTeam:clean(row.homeTeam||row.participant1,160),awayTeam:clean(row.awayTeam||row.participant2,160),
  homeScore:Number(row.homeScore),awayScore:Number(row.awayScore),sourceUrl:url,
  sourceProvider:dataset.providerId||"historical_open_dataset",sourceLicence:dataset.sourceLicence||null,
  sourceRetrievedAt:dataset.retrievedAt||null,verifiedEventIdentity:true
 };
}
function aggregateOutcome(legs:any[]){
 if(!legs.length||legs.some(x=>!["won","lost","void"].includes(x.status)))return "pending";
 if(legs.every(x=>x.status==="won"))return "won";
 if(legs.some(x=>x.status==="lost"))return "lost";
 if(legs.every(x=>x.status==="void"))return "void";
 return "partial";
}
async function saveLossLesson(coupon:any,leg:any,index:number){
 const id="post-match-diagnostic-"+coupon.id+"-"+index;
 if(await get<any>("library/lessons",id))return id;
 const lesson={
  id,recordType:"post_match_diagnostic_candidate",title:"Post-match review: "+clean(leg.event,200),
  sport:coupon.sport||"football",competition:coupon.competition||null,outcome:"lost",
  couponId:coupon.id,runId:coupon.runId||null,market:leg.market,pick:leg.pick||leg.selection,
  predictionOdds:leg.odds,actualScore:String(leg.homeScore)+"-"+String(leg.awayScore),
  observation:"A completed match score was found in a public source and this selection is recorded as a loss candidate. The match identity and market settlement still require independent review; the cause of the miss is not established by the score alone.",
  note:"Review questions (hypotheses, not conclusions): Was the pre-match team/player availability correct? Was recent form representative? Did the chosen market and line fit the evidence? Was price movement or lineup news missed? Was this leg correlated with other coupon legs?",
  validationStatus:"candidate_for_validation",evidence:[{type:"final_score",url:leg.sourceUrl,retrievedAt:leg.sourceRetrievedAt}],
  createdAt:new Date().toISOString(),submitterCredentialId:"owner-internal-token"
 };
 await put("library/lessons",id,lesson);
 const caseId="post-match-lesson-review-"+coupon.id+"-"+index;
 await put("library/lesson-review-cases",caseId,{
  id:caseId,lessonId:id,reviewStatus:"pending_independent_review",evidence:lesson.evidence,
  submittedAt:lesson.createdAt,submittedBy:"post_match_followup",submitterCredentialId:"owner-internal-token",
  independentReviewerRequired:true,outcomeApplied:false,
  guardrails:["Only the final result is established. Causal explanations remain hypotheses until independently corroborated."]
 });
 return id;
}
async function processCoupon(coupon:any,historicalDatasets:any[]){
 const followupId="post-match-"+coupon.id;
 const current=await get<any>("library/post-match-followups",followupId);
 if(current?.status==="review_submitted"||current?.status==="independently_reviewed"||current?.status==="review_rejected")return {status:current.status,legs:current.legs||[]};
 const selections=Array.isArray(coupon.selections)?coupon.selections:[];
 const legs=[];
 for(let i=0;i<selections.length;i++){
  const leg=selections[i],existing=current?.legs?.[i];
  if(existing&&["won","lost","void","unsupported_market"].includes(existing.status)){legs.push(existing);continue;}
  const sport=normalized(coupon.sport||"");
  try{
   const participants=parseParticipants(clean(leg.event,250),leg);
   if(!participants){legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,status:"unresolved",reason:"Could not parse the home/away teams.",checkedAt:new Date().toISOString()});continue;}
   let settled:any;
   if(sport==="football"||sport.includes("soccer")){
    const source=await cachedMatches(participants.home);
    settled=matchForLeg(source.matches,{...leg,homeTeam:participants.home,awayTeam:participants.away});
    if(settled.status==="unresolved"||settled.status==="awaiting_result"||settled.status==="source_error"||settled.status==="unsupported_market"){
     const historical=historicalDatasetResult(historicalDatasets,leg,coupon.sport||"football");
     if(historical.status==="won"||historical.status==="lost"||historical.status==="void"||historical.status==="unsupported_market")settled=historical;
    }
   }else{
    settled=historicalDatasetResult(historicalDatasets,leg,coupon.sport||"");
   }
   legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,odds:leg.odds,...settled,checkedAt:new Date().toISOString()});
  }catch(error){
   legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,status:"source_error",reason:String(error).slice(0,240),checkedAt:new Date().toISOString()});
  }
 }
 const outcome=aggregateOutcome(legs);
 const lost=legs.filter(x=>x.status==="lost");
 const lessonIds=[];
 for(const [idx,leg] of lost.entries())lessonIds.push(await saveLossLesson(coupon,leg,leg.index||idx+1));
 const status=outcome==="pending"?"partial_results":outcome==="won"||outcome==="lost"||outcome==="void"||outcome==="partial"?"awaiting_independent_review":"partial_results";
 const sources=[...new Set(legs.map(x=>x.sourceUrl).filter(Boolean))];
 const record={
  id:followupId,couponId:coupon.id,runId:coupon.runId||null,origin:"win",
  status,outcome,legs,lessonCandidateIds:lessonIds,sourceUrls:sources,
  reviewedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  placementStatus:coupon.executionStatus||"not_placed_by_WIN",
  caveat:"WIN research-coupon results are hypothetical forecasts unless the user separately confirms a real placed ticket. Automated result matching is limited to supported source coverage and market rules."
 };
 await put("library/post-match-followups",followupId,record);
 if(["won","lost","void","partial"].includes(outcome)){
  const reviewCaseId="win-coupon-review-"+coupon.id;
  if(!(await get<any>("library/win-post-match-review-cases",reviewCaseId))){
   await put("library/win-post-match-review-cases",reviewCaseId,{
    id:reviewCaseId,caseType:"win_coupon",couponId:coupon.id,claimedOutcome:outcome,
    sourceUrls:sources,legs,lessonCandidateIds:lessonIds,
    reviewStatus:"pending_independent_review",submitterCredentialId:"owner-internal-token",
    submittedAt:new Date().toISOString(),outcomeApplied:false,
    guardrails:["WIN-generated coupon outcomes are not final until a separate reviewer corroborates every match and settlement rule.","A different evidence host is required."]
   });
  }
  record.status="review_submitted";
  await put("library/post-match-followups",followupId,record);
 }
 return {status:record.status,outcome,legs:legs.length,lostLegs:lost.length,lessonCandidates:lessonIds.length};
}
export async function runPostMatchFollowups(){
 const startedAt=new Date().toISOString();
 const [allCoupons,historicalDatasets]=await Promise.all([
  list<any>("library/coupons",1000),
  list<any>("library/model-lab/market-consensus-datasets",100)
 ]);
 const coupons=allCoupons.filter(x=>
  x.origin==="win"&&x.outcome==="pending"&&Array.isArray(x.selections)&&x.selections.length>0
 ).sort((a,b)=>dateMs(a.createdAt)-dateMs(b.createdAt)).slice(0,BATCH_LIMIT);
 const summaries:any[]=[];
 for(const coupon of coupons){
  try{summaries.push({couponId:coupon.id,...await processCoupon(coupon,historicalDatasets)});
  catch(error){summaries.push({couponId:coupon.id,status:"failed",error:String(error).slice(0,240)});}
 }
 const runs=await list<any>("library/post-match-runs",30);
 const summary={
  id:"post-match-run-"+startedAt.slice(0,19).replace(/[^0-9]/g,""),
  startedAt,completedAt:new Date().toISOString(),status:summaries.some(x=>x.status==="failed")?"partial":"completed",
  couponsChecked:summaries.length,resolved:summaries.filter(x=>x.status==="review_submitted").length,
  unresolved:summaries.filter(x=>x.status==="partial_results").length,
  failed:summaries.filter(x=>x.status==="failed").length,results:summaries,
  provider:"OpenLigaDB + imported open historical datasets",apiCallsMade:"bounded by unique home-team cache",
  aiCalls:0,automaticBetting:false
 };
 await put("library/post-match-runs",summary.id,summary);
 await put("scheduler-state","post-match-followup",{lastCheck:summary.completedAt,status:summary.status,couponsChecked:summary.couponsChecked,resolved:summary.resolved,unresolved:summary.unresolved,failed:summary.failed});
 return summary;
}
export async function getPostMatchFollowupStatus(){
 const [state,runs,followups]=await Promise.all([
  get<any>("scheduler-state","post-match-followup"),
  list<any>("library/post-match-runs",30),
  list<any>("library/post-match-followups",1000)
 ]);
 const latest=runs.sort((a,b)=>dateMs(b.startedAt)-dateMs(a.startedAt))[0]||null;
 return {
  lastCheck:state?.lastCheck||null,status:state?.status||"not_yet_run",latestRun:latest,
  totalCoupons:followups.length,
  awaitingIndependentReview:followups.filter(x=>x.status==="review_submitted").length,
  reviewRejected:followups.filter(x=>x.status==="review_rejected").length,
  partialOrUnresolved:followups.filter(x=>x.status==="partial_results").length,
  wins:followups.filter(x=>x.status==="independently_reviewed"&&x.outcome==="won").length,
  losses:followups.filter(x=>x.status==="independently_reviewed"&&x.outcome==="lost").length,
  recent:followups.sort((a,b)=>dateMs(b.updatedAt)-dateMs(a.updatedAt)).slice(0,20).map(x=>({
   id:x.id,couponId:x.couponId,status:x.status,outcome:x.outcome,
   legCount:(x.legs||[]).length,lostLegs:(x.legs||[]).filter((l:any)=>l.status==="lost").length,
   updatedAt:x.updatedAt,legs:x.legs,lessonCandidateIds:x.lessonCandidateIds
  })),
  limitations:["OpenLigaDB powers live public football result checks; imported historical market datasets extend exact-match checks to some other sports.","Only explicit completed scores, exact team/date matches and supported settlement fields are evaluated.","Period-specific markets, missing kickoff data and ambiguous or unsupported events stay unresolved.","Cause analysis is a hypothesis list, never a score-only causal claim."],
  aiCalls:0
 };
}

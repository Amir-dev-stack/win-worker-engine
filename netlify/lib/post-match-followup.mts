import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";

const API = "https://api.openligadb.de";
const SOURCE_ROOT = "https://api.openligadb.de";
const BATCH_LIMIT = 30;
const SEARCH_LIMIT_PER_RUN = 30;
const RESULT_TEAM_LOOKUP_LIMIT_PER_RUN = 30;
const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
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
 const explicit=dateMs(leg.startTime||leg.eventStart||leg.kickoff||leg.matchDateTimeUTC);
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
function xmlText(value:string){
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/<[^>]+>/g," ")
  .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
  .replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/\s+/g," ").trim();
}
function rssValue(item:string,tag:string){
 const match=item.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)</"+tag+">","i"));
 return match?xmlText(match[1]):"";
}
function googleMode(){
 return Netlify.env.get("GOOGLE_CSE_API_KEY")?.trim()&&Netlify.env.get("GOOGLE_CSE_ID")?.trim()
  ?"google_programmable_search_api":"google_news_rss_public_fallback";
}
function resultSearchQuery(leg:any){
 const participants=parseParticipants(clean(leg.event,250),leg);
 const when=eventTime(leg);
 const date=when?new Date(when).toISOString().slice(0,10):"";
 const teams=participants?'"'+participants.home+'" "'+participants.away+'"':clean(leg.event,250);
 return [teams,date,"match result final score"].filter(Boolean).join(" ");
}
async function searchGoogleResultLeads(leg:any,budget:{remaining:number}){
 const query=resultSearchQuery(leg);
 if(!query||budget.remaining<=0)return {mode:googleMode(),query,leads:[],checkedAt:null,searchStatus:"skipped",skipped:"per_run_search_limit"};
 const cacheKey=createHash("sha256").update(query.toLowerCase()).digest("hex").slice(0,32);
 const cached=await get<any>("library/post-match-search-cache",cacheKey);
 if(cached&&Date.now()-dateMs(cached.checkedAt)<SEARCH_CACHE_TTL_MS)
  return {...cached,cacheHit:true};
 budget.remaining--;
 const checkedAt=new Date().toISOString(),mode=googleMode();
 try{
  let leads:any[]=[];
  if(mode==="google_programmable_search_api"){
   const key=Netlify.env.get("GOOGLE_CSE_API_KEY")?.trim()||"";
   const cx=Netlify.env.get("GOOGLE_CSE_ID")?.trim()||"";
   const url="https://customsearch.googleapis.com/customsearch/v1?key="+encodeURIComponent(key)+
    "&cx="+encodeURIComponent(cx)+"&q="+encodeURIComponent(query)+"&num=5";
   const response=await fetch(url,{headers:{"user-agent":"WIN-PostMatch-Learning/1.0","accept":"application/json"},signal:AbortSignal.timeout(10000),cache:"no-store"});
   if(!response.ok)throw new Error("google_cse_http_"+response.status);
   const payload:any=await response.json();
   leads=(Array.isArray(payload.items)?payload.items:[]).slice(0,5).flatMap((item:any)=>{
    const url=clean(item.link,1500);
    if(!/^https:\/\//i.test(url))return [];
    return [{title:clean(item.title,240),url,snippet:clean(item.snippet,600),publishedAt:null,
      sourceName:clean(item.displayLink,160),leadOnly:true,settlementEvidence:false}];
   });
  }else{
   const url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=en-US&gl=US&ceid=US:en";
   const response=await fetch(url,{headers:{"user-agent":"WIN-PostMatch-Learning/1.0","accept":"application/rss+xml, application/xml, text/xml"},signal:AbortSignal.timeout(10000),cache:"no-store"});
   if(!response.ok)throw new Error("google_news_rss_http_"+response.status);
   const xml=await response.text();
   leads=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,5).flatMap((match:any)=>{
    const item=String(match[1]||"");
    const url=rssValue(item,"link");
    if(!/^https:\/\//i.test(url))return [];
    return [{title:rssValue(item,"title"),url,snippet:rssValue(item,"description").slice(0,600),
      publishedAt:rssValue(item,"pubDate")||null,sourceName:rssValue(item,"source")||null,
      leadOnly:true,settlementEvidence:false}];
   });
  }
  const result={query,mode,leads,checkedAt,cacheHit:false,searchStatus:"completed",
   limitation:"Google results are discovery leads only. They do not establish event identity, score or market settlement."};
  await put("library/post-match-search-cache",cacheKey,result);
  return result;
 }catch(error){
  const result={query,mode,leads:[],checkedAt,cacheHit:false,searchStatus:"failed",
   error:String(error).replace(/key=[^&\s]+/gi,"key=[REDACTED]").slice(0,240),
   limitation:"No Google result lead was retrieved. A search failure is not evidence that the event did not occur."};
  await put("library/post-match-search-cache",cacheKey,result);
  return result;
 }
}
async function fetchTeamMatches(team:string){
 const url=API+"/getmatchesbyteam/"+encodeURIComponent(team)+"/"+LOOKBACK_WEEKS+"/0";
 const response=await fetch(url,{headers:{"user-agent":"WIN-PostMatch-Learning/1.0","accept":"application/json"},signal:AbortSignal.timeout(10000),cache:"no-store"});
 if(!response.ok)throw new Error("openligadb_http_"+response.status);
 const payload=await response.json();
 return {url,matches:Array.isArray(payload)?payload:[]};
}
async function cachedMatches(team:string,budget:{remaining:number}){
 const key=normalized(team).replace(/\s+/g,"-").slice(0,80);
 const cached=await get<any>("library/post-match-source-cache",key);
 if(cached&&Date.now()-dateMs(cached.fetchedAt)<CACHE_TTL_MS)return cached;
 if(budget.remaining<=0)throw new Error("openligadb_per_run_query_limit_reached");
 budget.remaining--;
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
 const sourceRun=coupon.runId?await get<any>("runs",coupon.runId):null;
 const preMatchReports=(sourceRun?.workers||[]).filter((report:any)=>
  ["D1","D2","D3","D4","D6","D8"].includes(report.departmentId)
 ).map((report:any)=>({
  departmentId:report.departmentId,role:clean(report.role,180),status:report.status,
  report:clean(report.report,5000),citations:(Array.isArray(report.citations)?report.citations:[]).slice(0,20)
 }));
 const lesson={
  id,recordType:"post_match_diagnostic_candidate",title:"Post-match review: "+clean(leg.event,200),
  sport:coupon.sport||"football",competition:coupon.competition||null,outcome:"lost",
  couponId:coupon.id,runId:coupon.runId||null,market:leg.market,pick:leg.pick||leg.selection,
  predictionOdds:leg.odds,actualScore:String(leg.homeScore)+"-"+String(leg.awayScore),
  matchResult:{homeTeam:leg.homeTeam,awayTeam:leg.awayTeam,homeScore:leg.homeScore,awayScore:leg.awayScore,
   eventStart:leg.matchDateTimeUTC||null,sourceProvider:leg.sourceProvider||null,sourceUrl:leg.sourceUrl||null},
  preMatchReports,
  searchLeads:Array.isArray(leg.searchLeads)?leg.searchLeads:[],
  observation:"A completed match score was found in a public source and this selection is recorded as a loss candidate. The stored pre-match department reports are attached for comparison. The cause of the miss is not established by the score alone.",
  note:preMatchReports.length
   ?"Compare the stored D1/D2/D3/D4/D6/D8 pre-match reports with the confirmed result and any independent match facts. Record only concrete discrepancies: an incorrect availability assumption, stale form sample, tactical mismatch, market/period interpretation, probability or price error, or correlated exposure. These are investigation prompts, not findings."
   :"No archived pre-match department reports were available for this run. Do not infer why the selection lost; collect independent event facts before proposing any change.",
  diagnosticChecklist:[
   "Compare the actual fixture, kickoff, participants and event status with D1 scouting.",
   "Check whether D2 used correct lineups, injuries, suspensions, recent form and matchup facts.",
   "Compare D3's exact market, period, line and settlement rule with the actual selection.",
   "Check D4's sample size, probability assumptions, price and uncertainty.",
   "Check D6's correlation, common-cause risks and alternative construction.",
   "Check D8's evidence integrity and unverified assumptions.",
   "State a specific proposed change only when pre-match and independent post-match sources support it."
  ],
  validationStatus:"candidate_for_validation",evidence:[{type:"final_score",url:leg.sourceUrl,retrievedAt:leg.sourceRetrievedAt}],
  createdAt:new Date().toISOString(),submitterCredentialId:"owner-internal-token"
 };
 await put("library/lessons",id,lesson);
 // A diagnostic candidate is not sent for causal review until the coupon outcome itself
 // has passed separate review. The outcome reviewer will create the second-stage case.
 return id;
}
async function processCoupon(coupon:any,historicalDatasets:any[],searchBudget:{remaining:number},resultBudget:{remaining:number}){
 const followupId="post-match-"+coupon.id;
 const current=await get<any>("library/post-match-followups",followupId);
 if(current?.status==="review_submitted"||current?.status==="independently_reviewed"||current?.status==="review_rejected")return {status:current.status,legs:current.legs||[]};
 const selections=Array.isArray(coupon.selections)?coupon.selections:[];
 const legs=[];
 for(let i=0;i<selections.length;i++){
  const leg=selections[i],existing=current?.legs?.[i];
  if(existing&&["won","lost","void","unsupported_market"].includes(existing.status)){
   const cachedSearch=existing.searchCheckedAt&&Date.now()-dateMs(existing.searchCheckedAt)<SEARCH_CACHE_TTL_MS
    ?{query:existing.searchQuery||null,mode:existing.searchMode||googleMode(),leads:existing.searchLeads||[],checkedAt:existing.searchCheckedAt,searchStatus:existing.searchStatus||"cached"}
    :await searchGoogleResultLeads(leg,searchBudget);
   legs.push({...existing,searchQuery:cachedSearch.query,searchMode:cachedSearch.mode,
    searchLeads:cachedSearch.leads||[],searchCheckedAt:cachedSearch.checkedAt,searchStatus:cachedSearch.searchStatus||"cached"});
   continue;
  }
  const sport=normalized(coupon.sport||"");
  try{
   const participants=parseParticipants(clean(leg.event,250),leg);
   if(!participants){
    const search=await searchGoogleResultLeads(leg,searchBudget);
    legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,
     status:"unresolved",reason:"Could not parse separate home/away teams; Google results remain discovery leads only.",
     searchQuery:search.query,searchMode:search.mode,searchLeads:search.leads||[],
     searchCheckedAt:search.checkedAt,searchStatus:search.searchStatus||"not_run",checkedAt:new Date().toISOString()});
    continue;
   }
   let settled:any;
   if(sport==="football"||sport.includes("soccer")){
    const source=await cachedMatches(participants.home,resultBudget);
    settled=matchForLeg(source.matches,{...leg,homeTeam:participants.home,awayTeam:participants.away});
    if(settled.status==="unresolved"||settled.status==="awaiting_result"||settled.status==="source_error"||settled.status==="unsupported_market"){
     const historical=historicalDatasetResult(historicalDatasets,leg,coupon.sport||"football");
     if(historical.status==="won"||historical.status==="lost"||historical.status==="void"||historical.status==="unsupported_market")settled=historical;
    }
   }else{
    settled=historicalDatasetResult(historicalDatasets,leg,coupon.sport||"");
   }
   const search=await searchGoogleResultLeads(leg,searchBudget);
   legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,odds:leg.odds,
    startTime:leg.startTime||leg.eventStart||null,eventId:leg.eventId||null,
    homeTeam:participants.home,awayTeam:participants.away,
    ...settled,searchQuery:search.query,searchMode:search.mode,searchLeads:search.leads||[],
    searchCheckedAt:search.checkedAt,searchStatus:search.searchStatus||"not_run",checkedAt:new Date().toISOString()});
  }catch(error){
   const search=await searchGoogleResultLeads(leg,searchBudget);
   legs.push({index:i+1,event:leg.event,market:leg.market,pick:leg.pick||leg.selection,
    status:"source_error",reason:String(error).slice(0,240),searchQuery:search.query,
    searchMode:search.mode,searchLeads:search.leads||[],searchCheckedAt:search.checkedAt,
    searchStatus:search.searchStatus||"not_run",checkedAt:new Date().toISOString()});
  }
 }
 const outcome=aggregateOutcome(legs);
 const lost=legs.filter(x=>x.status==="lost");
 const lessonIds=[];
 for(const [idx,leg] of lost.entries())lessonIds.push(await saveLossLesson(coupon,leg,leg.index||idx+1));
 const status=["won","lost","void","partial"].includes(outcome)?"awaiting_independent_review":"partial_results";
 const sources=[...new Set(legs.map((x:any)=>x.sourceUrl)
  .filter((x:any)=>typeof x==="string"&&/^https:\/\//i.test(x)))];
 const searchLeads=legs.flatMap((x:any)=>Array.isArray(x.searchLeads)?x.searchLeads.map((lead:any)=>({
  legIndex:x.index,event:x.event,market:x.market,pick:x.pick,...lead
 })):[]).slice(0,150);
 const record={
  id:followupId,couponId:coupon.id,runId:coupon.runId||null,origin:"win",
  status,outcome,legs,lessonCandidateIds:lessonIds,sourceUrls:sources,searchLeads,
  reviewedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  placementStatus:coupon.executionStatus||"not_placed_by_WIN",
  caveat:"WIN research-coupon results are hypothetical forecasts unless the user separately confirms a real placed ticket. Automated result matching is limited to supported source coverage and market rules."
 };
 await put("library/post-match-followups",followupId,record);
 const reviewCaseId="win-coupon-review-"+coupon.id;
 const priorReviewCase=await get<any>("library/win-post-match-review-cases",reviewCaseId);
 const reviewCase={
  ...(priorReviewCase||{}),id:reviewCaseId,caseType:"win_coupon",couponId:coupon.id,
  claimedOutcome:outcome,sourceUrls:sources,legs,lessonCandidateIds:lessonIds,
  reviewStatus:"pending_independent_review",submitterCredentialId:"owner-internal-token",
  submittedAt:priorReviewCase?.submittedAt||new Date().toISOString(),outcomeApplied:false,
  searchMode:googleMode(),
  guardrails:["Google results are discovery leads, not score evidence.","Automated scores are provisional until a separate reviewer corroborates event identity, market rules and every leg.","Unsupported or ambiguous markets must be resolved from independent settlement evidence, never guessed."]
 };
 await put("library/win-post-match-review-cases",reviewCaseId,reviewCase);
 record.status="review_submitted";
 await put("library/post-match-followups",followupId,record);
 return {status:record.status,outcome,legs:legs.length,lostLegs:lost.length,
  lessonCandidates:lessonIds.length,googleLeadsFound:searchLeads.length};
}
export async function runPostMatchFollowups(){
 const startedAt=new Date().toISOString();
 const searchBudget={remaining:SEARCH_LIMIT_PER_RUN};
 const resultBudget={remaining:RESULT_TEAM_LOOKUP_LIMIT_PER_RUN};
 const [allCoupons,historicalDatasets]=await Promise.all([
  list<any>("library/coupons",1000),
  list<any>("library/model-lab/market-consensus-datasets",100)
 ]);
 const coupons=allCoupons.filter(x=>
  x.origin==="win"&&x.outcome==="pending"&&Array.isArray(x.selections)&&x.selections.length>0
 ).sort((a,b)=>dateMs(a.createdAt)-dateMs(b.createdAt)).slice(0,BATCH_LIMIT);
 const summaries:any[]=[];
 for(const coupon of coupons){
  try{summaries.push({couponId:coupon.id,...await processCoupon(coupon,historicalDatasets,searchBudget,resultBudget)});
  }catch(error){summaries.push({couponId:coupon.id,status:"failed",error:String(error).slice(0,240)});}
 }
 const runs=await list<any>("library/post-match-runs",30);
 const summary={
  id:"post-match-run-"+startedAt.slice(0,19).replace(/[^0-9]/g,""),
  startedAt,completedAt:new Date().toISOString(),status:summaries.some(x=>x.status==="failed")?"partial":"completed",
  couponsChecked:summaries.length,
  resolved:summaries.filter(x=>["won","lost","void","partial"].includes(x.outcome)).length,
  queuedForReview:summaries.filter(x=>x.status==="review_submitted").length,
  unresolved:summaries.filter(x=>x.outcome==="pending"||x.status==="partial_results").length,
  failed:summaries.filter(x=>x.status==="failed").length,results:summaries,
  googleLeadsFound:summaries.reduce((n:number,x:any)=>n+Number(x.googleLeadsFound||0),0),
  provider:"OpenLigaDB + imported open historical datasets",
  googleSearchMode:googleMode(),googleQueriesRemaining:searchBudget.remaining,
  googleSearchQueriesUsed:SEARCH_LIMIT_PER_RUN-searchBudget.remaining,
  openLigaDbQueriesRemaining:resultBudget.remaining,
  openLigaDbQueriesUsed:RESULT_TEAM_LOOKUP_LIMIT_PER_RUN-resultBudget.remaining,
  googleSearchConfigured:googleMode()==="google_programmable_search_api",
  apiCallsMade:"bounded by cached team-result lookups and a maximum of "+SEARCH_LIMIT_PER_RUN+" Google discovery queries",
  aiCalls:0,automaticBetting:false
 };
 await put("library/post-match-runs",summary.id,summary);
 await put("scheduler-state","post-match-followup",{lastCheck:summary.completedAt,status:summary.status,couponsChecked:summary.couponsChecked,resolved:summary.resolved,unresolved:summary.unresolved,failed:summary.failed});
 return summary;
}
export async function getPostMatchFollowupStatus(){
 const [state,runs,followups,coupons,candidates]=await Promise.all([
  get<any>("scheduler-state","post-match-followup"),
  list<any>("library/post-match-runs",30),
  list<any>("library/post-match-followups",1000),
  list<any>("library/coupons",1000),
  list<any>("library/win-coupon-candidates",1000)
 ]);
 const latest=runs.sort((a,b)=>dateMs(b.startedAt)-dateMs(a.startedAt))[0]||null;
 const winCoupons=coupons.filter(x=>x.origin==="win");
 const eligibleCoupons=winCoupons.filter(x=>x.outcome==="pending"&&Array.isArray(x.selections)&&x.selections.length>0);
 const blockedCandidates=candidates.filter(x=>x.status==="BLOCKED");
 return {
  lastCheck:state?.lastCheck||null,status:state?.status||"not_yet_run",latestRun:latest,
  trackedWinCoupons:winCoupons.length,queuedCoupons:eligibleCoupons.length,blockedCandidates:blockedCandidates.length,
  totalCoupons:followups.length,
  awaitingIndependentReview:followups.filter(x=>x.status==="review_submitted").length,
  reviewRejected:followups.filter(x=>x.status==="review_rejected").length,
  partialOrUnresolved:followups.filter(x=>x.status==="partial_results"||x.outcome==="pending").length,
  wins:followups.filter(x=>x.status==="independently_reviewed"&&x.outcome==="won").length,
  losses:followups.filter(x=>x.status==="independently_reviewed"&&x.outcome==="lost").length,
  recent:followups.sort((a,b)=>dateMs(b.updatedAt)-dateMs(a.updatedAt)).slice(0,20).map(x=>({
   id:x.id,couponId:x.couponId,status:x.status,outcome:x.outcome,
   legCount:(x.legs||[]).length,lostLegs:(x.legs||[]).filter((l:any)=>l.status==="lost").length,
   updatedAt:x.updatedAt,legs:x.legs,searchLeads:x.searchLeads||[],lessonCandidateIds:x.lessonCandidateIds,
   placementStatus:x.placementStatus||"not_placed_by_WIN"
  })),
  limitations:["OpenLigaDB powers live public football result checks; imported historical market datasets extend exact-match checks to some other sports.","Only explicit completed scores, exact team/date matches and supported settlement fields are evaluated.","Period-specific markets, missing kickoff data and ambiguous or unsupported events stay unresolved.","Cause analysis is a hypothesis list, never a score-only causal claim."],
  googleSearchMode:googleMode(),googleSearchConfigured:googleMode()==="google_programmable_search_api",
  googleLeadsFound:followups.reduce((n:number,x:any)=>n+Number(x.searchLeads?.length||0),0),
  aiCalls:0
 };
}

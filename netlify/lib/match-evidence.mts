import { getSportStatSpec, inspectStatisticCoverage, extractPlayerPerformances } from "./sport-stat-catalog.mts";
const norm=(value)=>String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const time=(value)=>{const n=Date.parse(typeof value==="string"?value:"");return Number.isFinite(n)?n:0;};
const clean=(value,max=180)=>typeof value==="string"?value.trim().slice(0,max):"";
function resolveTeams(brief){
  let home=clean(brief?.homeTeam),away=clean(brief?.awayTeam);
  if(!home||!away){
    const event=clean(brief?.event,400);
    const parts=event.split(/\s+(?:vs?\.?|v\.?|@)\s+/i);
    if(parts.length===2){home=home||clean(parts[0]);away=away||clean(parts[1]);}
  }
  return home&&away?{home,away}:null;
}
function same(a,b){
  const x=norm(a),y=norm(b);
  return Boolean(x&&y&&(x===y||(x.length>=8&&y.length>=8&&(x.includes(y)||y.includes(x)))));
}
function rowScore(row){
  const score=Array.isArray(row?.fullTimeScore)?row.fullTimeScore:
    [row?.homeScore??row?.score?.home,row?.awayScore??row?.score?.away];
  if(!Array.isArray(score)||score.length!==2||score.some(x=>x===null||x===undefined||x===""||!Number.isFinite(Number(x))||Number(x)<0))return null;
  return [Number(score[0]),Number(score[1])];
}
function rowSides(row){
  return {one:clean(row?.homeTeam||row?.participant1||row?.team1||row?.teamOne),two:clean(row?.awayTeam||row?.participant2||row?.team2||row?.teamTwo)};
}
function rowDetails(row){
  const keys=["fullTimeScore","halfTimeScore","extraTimeScore","penaltyShootoutScore","resultBasis","attendance","venue","round","group","referee","referees","playerEvents","playerStats","playerStatistics","player_stats","player_performances","teamStats","teamStatistics","matchStats","matchStatistics","statistics","stats","events","matchEvents","timeline","playByPlay","plays","boxScore","boxscore","goals","cards","lineups","lineup","substitutions","scoreBreakdown","sets","periodScores","innings","sourceRecordId"];
  const out=row?.details&&typeof row.details==="object"?{...row.details}:{};
  for(const key of keys)if(row?.[key]!==undefined&&row?.[key]!==null)out[key]=row[key];
  return out;
}
function normalizeRows(collections){
  const out=[];
  for(const [kind,datasets] of Object.entries(collections)){
    for(const dataset of Array.isArray(datasets)?datasets:[]){
      for(const row of Array.isArray(dataset?.records)?dataset.records:[]){
        if(row?.origin&&row.origin!=="provider_historical_data")continue;
        const sides=rowSides(row),score=rowScore(row),eventMs=time(row.eventStart||row.kickoffUtc||row.startTimeUtc);
        if(!sides.one||!sides.two||!eventMs)continue;
        const sport=clean(row.sport||dataset.sport||row.sportId||"unknown",50).toLowerCase();
        const competition=clean(row.competition||row.league||row.tournament||dataset.competition||"",180);
        const season=clean(row.season||dataset.season||"",30);
        const providerId=clean(row.sourceProvider||row.providerId||dataset.providerId||"unknown",100);
        const sourceUrl=clean(row.sourceUrl||dataset.sourceUrl||dataset.repositoryUrl||"",1200);
        const record={kind,datasetId:clean(dataset.id,180),providerId,sport,competition,season,eventMs,eventStart:clean(row.eventStart,60),sides,score,row,sourceUrl,
          sourceLicence:dataset.sourceLicence||row.sourceLicence||null,retrievedAt:dataset.retrievedAt||row.retrievedAt||null,
          rawChecksum:dataset.rawChecksum||null,status:row.status||"unknown",details:rowDetails(row)};
        record.detailScore=Object.keys(record.details).length+(["playerEvents","matchStats","matchStatistics","statistics","stats","events","matchEvents"].filter(k=>row?.[k]!==undefined).length*4);
        out.push(record);
      }
    }
  }
  const grouped=new Map();
  for(const record of out){
    const key=[record.sport,Math.floor(record.eventMs/86400000),norm(record.sides.one),norm(record.sides.two)].join("|");
    const prior=grouped.get(key);
    if(!prior){grouped.set(key,{...record,sourceProviders:[record.providerId],sourceRefs:[record.sourceUrl].filter(Boolean),sourceDatasetIds:[record.datasetId].filter(Boolean),scoreConflict:false});continue;}
    prior.sourceProviders=[...new Set([...prior.sourceProviders,record.providerId])];
    prior.sourceRefs=[...new Set([...prior.sourceRefs,record.sourceUrl].filter(Boolean))].slice(0,8);
    prior.sourceDatasetIds=[...new Set([...prior.sourceDatasetIds,record.datasetId].filter(Boolean))].slice(0,8);
    if(prior.score&&record.score&&(prior.score[0]!==record.score[0]||prior.score[1]!==record.score[1]))prior.scoreConflict=true;
    if(record.detailScore>prior.detailScore){
      const replacement={...record,sourceProviders:prior.sourceProviders,sourceRefs:prior.sourceRefs,sourceDatasetIds:prior.sourceDatasetIds,scoreConflict:prior.scoreConflict};
      grouped.set(key,replacement);
    }
  }
  return [...grouped.values()].sort((a,b)=>a.eventMs-b.eventMs);
}
function competitionMatches(record,competition){
  if(!competition)return true;
  const a=norm(record.competition),b=norm(competition);
  return Boolean(a&&b&&(a===b||a.includes(b)||b.includes(a)));
}
function teamPerspective(record,team){
  const isOne=same(record.sides.one,team),isTwo=same(record.sides.two,team);
  if(!isOne&&!isTwo)return null;
  const ownIndex=isOne?0:1,oppIndex=1-ownIndex;
  const score=record.score;
  const own=score?score[ownIndex]:null,opponent=score?score[oppIndex]:null;
  const result=score?(own>opponent?"W":own<opponent?"L":"D"):"?";
  const half=Array.isArray(record.row?.halfTimeScore)&&record.row.halfTimeScore.length===2?record.row.halfTimeScore.map(Number):null;
  return {
    eventId:clean(record.row?.eventId||record.row?.id,120)||null,date:record.eventStart,competition:record.competition||null,season:record.season||null,
    opponent:isOne?record.sides.two:record.sides.one,venueSide:isOne?"home":"away",result,
    score:score?{for:own,against:opponent}:null,
    firstHalfGoals:half?half[ownIndex]:null,
    secondHalfGoals:half&&score?own-half[ownIndex]:null,
    sourceProviders:record.sourceProviders,sourceUrls:record.sourceRefs,sourceRetrievedAt:record.retrievedAt,
    sourceLicence:record.sourceLicence,scoreConflict:record.scoreConflict||false,
    matchStatistics:record.details,
    statisticCoverage:inspectStatisticCoverage(record.sport,record.details),
    playerPerformances:extractPlayerPerformances(record.details,record.providerId).players
  };
}
function aggregateTeamGames(games){
  const played=games.filter(x=>x.score);
  const wins=played.filter(x=>x.result==="W").length,draws=played.filter(x=>x.result==="D").length,losses=played.filter(x=>x.result==="L").length;
  const goalsFor=played.reduce((n,x)=>n+x.score.for,0),goalsAgainst=played.reduce((n,x)=>n+x.score.against,0);
  const totals=played.map(x=>x.score.for+x.score.against);
  const percent=(n,d)=>d?Math.round(n/d*1000)/10:null;
  const halfAvailable=played.filter(x=>x.firstHalfGoals!==null&&x.secondHalfGoals!==null);
  return {
    played:played.length, wins,draws,losses,goalsFor,goalsAgainst,
    averageGoalsFor:played.length?Math.round(goalsFor/played.length*100)/100:null,
    averageGoalsAgainst:played.length?Math.round(goalsAgainst/played.length*100)/100:null,
    over1_5Pct:percent(totals.filter(x=>x>1.5).length,played.length),
    over2_5Pct:percent(totals.filter(x=>x>2.5).length,played.length),
    over3_5Pct:percent(totals.filter(x=>x>3.5).length,played.length),
    firstHalfGoals:halfAvailable.reduce((n,x)=>n+x.firstHalfGoals,0),
    secondHalfGoals:halfAvailable.reduce((n,x)=>n+x.secondHalfGoals,0),
    matchesWithHalfTimeScore:halfAvailable.length,
    sourceResultConflicts:played.filter(x=>x.scoreConflict).length
  };
}
function summarizeTeam(name,allRows,competition,cutoff){
  const games=allRows.filter(row=>row.eventMs<cutoff&&row.score)
    .map(row=>teamPerspective(row,name)).filter(Boolean)
    .sort((a,b)=>time(b.date)-time(a.date));
  const latestSeason=games.find(x=>x.season)?.season||null;
  let seasonGames=games.filter(x=>!latestSeason||x.season===latestSeason);
  if(competition)seasonGames=seasonGames.filter(x=>competitionMatches(x,competition));
  const home=seasonGames.filter(x=>x.venueSide==="home"),away=seasonGames.filter(x=>x.venueSide==="away");
  return {
    team:name,season:latestSeason,
    seasonStats:aggregateTeamGames(seasonGames),
    homeStats:aggregateTeamGames(home),awayStats:aggregateTeamGames(away),
    last5:games.slice(0,5),
    last10:games.slice(0,10).map(({matchStatistics,playerPerformances,statisticCoverage,...summary})=>({...summary,hasMatchStatistics:Object.keys(matchStatistics||{}).length>0,playersWithStats:(playerPerformances||[]).length,statisticCoverage:statisticCoverage?.summary||null})),
    availableCompletedMatches:games.length,
    newestAvailableMatch:games[0]?.date||null,
    oldestAvailableMatch:games.at(-1)?.date||null,
    competitionFilter:competition||null,
    statsScope:"Imported source rows only; not guaranteed to cover every competition or every fixture."
  };
}
function targetRecord(records,teams,kickoffMs){
  if(!teams||!kickoffMs)return [];
  return records.filter(r=>
    (same(r.sides.one,teams.home)&&same(r.sides.two,teams.away)||same(r.sides.one,teams.away)&&same(r.sides.two,teams.home))&&
    Math.abs(r.eventMs-kickoffMs)<=36*60*60*1000
  );
}
function observedTargetMarkets(datasets,teams,kickoffMs,nowMs){
  if(!teams||!kickoffMs)return [];
  const found=[];
  for(const dataset of datasets||[])for(const row of Array.isArray(dataset.records)?dataset.records:[]){
    const one=clean(row.homeTeam),two=clean(row.awayTeam);
    const matches=(same(one,teams.home)&&same(two,teams.away)||same(one,teams.away)&&same(two,teams.home));
    const start=time(row.startsAt||row.eventStart),observed=time(row.observedAt||row.timestamp);
    if(!matches||!start||Math.abs(start-kickoffMs)>36*60*60*1000||!observed||observed>=kickoffMs||observed>nowMs)continue;
    found.push({providerId:row.providerId||dataset.providerId,bookmakerId:row.bookmakerId||null,sport:row.sportId||row.sport||null,
      market:row.providerMarketName||row.canonicalMarketId||null,selection:row.selection||null,line:row.line??null,
      oddsDecimal:row.oddsDecimal??null,impliedProbability:row.impliedProbability??null,
      observedAt:row.observedAt||row.timestamp,startsAt:row.startsAt||row.eventStart,
      sourceUrl:row.sourceUrl||dataset.sourceUrl||null,sourceSnapshotOnly:Boolean(row.sourceSnapshotOnly)});
  }
  return found.slice(0,100);
}
function matchPostReport(record,nowMs,sport){
  if(!record)return {status:"not_available"};
  if(record.eventMs>nowMs)return {status:"not_started"};
  if(!record.score)return {status:"awaiting_source_result"};
  const details=record.details||{};
  const actualStatsKeys=["playerEvents","playerStats","playerStatistics","teamStats","teamStatistics","matchStats","matchStatistics","statistics","stats","events","matchEvents","timeline","playByPlay","plays","goals","cards","lineups","lineup","substitutions"].filter(k=>details[k]!==undefined);
  const statCoverage=inspectStatisticCoverage(sport,details);
  const playerPerformance=extractPlayerPerformances(details,record.providerId);
  const eventTimeline=details.events||details.matchEvents||details.timeline||details.playByPlay||details.plays||details.playerEvents||null;
  return {
    status:"source_reported_completed_match",
    event:{eventStart:record.eventStart,competition:record.competition,season:record.season,participants:record.sides},
    finalScore:{side1:record.score[0],side2:record.score[1]},
    details,
    availableStatisticSections:actualStatsKeys,
    statisticCoverage:statCoverage,
    playerPerformance:{...playerPerformance,highestRatedPlayers:playerPerformance.bestRated,lowestRatedPlayers:playerPerformance.lowestRated},
    eventTimeline,eventTimelineCount:Array.isArray(eventTimeline)?eventTimeline.length:null,
    unavailableStatisticSections:[...statCoverage.team,...statCoverage.player].filter(x=>x.status==="not_provided").map(x=>x.label),
    unavailableEventTypes:statCoverage.eventTypes.filter(x=>x.status==="not_detected").map(x=>x.eventType),
    source:{providerId:record.providerId,urls:record.sourceRefs,retrievedAt:record.retrievedAt,licence:record.sourceLicence,rawChecksum:record.rawChecksum},
    sourceReportedNotIndependentlyVerified:true
  };
}
export function buildMatchEvidencePack(brief,inputs={}){
  const nowMs=Number.isFinite(inputs.nowMs)?inputs.nowMs:Date.now();
  const teams=resolveTeams(brief);
  const kickoffRaw=brief?.startTime||brief?.eventStart||brief?.kickoff||brief?.matchDateTimeUTC||"";
  const kickoffMs=time(kickoffRaw);
  const cutoff=Math.min(nowMs,kickoffMs||nowMs);
  const sport=clean(brief?.sport||"unknown",50).toLowerCase();
  const competition=clean(brief?.competition||"",180);
  const collections={
    historical:inputs.historicalDatasets||[],
    consensus:inputs.consensusDatasets||[]
  };
  const records=normalizeRows(collections).filter(r=>sport==="unknown"||r.sport==="unknown"||norm(r.sport)===norm(sport)||(sport==="football"&&r.sport==="soccer"));
  const home=teams?summarizeTeam(teams.home,records,competition,cutoff):null;
  const away=teams?summarizeTeam(teams.away,records,competition,cutoff):null;
  const h2h=teams?records.filter(r=>r.eventMs<cutoff&&r.score&&
    ((same(r.sides.one,teams.home)&&same(r.sides.two,teams.away))||(same(r.sides.one,teams.away)&&same(r.sides.two,teams.home))))
    .sort((a,b)=>b.eventMs-a.eventMs).slice(0,10).map(r=>({
      date:r.eventStart,competition:r.competition,season:r.season,team1:r.sides.one,team2:r.sides.two,
      score:r.score,sourceProviders:r.sourceProviders,sourceUrls:r.sourceRefs,scoreConflict:r.scoreConflict
    })): [];
  const targetRecords=targetRecord(records,teams,kickoffMs).sort((a,b)=>b.detailScore-a.detailScore);
  const exactTarget=targetRecords.length===1?targetRecords[0]:null;
  const markets=observedTargetMarkets(inputs.observedSnapshots||[],teams,kickoffMs,nowMs);
  const playerRows=[];
  if(teams)for(const dataset of inputs.playerEventDatasets||[])for(const event of Array.isArray(dataset.records)?dataset.records:[]){
    if(time(event.eventStart)>=cutoff||!time(event.eventStart)||![teams.home,teams.away].some(t=>same(event.team,t)))continue;
    playerRows.push({player:event.player,team:event.team,eventStart:event.eventStart,opponent:event.opponent||null,eventType:event.eventType||null,goals:event.eventType==="goal"?1:0,cardType:event.cardType||null,role:event.role||null,minutes:event.minute||null,competition:event.competition||dataset.competition||null,sourceUrl:event.sourceUrl||dataset.sourceUrl||null,providerId:event.providerId||dataset.providerId||null});
  }
  const playerStats=new Map();
  for(const row of playerRows){const key=norm(row.player)+"|"+norm(row.team);if(!row.player||!row.team)continue;const p=playerStats.get(key)||{player:row.player,team:row.team,goals:0,yellowCards:0,redCards:0,starts:0,benchListings:0,matchLog:[]};p.goals+=row.goals;if(row.cardType==="Y")p.yellowCards++;if(row.cardType==="R")p.redCards++;if(row.role==="starter")p.starts++;if(row.role==="bench")p.benchListings++;p.matchLog.push(row);playerStats.set(key,p);}
  const playerEvidence=[...playerStats.values()].map(p=>({...p,matchLog:p.matchLog.sort((a,b)=>time(b.eventStart)-time(a.eventStart)).slice(0,10)})).slice(0,60);
  const allFreshRows=records.filter(r=>r.eventMs<=nowMs);
  const latestAvailable=Math.max(0,...allFreshRows.map(r=>r.eventMs));
  const postMatch=exactTarget?matchPostReport(exactTarget,nowMs,sport):{status:kickoffMs&&kickoffMs<=nowMs?(targetRecords.length>1?"ambiguous_exact_event":"exact_event_not_found"):"not_started_or_kickoff_unknown"};
  const gaps=[];
  if(!teams)gaps.push("Two distinct named participants could not be resolved from this research brief.");
  if(!kickoffMs)gaps.push("Exact kickoff timestamp is missing; historical cut-off falls back to research snapshot time.");
  if(!records.length)gaps.push("No imported scored event rows match the requested sport.");
  if(home&&home.last5.length<5)gaps.push(teams.home+" has fewer than five matching imported completed games.");
  if(away&&away.last5.length<5)gaps.push(teams.away+" has fewer than five matching imported completed games.");
  gaps.push("Current competition standings/table are not included in the connected match-row datasets.");
  gaps.push("Current injuries, suspensions, confirmed lineups and training/availability reports are not provided by these imported match datasets.");
  gaps.push("Full team/player box scores and event timelines are included only when the provider supplies them; the sport-specific catalogue identifies missing groups and fields.");
  if(!exactTarget||!Object.keys(exactTarget.details||{}).length)gaps.push("No detailed final match box score/event timeline was found for the exact target fixture.");
  if(exactTarget&&exactTarget.details&&!extractPlayerPerformances(exactTarget.details,exactTarget.providerId).players.length)gaps.push("No structured per-player match statistics were supplied for the target fixture.");
  return {
    schemaVersion:"match_evidence_v1",generatedAt:new Date(nowMs).toISOString(),
    event:{sport,competition:competition||null,participants:teams,kickoff: kickoffMs?new Date(kickoffMs).toISOString():null},
    preMatchSnapshot:{asOf:new Date(nowMs).toISOString(),informationCutoff:new Date(cutoff).toISOString(),rule:"Only completed imported matches strictly earlier than the cutoff are used for team form and head-to-head. No future fixture or target-match outcome is used in pre-match calculations.",futureRowsExcluded:records.filter(r=>r.eventMs>cutoff).length},
    teamProfiles:home&&away?{home,away}:null,
    headToHead:h2h,
    competitionContext:{tableStatus:"not_connected",table:null,reason:"No current standings feed is currently connected to this research pack."},
    statisticalSpecification:getSportStatSpec(sport),
    preMatchMarkets:{observedBookmakerSnapshots:markets,marketRows:markets.length,consensusRows:targetRecords.filter(r=>r.kind==="consensus").map(r=>({providerId:r.providerId,opening:r.row.opening||null,closing:r.row.closing||null,marketDataType:r.row.marketDataType||"consensus_market_lines",captureTimestamp:null,executionPrice:false})).slice(0,20)},
    playerEvidence:{uniquePlayers:playerEvidence.length,players:playerEvidence,sourceCoverage:"Imported player-event datasets only; a missing player record does not mean the player did not play."},
    postMatch,
    coverage:{historicalMatchRows:records.length,latestImportedMatch:latestAvailable?new Date(latestAvailable).toISOString():null,matchedTargetRows:targetRecords.length,providerCount:[...new Set(records.flatMap(r=>r.sourceProviders))].length,providerIds:[...new Set(records.flatMap(r=>r.sourceProviders))].slice(0,30),dataScope:"All information is bounded by the currently imported and source-licensed datasets; it is not a guarantee of exhaustive world-wide coverage.",gaps}
  };
}

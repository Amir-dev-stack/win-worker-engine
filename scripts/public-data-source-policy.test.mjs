import test from "node:test";
import assert from "node:assert/strict";
import { buildMatchEvidencePack } from "../netlify/lib/match-evidence.mts";

const rows=[
 {id:"a1",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-09-01T19:00:00Z",homeTeam:"RB Leipzig",awayTeam:"Other 1",fullTimeScore:[2,0],halfTimeScore:[1,0],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a",sourceUrl:"https://source.test/a1"},
 {id:"a2",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-09-10T19:00:00Z",homeTeam:"Other 2",awayTeam:"RB Leipzig",fullTimeScore:[1,1],halfTimeScore:[0,1],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"},
 {id:"a3",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-09-20T19:00:00Z",homeTeam:"RB Leipzig",awayTeam:"Other 3",fullTimeScore:[3,1],halfTimeScore:[1,1],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"},
 {id:"m1",sport:"football",competition:"UEFA Champions League",season:"2026-26",eventStart:"2026-10-01T19:00:00Z",homeTeam:"Manchester City",awayTeam:"Other 4",fullTimeScore:[2,0],halfTimeScore:[1,0],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"},
 {id:"m2",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-10-15T19:00:00Z",homeTeam:"Other 5",awayTeam:"Manchester City",fullTimeScore:[1,2],halfTimeScore:[1,0],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"},
 {id:"h2h",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-10-20T19:00:00Z",homeTeam:"Manchester City",awayTeam:"RB Leipzig",fullTimeScore:[3,2],halfTimeScore:[1,1],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"},
 {id:"future",sport:"football",competition:"UEFA Champions League",season:"2026-27",eventStart:"2026-11-05T19:00:00Z",homeTeam:"RB Leipzig",awayTeam:"Other 6",fullTimeScore:[5,0],halfTimeScore:[4,0],status:"completed",origin:"provider_historical_data",sourceProvider:"feed-a"}
];
const target={sport:"football",competition:"UEFA Champions League",event:"Manchester City vs RB Leipzig",startTime:"2026-11-05T20:00:00Z"};
const nowMs=Date.parse("2026-11-04T12:00:00Z");

test("pre-match evidence gives both teams recent form and excludes future/target match results",()=>{
 const pack=buildMatchEvidencePack(target,{historicalDatasets:[{id:"ucl",providerId:"feed-a",sport:"football",season:"2026-27",records:rows}],nowMs});
 assert.equal(pack.teamProfiles.home.team,"Manchester City");
 assert.equal(pack.teamProfiles.away.team,"RB Leipzig");
 assert.equal(pack.teamProfiles.home.last5.length,3);
 assert.equal(pack.teamProfiles.away.last5.length,4);
 assert.ok(pack.teamProfiles.away.last5[0].statisticCoverage);
 assert.ok(Array.isArray(pack.teamProfiles.away.last5[0].playerPerformances));
 assert.equal(pack.headToHead.length,1);
 assert.equal(pack.teamProfiles.away.seasonStats.played,4);
 assert.equal(pack.teamProfiles.away.seasonStats.wins,2);
 assert.equal(pack.teamProfiles.away.homeStats.played,2);
 assert.equal(pack.teamProfiles.away.awayStats.played,2);
 assert.equal(pack.teamProfiles.away.seasonStats.firstHalfGoals,4);
 assert.equal(pack.teamProfiles.away.seasonStats.secondHalfGoals,4);
 assert.equal(pack.postMatch.status,"not_started_or_kickoff_unknown");
 assert.equal(pack.preMatchSnapshot.futureRowsExcluded,1);
});

test("exact historical target match appears only in post-match report, never pre-match form",()=>{
 const finished={...rows[5],eventStart:"2026-10-20T19:00:00Z",playerEvents:{goals:[{player:"A",minute:"12"}],lineup:[{player:"B",role:"starter"}]}};
 const pack=buildMatchEvidencePack({...target,startTime:"2026-10-20T19:00:00Z"},{historicalDatasets:[{id:"ucl",providerId:"feed-a",sport:"football",season:"2026-27",records:[...rows.slice(0,5),finished]}],nowMs});
 assert.equal(pack.postMatch.status,"source_reported_completed_match");
 assert.deepEqual(pack.postMatch.finalScore,{side1:3,side2:2});
 assert.deepEqual(pack.postMatch.availableStatisticSections,["playerEvents"]);
 assert.equal(pack.headToHead.length,0);
 assert.equal(pack.postMatch.sourceReportedNotIndependentlyVerified,true);
});

test("price snapshots captured after kickoff are excluded from pre-match market evidence",()=>{
 const pack=buildMatchEvidencePack(target,{historicalDatasets:[{id:"ucl",providerId:"feed-a",records:rows}],observedSnapshots:[{providerId:"book-feed",records:[
  {homeTeam:"Manchester City",awayTeam:"RB Leipzig",startsAt:"2026-11-05T20:00:00Z",observedAt:"2026-11-04T10:00:00Z",oddsDecimal:1.7,canonicalMarketId:"moneyline"},
  {homeTeam:"Manchester City",awayTeam:"RB Leipzig",startsAt:"2026-11-05T20:00:00Z",observedAt:"2026-11-05T21:00:00Z",oddsDecimal:1.5,canonicalMarketId:"moneyline"}
 ]}],nowMs});
 assert.equal(pack.preMatchMarkets.marketRows,1);
 assert.equal(pack.preMatchMarkets.observedBookmakerSnapshots[0].oddsDecimal,1.7);
});

test("reports missing standings and coverage instead of fabricating a league table",()=>{
 const pack=buildMatchEvidencePack(target,{historicalDatasets:[{id:"ucl",providerId:"feed-a",records:rows}],nowMs});
 assert.equal(pack.competitionContext.tableStatus,"not_connected");
 assert.ok(pack.coverage.gaps.some(x=>x.includes("standings")));
});


import { getSportStatSpec, inspectStatisticCoverage, extractPlayerPerformances } from "../netlify/lib/sport-stat-catalog.mts";

test("football catalogue tracks passing, attacking, restarts, defending and player ratings",()=>{
 const spec=getSportStatSpec("football");
 const groups=spec.team.map(x=>x.id);
 for(const id of ["possession","passing","shooting","defending","set_pieces","goalkeeping"])assert.ok(groups.includes(id));
 assert.ok(spec.events.includes("kick_off"));
 assert.ok(spec.events.includes("throw_ins"));
 const coverage=inspectStatisticCoverage("football",{possession:62,passes_total:510,passes_accurate:455,dangerous_attacks:48,corners:7});
 assert.ok(coverage.team.find(x=>x.id==="passing").availableMetrics.includes("passes_total"));
 assert.ok(coverage.team.find(x=>x.id==="set_pieces").availableMetrics.includes("corners"));
 assert.equal(coverage.team.find(x=>x.id==="shooting").status,"not_provided");
});

test("sport catalogues remain sport-specific for basketball, hockey, tennis and American football",()=>{
 assert.ok(getSportStatSpec("basketball").player.some(x=>x.id==="rebounding"));
 assert.ok(getSportStatSpec("ice_hockey").events.includes("faceoff"));
 assert.ok(getSportStatSpec("tennis").team.some(x=>x.id==="serve"));
 assert.ok(getSportStatSpec("american_football").team.some(x=>x.id==="special_teams"));
});

test("all provider-supplied player lines and comparable highest/lowest ratings are extracted",()=>{
 const extracted=extractPlayerPerformances({playerStats:[
  {player:{id:1,name:"Player A"},team:{name:"Home"},statistics:[{games:{minutes:"90",position:"Attacker",rating:"8.7"},shots:{total:4,on:2},passes:{total:25,accuracy:82}}]},
  {player:{id:2,name:"Player B"},team:{name:"Home"},statistics:[{games:{minutes:"64",position:"Defender",rating:"6.1"},tackles:{total:5},duels:{won:4,total:8}}]},
  {player:{id:3,name:"Player C"},team:{name:"Away"},statistics:[{games:{minutes:"90",position:"Midfielder"},passes:{total:50}}]}
 ]},"api-sports-fixture");
 assert.equal(extracted.players.length,3);
 assert.equal(extracted.ratingsAvailable,2);
 assert.equal(extracted.bestRated[0].name,"Player A");
 assert.equal(extracted.lowestRated[0].name,"Player B");
 assert.equal(extracted.unratedPlayers,1);
 assert.equal(extracted.players.find(x=>x.name==="Player A").minutes,90);
});


test("deep-statistics providers are listed only as disabled candidates pending source, contract and coverage review",()=>{
 const providers=DATA_PROVIDER_REGISTRY;
 for(const id of ["api-sports","statsbomb-open-data","sportradar","sportsdataio"]){
  const source=providers.find(x=>x.id===id);
  assert.ok(source,id+" should be discoverable");
  assert.equal(source.automationAllowed,false);
  assert.equal(source.licenceReview,"required");
 });
});

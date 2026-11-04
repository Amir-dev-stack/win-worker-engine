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
 assert.equal(pack.teamProfiles.home.last5.length,2);
 assert.equal(pack.teamProfiles.away.last5.length,3);
 assert.equal(pack.headToHead.length,1);
 assert.equal(pack.teamProfiles.away.seasonStats.played,3);
 assert.equal(pack.teamProfiles.away.seasonStats.wins,2);
 assert.equal(pack.teamProfiles.away.homeStats.played,2);
 assert.equal(pack.teamProfiles.away.awayStats.played,1);
 assert.equal(pack.teamProfiles.away.seasonStats.firstHalfGoals,3);
 assert.equal(pack.teamProfiles.away.seasonStats.secondHalfGoals,3);
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

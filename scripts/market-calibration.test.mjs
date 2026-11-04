import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMarketDataset } from "../netlify/lib/market-calibration.mts";

function buildRows({sport,count=40,homeProbability=0.58}){
  return Array.from({length:count},(_,i)=>{
    const isHome=i%3!==0;
    const eventStart=new Date(Date.UTC(2025,0,1+i)).toISOString();
    const common={id:sport+"-"+i,sport,eventStart,homeTeam:"Home "+i,awayTeam:"Away "+i,status:"completed",homeScore:isHome?2:0,awayScore:isHome?0:2};
    if(sport==="football")return {...common,closing:{homeWinProbability:homeProbability,drawProbability:0.24,awayWinProbability:1-homeProbability-0.24},settlements:{moneylineWinner:isHome?"home":"away"}};
    if(sport==="tennis")return {...common,homeScore:isHome?2:0,awayScore:isHome?0:2,closing:{homeWinProbability:homeProbability,awayWinProbability:1-homeProbability},settlements:{moneylineWinner:isHome?"home":"away"}};
    return {...common,homeScore:isHome?110:90,awayScore:isHome?90:110,closing:{homeWinProbability:homeProbability,awayWinProbability:1-homeProbability},settlements:{moneylineWinner:isHome?"home":"away"}};
  });
}

test("football keeps three-way 1X2 calibration with chronological holdout",()=>{
  const report=evaluateMarketDataset({providerId:"football-fixture",sport:"football",records:buildRows({sport:"football"})});
  assert.equal(report.moneyline.market,"1X2");
  assert.equal(report.moneyline.classCount,3);
  assert.equal(report.moneyline.status,"evaluated");
  assert.equal(report.moneyline.observations,40);
  assert.equal(report.moneyline.trainingCount,28);
  assert.equal(report.moneyline.testCount,12);
  assert.equal(report.moneyline.testMetrics.count,12);
});

test("NBA-style two-way moneyline uses binary probability and result instead of requiring a draw",()=>{
  const report=evaluateMarketDataset({providerId:"nba-fixture",sport:"basketball",records:buildRows({sport:"basketball"})});
  assert.equal(report.moneyline.market,"two_way_moneyline");
  assert.equal(report.moneyline.classCount,2);
  assert.equal(report.moneyline.status,"evaluated");
  assert.equal(report.moneyline.observations,40);
  assert.equal(report.moneyline.testMetrics.count,12);
  assert.equal(report.couponSimulation.status,"completed");
  assert.match(report.couponSimulation.method,/two_way/);
});

test("tennis player-one probabilities are calibrated as a two-way match-winner market",()=>{
  const report=evaluateMarketDataset({providerId:"tennis-fixture",sport:"tennis",records:buildRows({sport:"tennis",homeProbability:0.62})});
  assert.equal(report.moneyline.market,"two_way_moneyline");
  assert.equal(report.moneyline.status,"evaluated");
  assert.equal(report.moneyline.observations,40);
  assert.equal(report.moneyline.testMetrics.count,12);
  assert.equal(report.couponSimulation.status,"completed");
});

test("two-way and 1X2 markets remain unscored below the minimum sample threshold",()=>{
  const report=evaluateMarketDataset({providerId:"small",sport:"basketball",records:buildRows({sport:"basketball",count:29})});
  assert.equal(report.moneyline.status,"insufficient_sample");
  assert.equal(report.moneyline.minimum,30);
  assert.equal(report.couponSimulation.status,"insufficient_sample");
});

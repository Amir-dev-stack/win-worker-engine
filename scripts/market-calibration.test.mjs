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

test("same-slate dependence diagnostic measures empirical pair outcomes without authorizing coupons", async () => {
  const { evaluateSameSlateFavouritePairs } = await import("../netlify/lib/market-calibration.mts");
  const rows = [];
  for (let day = 1; day <= 40; day++) {
    const date = new Date(Date.UTC(2025, 0, day)).toISOString();
    rows.push({ eventId: "a-" + day, eventStart: date, p: 0.6, won: true });
    rows.push({ eventId: "b-" + day, eventStart: date, p: 0.6, won: true });
    rows.push({ eventId: "c-" + day, eventStart: date, p: 0.6, won: false });
  }
  const result = evaluateSameSlateFavouritePairs(rows);
  assert.equal(result.status, "diagnostic_only");
  assert.equal(result.pairCount, 120);
  assert.equal(result.slateCount, 40);
  assert.ok(Math.abs(result.meanPredictedJointHitProbability - 0.36) < 1e-12);
  assert.ok(Math.abs(result.realizedJointHitRate - 1 / 3) < 1e-12);
  assert.ok(result.calibrationGap < 0);
  assert.equal(result.jointModelQualificationAllowed, false);
  assert.equal(result.couponQualificationAllowed, false);
  assert.equal(result.productionUseAllowed, false);
});

test("same-slate diagnostic refuses small samples, duplicate event identities and oversized computation", async () => {
  const { evaluateSameSlateFavouritePairs } = await import("../netlify/lib/market-calibration.mts");
  const small = evaluateSameSlateFavouritePairs([
    { eventId: "a", eventStart: "2025-01-01T10:00:00Z", p: 0.5, won: true },
    { eventId: "b", eventStart: "2025-01-01T11:00:00Z", p: 0.5, won: false }
  ]);
  assert.equal(small.status, "insufficient_sample");
  const duplicate = evaluateSameSlateFavouritePairs(Array.from({ length: 120 }, (_, i) => ({
    eventId: "same", eventStart: "2025-01-01T00:00:00Z", p: 0.5, won: i % 2 === 0
  })));
  assert.equal(duplicate.status, "insufficient_sample");
  const huge = evaluateSameSlateFavouritePairs(Array.from({ length: 500 }, (_, i) => ({
    eventId: "event-" + i, eventStart: "2025-01-01T00:00:00Z", p: 0.5, won: i % 2 === 0
  })));
  assert.equal(huge.status, "sample_cap_exceeded");
  assert.equal(huge.pairCount, 0);
});

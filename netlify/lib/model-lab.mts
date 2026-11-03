import { list, put } from "./store.mts";
export async function runOpenFootballBaselineLab() {
 const sets=await list<any>("library/model-lab/historical-event-datasets",1000);
 const rows=sets.flatMap(x=>Array.isArray(x.records)?x.records:[]).filter(x=>x.origin==="provider_historical_data"&&Array.isArray(x.fullTimeScore)&&x.fullTimeScore.length===2).sort((a,b)=>String(a.eventStart).localeCompare(String(b.eventStart)));
 const id="openfootball-baseline-"+new Date().toISOString().slice(0,10);
 if(rows.length<30){const r={id,status:"waiting_for_data",scoredMatches:rows.length,minimumRequired:30,lab:"model-lab",origin:"provider_historical_data",humanCouponLabTouched:false};await put("library/model-lab/experiments",id,r);return r;}
 const cut=Math.floor(rows.length*.7),train=rows.slice(0,cut),test=rows.slice(cut);
 const pHome=train.filter(x=>x.fullTimeScore[0]>x.fullTimeScore[1]).length/train.length;
 const pDraw=train.filter(x=>x.fullTimeScore[0]===x.fullTimeScore[1]).length/train.length;
 const pAway=1-pHome-pDraw;
 const goalLines=[1.5,2.5,3.5,4.5].map(line=>{const p=train.filter(x=>x.fullTimeScore[0]+x.fullTimeScore[1]>line).length/train.length;let brier=0;for(const x of test){const y=x.fullTimeScore[0]+x.fullTimeScore[1]>line?1:0;brier+=(p-y)**2;}return {line,trainingProbability:p,testBrier:brier/test.length,testCount:test.length};});
 const result={id,status:"completed",lab:"model-lab",origin:"provider_historical_data",scoredMatches:rows.length,trainingMatches:train.length,testMatches:test.length,split:"chronological_70_30",oneXTwoTrainingProbabilities:{home:pHome,draw:pDraw,away:pAway},goalLines,limitations:["No historical bookmaker odds; no ROI or CLV.","Baseline frequencies only, not a demonstrated betting edge."],humanCouponLabTouched:false,createdAt:new Date().toISOString()};
 await put("library/model-lab/experiments",id,result);return result;
}
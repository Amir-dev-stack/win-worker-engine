import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewStatShape,isAllowedPreviewContext} from './win-api-football-preview-report.mjs';
test('never permits production or unknown Netlify context',()=>{
  assert.equal(isAllowedPreviewContext('deploy-preview'),true);
  assert.equal(isAllowedPreviewContext('production'),false);
  assert.equal(isAllowedPreviewContext(undefined),false);
  assert.equal(isAllowedPreviewContext('branch-deploy'),false);
});
test('summarizes covered team statistics without raw data or identifiers',()=>{
  const data=[{team:{id:123,name:'Private Unit Fixture'},statistics:[{type:'Shots on Goal',value:4},{type:'Ball Possession',value:'55%'}]}];
  const result=previewStatShape(data,'fixtures/statistics');
  assert.deepEqual(result.teamStatisticTypes,['Ball Possession','Shots on Goal']);
  assert.equal(result.observedStatisticRows,2);
  assert.equal(JSON.stringify(result).includes('Private Unit Fixture'),false);
});
test('counts players but does not leak individual names',()=>{
  const d=[{team:{id:1},players:[{player:{name:'Sensitive Test Player'},statistics:[{games:{minutes:50}}]}]}];
  const r=previewStatShape(d,'fixtures/players');
  assert.equal(r.playerEntries,1);assert.equal(r.observedStatisticRows,1);
  assert.equal(JSON.stringify(r).includes('Sensitive Test Player'),false);
});
test('rejects invalid input',()=>assert.throws(()=>previewStatShape({},'fixtures'),/array/));

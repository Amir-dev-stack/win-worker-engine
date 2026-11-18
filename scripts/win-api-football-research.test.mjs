import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiFootballResearchUrl,readApiFootballFixture} from './win-api-football-research.mjs';
const reply=(data,status=200,headers={})=>({ok:status>=200&&status<300,status,headers:{get:k=>headers[k]??null},arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(data)).buffer});
test('whitelisted path and numeric fixture identifier',()=>{
  assert.match(apiFootballResearchUrl('fixtures/players',123),/fixtures\/players\?id=123$/);
  assert.throws(()=>apiFootballResearchUrl('foo',123),/Unsupported/);
  assert.throws(()=>apiFootballResearchUrl('fixtures','../../'),/fixture ID/);
});
test('missing key fails before request',async()=>{
  await assert.rejects(readApiFootballFixture('fixtures',123,{apiKey:''}),/NOT_CONFIGURED/);
});
test('captures verified responses and rate remaining without revealing key',async()=>{
  const x=await readApiFootballFixture('fixtures/statistics',123,{apiKey:'TEST_SECRET',fetcher:async (url,init)=>{
    assert.equal(init.headers['x-apisports-key'],'TEST_SECRET');
    return reply({response:[{team:{id:5},statistics:[]}]},200,{'x-ratelimit-requests-remaining':'99'});
  },clock:()=>new Date('2026-11-17T00:00:00Z')});
  assert.equal(x.recordCount,1);
  assert.equal(x.freeQuotaRemaining,'99');
  assert.equal(JSON.stringify(x).includes('TEST_SECRET'),false);
});
test('rejects overlarge, unsupported and provider errors',async()=>{
  await assert.rejects(readApiFootballFixture('fixtures',123,{apiKey:'x',fetcher:async()=>reply({response:[]},200,{'content-length':'9999999'})}),/TOO_LARGE/);
  await assert.rejects(readApiFootballFixture('fixtures',123,{apiKey:'x',fetcher:async()=>reply({response:'not array'})}),/INVALID_RESPONSE/);
  await assert.rejects(readApiFootballFixture('fixtures',123,{apiKey:'x',fetcher:async()=>reply({response:[],errors:{quota:'blocked'}})}),/PROVIDER_ERROR/);
});

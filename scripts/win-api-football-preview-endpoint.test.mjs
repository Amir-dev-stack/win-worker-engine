import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/win-api-football-preview-check.mts';

const formerNetlify = globalThis.Netlify;
const preview = { deploy: { context: 'deploy-preview' } };
const authKey = 'EXAMPLE_PREVIEW_ONLY';
const apiKey = 'EXAMPLE_API_ONLY';
globalThis.Netlify = { env: { get(key) {
  return ({
    WIN_PREVIEW_ACCESS_TOKEN: authKey,
    WIN_API_FOOTBALL_KEY: apiKey
  })[key] ?? null;
}}};
const input = (payload, token = authKey) => new Request('https://preview.invalid/api/win-api-football-preview-check',{
  method: 'POST',
  headers: { authorization: 'Bearer ' + token },
  body: JSON.stringify(payload)
});
test('production and branch deploy fail closed, even with valid token',async()=>{
  assert.equal((await handler(input({resource:'fixtures',fixtureId:1}),{deploy:{context:'production'}})).status,404);
  assert.equal((await handler(input({resource:'fixtures',fixtureId:1}),{deploy:{context:'branch-deploy'}})).status,404);
});
test('missing or incorrect preview token rejected before any fetch',async()=>{
  assert.equal((await handler(input({resource:'fixtures',fixtureId:1},'WRONG'),preview)).status,401);
});
test('one authorized fixture request returns safe coverage metadata only',async()=>{
  const prior = globalThis.fetch;
  const queries = [];
  try {
    globalThis.fetch = async (url, options)=>{
      queries.push({url, key:options.headers['x-apisports-key']});
      return new Response(JSON.stringify({response:[{
        team:{name:'Never Print This Name'},statistics:[{type:'Shots on Goal',value:2}]
      }]}),{status:200,headers:{'content-type':'application/json','x-ratelimit-requests-remaining':'97'}});
    };
    const res=await handler(input({resource:'fixtures/statistics',fixtureId:123}),preview);
    const parsed=await res.json();
    assert.equal(res.status,200);
    assert.equal(parsed.coverage.observedStatisticRows,1);
    assert.equal(parsed.freeQuotaRemaining,'97');
    assert.equal(parsed.persisted,false);
    assert.equal(queries.length,1);
    assert.match(queries[0].url,/fixtures\/statistics\?id=123$/);
    assert.equal(queries[0].key,apiKey);
    assert.equal(JSON.stringify(parsed).includes(apiKey),false);
    assert.equal(JSON.stringify(parsed).includes('Never Print This Name'),false);
  } finally { globalThis.fetch=prior; }
});
test('provider failures are sanitized and never return its error body',async()=>{
  const prior=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('INTERNAL PROVIDER SECRET',{status:429});
    const res=await handler(input({resource:'fixtures',fixtureId:123}),preview);
    assert.equal(res.status,502);
    assert.equal((await res.text()).includes('INTERNAL PROVIDER SECRET'),false);
  } finally {globalThis.fetch=prior;}
});
test('unsupported resource or missing fixture ID is rejected',async()=>{
  assert.equal((await handler(input({resource:'players',fixtureId:123}),preview)).status,400);
  assert.equal((await handler(input({resource:'fixtures',fixtureId:'123'}),preview)).status,400);
});

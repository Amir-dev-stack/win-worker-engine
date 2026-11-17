import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statsBombOpenDataUrl, readStatsBombOpenData, summarizeStatsBombEvents} from './win-statsbomb-open-data.mjs';
const fixed = { clock: () => new Date('2026-11-17T08:00:00.000Z') };
const fake = (data, status = 200, declared = null) => async () => ({
  ok: status >= 200 && status < 300, status,
  headers: {get: key => key === 'content-length' ? declared : null},
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(data)).buffer
});
test('validates fixture-specific endpoint IDs and forbids arbitrary URLs', () => {
  assert.match(statsBombOpenDataUrl('matches',{competitionId:11,seasonId:22}), /matches\/11\/22\.json$/);
  assert.match(statsBombOpenDataUrl('events',{matchId:33}), /events\/33\.json$/);
  assert.throws(() => statsBombOpenDataUrl('events',{matchId:'../secret'}), /integer/);
  assert.throws(() => statsBombOpenDataUrl('unknown'), /Unsupported/);
});
test('records provenance and admits no freshness guarantee', async () => {
  const x = await readStatsBombOpenData('competitions',{}, {...fixed,fetcher: fake([{competition_id:1}])});
  assert.equal(x.recordCount,1);
  assert.equal(x.researchOnly,true);
  assert.equal(x.freshnessGuarantee,'none');
  assert.equal(x.retrievedAt,'2026-11-17T08:00:00.000Z');
});
test('fails closed for oversized, malformed or unavailable data', async () => {
  await assert.rejects(readStatsBombOpenData('competitions',{}, {fetcher: fake([],200,'9000000')}), /limit/);
  await assert.rejects(readStatsBombOpenData('competitions',{}, {fetcher: fake({foo:1})}), /array/);
  await assert.rejects(readStatsBombOpenData('competitions',{}, {fetcher: fake([],404)}), /HTTP 404/);
});
test('summarizes events without inventing player or match metrics', () => {
  assert.deepEqual(summarizeStatsBombEvents([{type:{name:'Pass'}},{type:{name:'Pass'}},{type:{name:'Shot'}},{}]), {eventCount:4,byType:{Pass:2,Shot:1}});
});

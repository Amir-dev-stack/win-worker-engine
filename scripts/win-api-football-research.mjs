/** Read-only research client for the officially documented API-Football v3 API.
 * Requires the owner's free account and an environment-held API key.
 * Does NOT save, wager, schedule, or activate production features.
 * Official: https://www.api-football.com/documentation-v3
 */
const ROOT = 'https://v3.football.api-sports.io';
const MAX_BYTES = 1_000_000;
const ALLOWED = new Set(['fixtures','fixtures/statistics','fixtures/players']);
const asId = v => { if (!Number.isSafeInteger(v) || v <= 0) throw new TypeError('Invalid fixture ID'); return v; };
export function apiFootballResearchUrl(resource, fixtureId) {
  if (!ALLOWED.has(resource)) throw new TypeError('Unsupported API-Football resource');
  return ROOT + '/' + resource + '?id=' + asId(fixtureId);
}
export async function readApiFootballFixture(resource, fixtureId, options = {}) {
  const url = apiFootballResearchUrl(resource, fixtureId);
  const apiKey = options.apiKey ?? process.env.WIN_API_FOOTBALL_KEY;
  if (!apiKey || typeof apiKey !== 'string') throw new Error('API_FOOTBALL_KEY_NOT_CONFIGURED');
  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw new TypeError('Invalid maxBytes');
  const response = await fetcher(url, {headers: {'x-apisports-key': apiKey, Accept:'application/json'}, signal:options.signal});
  // Never include request headers, key, URL query secrets, or a raw server error body in errors.
  if (!response.ok) throw new Error('API_FOOTBALL_HTTP_' + response.status);
  const length = response.headers?.get?.('content-length');
  if (length !== null && length !== undefined && Number(length) > maxBytes) throw new Error('API_FOOTBALL_RESPONSE_TOO_LARGE');
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader(); let count = 0; const chunks = [];
    try {
      while(true) {
        const {done,value} = await reader.read();
        if(done) break;
        count += value.byteLength;
        if(count > maxBytes) {await reader.cancel();throw new Error('API_FOOTBALL_RESPONSE_TOO_LARGE');}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
    bytes = new Uint8Array(count); let offset=0;
    for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    if(bytes.length > maxBytes) throw new Error('API_FOOTBALL_RESPONSE_TOO_LARGE');
  }
  const data=JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(data.response)) throw new Error('API_FOOTBALL_INVALID_RESPONSE');
  if (data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)) {
    throw new Error('API_FOOTBALL_PROVIDER_ERROR');
  }
  return {
    provider:'API-Football', resource,fixtureId, sourceUrl:url,
    retrievedAt:(options.clock ?? (()=>new Date()))().toISOString(),
    records:data.response,recordCount:data.response.length,
    freeQuotaRemaining:response.headers?.get?.('x-ratelimit-requests-remaining') ?? null,
    researchOnly:true, licensedDataReviewRequired:true
  };
}

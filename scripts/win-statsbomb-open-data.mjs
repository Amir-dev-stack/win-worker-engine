/**
 * Research-only reader for StatsBomb Open Data (Hudl-hosted).
 * https://github.com/hudl/open-data
 * No storage, tokens, automated betting, or production activation.
 * Verify dataset rights and attribution obligations before use.
 */
const ROOT = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const MAX_BYTES = 5_000_000;
const TYPES = new Set(['competitions', 'matches', 'events', 'lineups']);
const id = (value, field) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(field + ' must be a positive safe integer');
  return value;
};
export function statsBombOpenDataUrl(kind, keys = {}) {
  if (!TYPES.has(kind)) throw new TypeError('Unsupported StatsBomb resource');
  if (kind === 'competitions') return ROOT + '/competitions.json';
  if (kind === 'matches') return ROOT + '/matches/' + id(keys.competitionId, 'competitionId') + '/' + id(keys.seasonId, 'seasonId') + '.json';
  return ROOT + '/' + kind + '/' + id(keys.matchId, 'matchId') + '.json';
}
export async function readStatsBombOpenData(kind, keys = {}, options = {}) {
  const url = statsBombOpenDataUrl(kind, keys);
  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw new TypeError('Invalid response cap');
  const response = await fetcher(url, {headers: {Accept: 'application/json'}, signal: options.signal});
  if (!response.ok) throw new Error('StatsBomb Open Data HTTP ' + response.status);
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Response exceeds byte limit');
  // Streaming makes the cap effective even when Content-Length is absent.
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let count = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        count += value.byteLength;
        if (count > maxBytes) throw new Error('Response exceeds byte limit');
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    bytes = new Uint8Array(count);
    let cursor = 0;
    for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('Response exceeds byte limit');
  }
  const records = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(records)) throw new TypeError('StatsBomb resource is not an array');
  return {
    source: 'StatsBomb Open Data', sourceUrl: url,
    retrievedAt: (options.clock ?? (() => new Date()))().toISOString(),
    kind, recordCount: records.length, records,
    researchOnly: true, licenceReviewRequired: true,
    freshnessGuarantee: 'none'
  };
}
export function summarizeStatsBombEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('Expected events array');
  const byType = {};
  for (const event of events) {
    const type = event?.type?.name;
    if (typeof type === 'string' && type) byType[type] = (byType[type] ?? 0) + 1;
  }
  return {eventCount: events.length, byType};
}

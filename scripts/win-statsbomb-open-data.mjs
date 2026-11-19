/**
 * Research-only reader for selected StatsBomb Open Data JSON.
 *
 * It is deliberately disconnected from WIN storage and schedules. Dataset
 * rights, attribution and intended-use approval remain required separately.
 */
const ROOT = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
const REPOSITORY = "https://github.com/hudl/open-data";
const MAX_BYTES = 5_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const TYPES = new Set(["competitions", "matches", "events", "lineups"]);

function positiveId(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}

export function statsBombOpenDataUrl(kind, keys = {}) {
  if (!TYPES.has(kind)) throw new TypeError("Unsupported StatsBomb resource");
  if (kind === "competitions") return `${ROOT}/competitions.json`;
  if (kind === "matches") {
    return `${ROOT}/matches/${positiveId(keys.competitionId, "competitionId")}/${positiveId(keys.seasonId, "seasonId")}.json`;
  }
  return `${ROOT}/${kind}/${positiveId(keys.matchId, "matchId")}.json`;
}

function safeTimestamp(clock) {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError("Invalid retrieval clock");
  }
  return value.toISOString();
}

async function boundedBody(response, maxBytes) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Response exceeds byte limit");
  const contentType = response.headers?.get?.("content-type");
  if (contentType && !/^(application\/json|text\/plain)(?:;|$)/iu.test(contentType.trim())) {
    throw new Error("Unexpected response content type");
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Response exceeds byte limit");
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error("Invalid response stream");
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("Response exceeds byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readStatsBombOpenData(kind, keys = {}, options = {}) {
  const url = statsBombOpenDataUrl(kind, keys);
  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof fetcher !== "function") throw new TypeError("Invalid fetch implementation");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) {
    throw new TypeError("Invalid response cap");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TypeError("Invalid timeout");
  }
  const retrievedAt = safeTimestamp(options.clock ?? (() => new Date()));

  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    let response;
    try {
      response = await fetcher(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
    } catch {
      throw new Error("StatsBomb Open Data request failed");
    }
    if (!response || response.ok !== true) {
      const status = Number.isInteger(response?.status) ? response.status : 0;
      throw new Error(`StatsBomb Open Data HTTP ${status}`);
    }
    const bytes = await boundedBody(response, maxBytes);
    let records;
    try {
      records = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("Invalid StatsBomb JSON response");
    }
    if (!Array.isArray(records)) throw new TypeError("StatsBomb resource is not an array");
    return {
      providerId: "statsbomb-open-data",
      source: "StatsBomb Open Data",
      sourceRepository: REPOSITORY,
      sourceUrl: url,
      retrievedAt,
      kind,
      recordCount: records.length,
      records,
      researchOnly: true,
      licenceReviewRequired: true,
      attributionRequired: true,
      usageApprovalGranted: false,
      freshnessGuarantee: "none"
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.("abort", abort);
  }
}

export function summarizeStatsBombEvents(events) {
  if (!Array.isArray(events)) throw new TypeError("Expected events array");
  const byType = {};
  for (const event of events) {
    const type = event?.type?.name;
    if (typeof type === "string" && type) byType[type] = (byType[type] ?? 0) + 1;
  }
  return { eventCount: events.length, byType };
}

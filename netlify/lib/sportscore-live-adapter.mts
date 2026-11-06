import { get, put } from "./store.mts";
import { DATA_PROVIDER_REGISTRY } from "./data-provider-registry.mts";
import { normalizeSportScorePayload } from "./sportscore-normalize.mjs";

const API_BASE = "https://sportscore.com";
const SUPPORTED_SPORTS = new Set(["football", "basketball", "cricket", "tennis"]);
const CACHE_SECONDS = 60;
const MAX_MATCHES = 15;
const USER_AGENT = "WIN-ResearchEngine/1.0 (+https://github.com/Amir-dev-stack/win-worker-engine)";

function assertSportScoreTerms() {
  const provider = DATA_PROVIDER_REGISTRY.find(item => item.id === "sportscore-live");
  if (!provider || provider.licenceReview !== "documented_open_terms" || provider.automationAllowed !== false ||
      provider.accessMode !== "open_api" || !provider.licenceReference || !provider.attribution) {
    throw new Error("sportscore_source_policy_blocked");
  }
  return provider;
}

export async function getSportScoreMatches(sportInput: unknown) {
  assertSportScoreTerms();
  const sport = typeof sportInput === "string" ? sportInput.trim().toLowerCase() : "";
  if (!SUPPORTED_SPORTS.has(sport)) throw new Error("sportscore_unsupported_sport");
  const cacheKey = "matches-" + sport;
  const now = Date.now();
  const cached = await get<any>("provider-cache", "sportscore-" + cacheKey);
  if (cached && typeof cached.fetchedAt === "string") {
    const age = now - Date.parse(cached.fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age < CACHE_SECONDS * 1000) {
      return { ...cached, cached: true, cacheAgeSeconds: Math.floor(age / 1000) };
    }
  }

  const url = new URL("/api/widget/matches/", API_BASE);
  url.searchParams.set("sport", sport);
  url.searchParams.set("limit", String(MAX_MATCHES));
  url.searchParams.set("src", "win-worker-engine");
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    throw new Error("sportscore_http_" + response.status);
  }
  const payload = await response.json();
  const fetchedAt = new Date().toISOString();
  const normalized = normalizeSportScorePayload(payload, sport, fetchedAt);
  const record = {
    ...normalized,
    cacheSeconds: CACHE_SECONDS,
    cached: false,
    cacheAgeSeconds: 0,
    requestUrl: url.toString(),
    upstreamHttpStatus: response.status,
    cachePolicy: "WIN stores only a bounded normalized match list for at most 60 seconds before re-fetching on demand."
  };
  await put("provider-cache", "sportscore-" + cacheKey, record);
  return record;
}

export async function getSportScoreStatus() {
  const sports = ["football", "basketball", "cricket", "tennis"];
  const records = await Promise.all(sports.map(sport => get<any>("provider-cache", "sportscore-matches-" + sport)));
  const lastFetch = records.map(x => x?.fetchedAt).filter(Boolean).sort().at(-1) || null;
  return {
    status: records.some(Boolean) ? "available_on_demand" : "not_yet_queried",
    sports: Object.fromEntries(sports.map((sport, index) => [sport, records[index] ? {
      matches: Number(records[index]?.summary?.matchesNormalized || 0),
      lastFetchedAt: records[index]?.fetchedAt || null
    } : { matches: 0, lastFetchedAt: null }])),
    lastFetch,
    requestPolicy: "One on-demand fetch per sport per 60-second cache window; no scheduled polling.",
    attributionRequired: true,
    sourceOfTruth: false
  };
}

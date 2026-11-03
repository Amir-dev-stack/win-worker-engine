import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";

const HF_QUERIES = [
  "sports results dataset", "football match results", "basketball game logs",
  "tennis match results", "cricket ball by ball", "baseball game results",
  "ice hockey results", "sports betting odds"
];
const GH_QUERIES = [
  "sports data dataset", "football results dataset", "tennis match dataset",
  "cricket ball by ball dataset", "basketball baseball hockey dataset"
];
const ZENODO_QUERIES = [
  "football match results dataset", "basketball statistics dataset",
  "tennis match results dataset", "cricket match results dataset",
  "baseball game results dataset", "ice hockey results dataset",
  "historical sports odds dataset"
];
const DATACITE_QUERIES = [
  "football match results", "basketball match statistics", "tennis match results",
  "cricket ball by ball", "baseball game logs", "ice hockey match results",
  "sports odds historical"
];
const headers = {
  "user-agent": "WIN-Public-Research-Discovery/2.0 (+https://github.com/Amir-dev-stack/win-worker-engine)",
  "accept": "application/json"
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
const clean = (v: unknown, n = 1000) => typeof v === "string" ? v.trim().slice(0, n) : "";
const safeArray = (v: unknown) => Array.isArray(v) ? v : [];

function inferSports(text: string) {
  const s = text.toLowerCase(), out: string[] = [];
  const tests: [string, RegExp][] = [
    ["football", /football|soccer|futsal|premier league|world cup/],
    ["basketball", /basketball|nba|wnba/], ["tennis", /tennis|atp|wta|challenger/],
    ["baseball", /baseball|mlb|npb/], ["ice_hockey", /ice hockey|nhl|hockey/],
    ["american_football", /american football|nfl|ncaa football/],
    ["cricket", /cricket|ipl|t20|odi/], ["rugby", /rugby/],
    ["volleyball", /volleyball/], ["handball", /handball/],
    ["golf", /golf/], ["esports", /esports|dota|counter strike|league of legends/],
    ["horse_racing", /horse racing|thoroughbred/]
  ];
  for (const [sport, re] of tests) if (re.test(s)) out.push(sport);
  return out;
}
function inferDomains(text: string) {
  const s = text.toLowerCase(), out: string[] = [];
  const tests: [string, RegExp][] = [
    ["odds", /odds|betting|spread|moneyline|handicap/],
    ["fixtures", /fixture|schedule|match list/], ["results", /result|score|winner|settled/],
    ["statistics", /statistic|stats|box score|player props|performance/],
    ["player_events", /player|goal|scorer|card|assist/],
    ["lineups", /lineup|roster|starting/], ["injuries", /injury|injuries|availability/]
  ];
  for (const [name, re] of tests) if (re.test(s)) out.push(name);
  return out;
}
function normalizeLicense(value: unknown) {
  const raw = clean(value, 300);
  const lower = raw.toLowerCase();
  if (/^cc0(?:-1\.0)?$|creativecommons\.org\/publicdomain\/zero\/1\.0/.test(lower)) return "CC0-1.0";
  if (/^cc-by(?:-4\.0)?$|creativecommons\.org\/licenses\/by\/4\.0/.test(lower)) return "CC-BY-4.0";
  if (/^cc-by-sa(?:-4\.0)?$|creativecommons\.org\/licenses\/by-sa\/4\.0/.test(lower)) return "CC-BY-SA-4.0";
  if (/^odbl(?:-1\.0)?$/.test(lower)) return "ODbL-1.0";
  return raw;
}
function licenseStatus(license: string) {
  const l = license.toLowerCase();
  if (["cc0-1.0", "cc-by-4.0"].includes(l)) return "open_data_license_candidate";
  if (["cc-by-sa-4.0", "odbl-1.0"].includes(l)) return "sharealike_or_database_review";
  if (["mit", "apache-2.0", "bsd-3-clause", "bsd-2-clause"].includes(l))
    return "code_license_only_data_rights_unverified";
  return license ? "license_review_required" : "license_missing";
}
async function fetchJson(url: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new Error("HTTP_" + response.status + " " + url);
  return response.json() as Promise<any>;
}
function candidateRecord(input: {
  sourceType: string; sourceId: string; name: string; sourceUrl: string; description: string;
  license: string; sportsText: string; query: string; downloads?: number; likes?: number;
  stars?: number; lastModified?: string; resourceType?: string; subjects?: string[];
}) {
  const text = [input.name, input.description, input.sportsText, input.resourceType || "", ...(input.subjects || [])].join(" ");
  return {
    sourceType: input.sourceType, sourceId: input.sourceId, name: clean(input.name, 240),
    sourceUrl: clean(input.sourceUrl, 1500), description: clean(input.description, 1500),
    license: normalizeLicense(input.license), licenseStatus: licenseStatus(normalizeLicense(input.license)),
    downloads: Number(input.downloads || 0), likes: Number(input.likes || 0),
    stars: Number(input.stars || 0), lastModified: clean(input.lastModified, 80),
    resourceType: clean(input.resourceType, 120), subjects: safeArray(input.subjects).slice(0, 40),
    sports: inferSports(text), dataDomains: inferDomains(text), query: input.query,
    metadataOnly: true, adapterStatus: "not_connected", automationAllowed: false, dataRightsVerified: false
  };
}
function dataciteRights(attrs: any) {
  const rights = safeArray(attrs?.rightsList);
  for (const item of rights) {
    const normalized = normalizeLicense(item?.rightsIdentifier || item?.rightsUri || item?.rights);
    if (normalized) return normalized;
  }
  return "";
}
export async function discoverPublicResearchSources() {
  const startedAt = new Date().toISOString(), found: any[] = [], failures: any[] = [];
  const indexCounts = { huggingface: 0, github: 0, zenodo: 0, datacite: 0 };
  const requests: Promise<any>[] = [];

  const hfResults = await Promise.all(HF_QUERIES.map(async query => {
    try { return { query, items: await fetchJson("https://huggingface.co/api/datasets?search=" + encodeURIComponent(query) + "&limit=10&sort=downloads&direction=-1") }; }
    catch (e) { failures.push({ source: "huggingface", query, error: String(e).slice(0, 240) }); return { query, items: [] }; }
  }));
  for (const batch of hfResults) for (const item of safeArray(batch.items).slice(0, 8)) {
    const id = clean(item?.id); if (!id) continue;
    const tags = safeArray(item.tags).map(String);
    const license = item.cardData?.license || tags.find(x => x.startsWith("license:"))?.slice(8) || "";
    found.push(candidateRecord({
      sourceType: "huggingface_dataset", sourceId: id, name: id,
      sourceUrl: "https://huggingface.co/datasets/" + id,
      description: clean(item.description || item.cardData?.description, 1500),
      license, sportsText: tags.join(" "), query: batch.query,
      downloads: Number(item.downloads || 0), likes: Number(item.likes || 0),
      lastModified: clean(item.lastModified), subjects: tags
    }));
  }

  const ghResults = await Promise.all(GH_QUERIES.map(async query => {
    try { return { query, data: await fetchJson("https://api.github.com/search/repositories?q=" + encodeURIComponent(query) + "&sort=stars&order=desc&per_page=10") }; }
    catch (e) { failures.push({ source: "github", query, error: String(e).slice(0, 240) }); return { query, data: { items: [] } }; }
  }));
  for (const batch of ghResults) for (const item of safeArray(batch.data?.items).slice(0, 8)) {
    const id = clean(item?.full_name); if (!id) continue;
    found.push(candidateRecord({
      sourceType: "github_repository", sourceId: id, name: id,
      sourceUrl: clean(item.html_url) || "https://github.com/" + id,
      description: clean(item.description, 1500), license: item.license?.spdx_id || "",
      sportsText: safeArray(item.topics).join(" "), query: batch.query,
      stars: Number(item.stargazers_count || 0), lastModified: clean(item.pushed_at),
      subjects: safeArray(item.topics)
    }));
  }

  const zenodoResults = await Promise.all(ZENODO_QUERIES.map(async query => {
    try { return { query, data: await fetchJson("https://zenodo.org/api/records?q=" + encodeURIComponent(query) + "&sort=mostviewed&size=10") }; }
    catch (e) { failures.push({ source: "zenodo", query, error: String(e).slice(0, 240) }); return { query, data: { hits: { hits: [] } } }; }
  }));
  for (const batch of zenodoResults) for (const item of safeArray(batch.data?.hits?.hits).slice(0, 8)) {
    const meta = item?.metadata || {}, id = clean(item?.id ? String(item.id) : item?.doi);
    if (!id) continue;
    const resourceType = clean(meta.resource_type?.type || meta.resource_type?.title, 120);
    if (resourceType && !/dataset/i.test(resourceType)) continue;
    const subjects = safeArray(meta.subjects).map((x: any) => clean(x?.subject || x?.term, 150)).filter(Boolean);
    found.push(candidateRecord({
      sourceType: "zenodo_record", sourceId: id,
      name: clean(meta.title, 240) || "Zenodo record " + id,
      sourceUrl: clean(item.links?.html) || (item.doi ? "https://doi.org/" + item.doi : "https://zenodo.org/records/" + id),
      description: clean(meta.description, 1500),
      license: meta.license?.id || meta.rights?.[0]?.id || "",
      sportsText: subjects.join(" "), subjects, resourceType, query: batch.query,
      downloads: Number(item.stats?.downloads || 0), lastModified: clean(item.updated || item.created)
    }));
  }

  const dataciteResults = await Promise.all(DATACITE_QUERIES.map(async query => {
    try { return { query, data: await fetchJson("https://api.datacite.org/dois?query=" + encodeURIComponent(query) + "&page[size]=10&sort=-published") }; }
    catch (e) { failures.push({ source: "datacite", query, error: String(e).slice(0, 240) }); return { query, data: { data: [] } }; }
  }));
  for (const batch of dataciteResults) for (const item of safeArray(batch.data?.data).slice(0, 8)) {
    const attrs = item?.attributes || {}, id = clean(attrs.doi || item?.id);
    if (!id || (attrs.types?.resourceTypeGeneral && !/dataset/i.test(String(attrs.types.resourceTypeGeneral)))) continue;
    const title = clean(attrs.titles?.[0]?.title, 240) || id;
    const description = clean(attrs.descriptions?.[0]?.description, 1500);
    const subjects = safeArray(attrs.subjects).map((x: any) => clean(x?.subject, 150)).filter(Boolean);
    found.push(candidateRecord({
      sourceType: "datacite_doi", sourceId: id, name: title,
      sourceUrl: "https://doi.org/" + id, description,
      license: dataciteRights(attrs), sportsText: subjects.join(" "), subjects,
      resourceType: clean(attrs.types?.resourceTypeGeneral, 120), query: batch.query,
      lastModified: clean(attrs.updated)
    }));
  }

  indexCounts.huggingface = found.filter(x => x.sourceType === "huggingface_dataset").length;
  indexCounts.github = found.filter(x => x.sourceType === "github_repository").length;
  indexCounts.zenodo = found.filter(x => x.sourceType === "zenodo_record").length;
  indexCounts.datacite = found.filter(x => x.sourceType === "datacite_doi").length;

  const existing = await list<any>("library/research-source-candidates", 1000);
  const byId = new Map(existing.map(x => [x.id, x]));
  let newCount = 0, seen = 0;
  for (const candidate of found) {
    const id = hash(candidate.sourceType + "|" + candidate.sourceId), prior: any = byId.get(id);
    const merged = {
      ...prior, ...candidate, id, firstSeenAt: prior?.firstSeenAt || startedAt,
      lastSeenAt: startedAt, seenCount: Number(prior?.seenCount || 0) + 1,
      searchQueries: [...new Set([...(prior?.searchQueries || []), candidate.query])].slice(-40),
      reviewStatus: prior?.reviewStatus || "review_required",
      // Metadata discovery never grants rights, downloads protected content or activates an adapter.
      automationAllowed: false, dataRightsVerified: false,
      reviewNote: prior?.reviewNote || "Metadata only. Verify dataset-specific licence, provenance, schema, API terms and redistribution rights before adapter design or ingestion."
    };
    await put("library/research-source-candidates", id, merged);
    byId.set(id, merged); seen++; if (!prior) newCount++;
  }
  const summary = {
    id: "source-discovery-" + startedAt.slice(0, 10),
    status: failures.length ? (seen ? "partial" : "failed") : "completed",
    startedAt, completedAt: new Date().toISOString(),
    indexesSearched: ["Hugging Face", "GitHub", "Zenodo", "DataCite"],
    queries: { huggingface: HF_QUERIES, github: GH_QUERIES, zenodo: ZENODO_QUERIES, datacite: DATACITE_QUERIES },
    indexCounts, candidatesSeen: seen, newCandidates: newCount, totalKnownCandidates: byId.size,
    openLicenseCandidates: [...byId.values()].filter(x => x.licenseStatus === "open_data_license_candidate").length,
    licenseUnknown: [...byId.values()].filter(x => x.licenseStatus === "license_missing").length,
    failures, automationEnabled: false, downloadsPerformed: 0, aiCalls: 0
  };
  await put("library/research-source-discovery-runs", summary.id, summary);
  await put("scheduler-state", "public-source-discovery", {
    lastCheck: summary.completedAt, status: summary.status, candidatesSeen: seen,
    newCandidates: newCount, totalKnownCandidates: byId.size, failures: failures.length, indexCounts
  });
  return summary;
}
export async function getPublicResearchSourceDiscoveryStatus() {
  const [state, candidates, runs] = await Promise.all([
    get<any>("scheduler-state", "public-source-discovery"),
    list<any>("library/research-source-candidates", 1000),
    list<any>("library/research-source-discovery-runs", 20)
  ]);
  const latest: any = runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null;
  const byIndex = Object.fromEntries(["huggingface_dataset", "github_repository", "zenodo_record", "datacite_doi"].map(type =>
    [type, candidates.filter(x => x.sourceType === type).length]));
  return {
    status: state?.status || "not_yet_run", lastCheck: state?.lastCheck || null,
    indexesSearched: latest?.indexesSearched || ["Hugging Face", "GitHub", "Zenodo", "DataCite"],
    totalCandidates: candidates.length,
    byIndex,
    openLicenseCandidates: candidates.filter(x => x.licenseStatus === "open_data_license_candidate").length,
    reviewRequired: candidates.filter(x => x.reviewStatus === "review_required").length,
    approvedForAdapterReview: candidates.filter(x => x.reviewStatus === "approved_for_adapter_review").length,
    rejected: candidates.filter(x => x.reviewStatus === "rejected").length,
    latestRun: latest,
    topCandidates: candidates.sort((a, b) => Number(b.downloads || b.stars || 0) - Number(a.downloads || a.stars || 0))
      .slice(0, 30).map(x => ({
        id: x.id, name: x.name, sourceType: x.sourceType, sourceUrl: x.sourceUrl,
        license: x.license, licenseStatus: x.licenseStatus, sports: x.sports,
        dataDomains: x.dataDomains, downloads: x.downloads, stars: x.stars,
        reviewStatus: x.reviewStatus, automationAllowed: false, lastSeenAt: x.lastSeenAt
      }))
  };
}

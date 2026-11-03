import { createHash } from "node:crypto";
import { get, list, put } from "./store.mts";
import { saveCouponRecord } from "./library.mts";

type SourceMode = "manual_import" | "permission_required" | "policy_review_required";

const SOURCES = [
  {
    id: "sts-strefa-inspiracji", name: "STS Strefa Inspiracji", domains: ["sts.pl"],
    url: "https://www.sts.pl/strefa-inspiracji",
    mode: "manual_import" as SourceMode,
    automatedCollection: false,
    note: "Public-page research only. Interactive or account-only coupon details must be supplied by the user. No STS account/session access."
  },
  {
    id: "betbuddyrank", name: "BetBuddyRank — public X tipster records", domains: ["betbuddyrank.com"],
    url: "https://betbuddyrank.com/", mode: "manual_import" as SourceMode, automatedCollection: false,
    access: "public_leaderboard_and_open_data",
    note: "Public leaderboard, methodology, original-post links and open JSON/RSS are useful for verifying public pre-event picks. Preserve original post and settlement links; do not imply full coupon coverage."
  },
  {
    id: "olbg", name: "OLBG — Online Betting Guide", domains: ["olbg.com"],
    url: "https://www.olbg.com/", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_community_pages",
    note: "Public tipster community across many sports. Manual review/import only until terms and official API/feed permissions are confirmed."
  },
  {
    id: "supersocial", name: "Superbet Supersocial", domains: ["superbet.pl"],
    url: "https://superbet.pl/social/aktualnosci/dla-ciebie", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_landing_page_interactive_feed_may_require_account",
    note: "Public product information describes community coupons; actual interactive or account-only content is not accessed. Use publicly visible posts or authorized exports only."
  },
  {
    id: "tipsto", name: "Tipsto", domains: ["tipsto.io"],
    url: "https://www.tipsto.io/", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_community_pages",
    note: "Public sports-tip community and leaderboard. Verify original post time, full pick history, odds and settlement before learning."
  },
  {
    id: "1x2-social", name: "1x2.social", domains: ["1x2.social"],
    url: "https://1x2.social/faq", mode: "manual_import" as SourceMode, automatedCollection: false,
    access: "public_community_and_pick_records",
    note: "Public community describes timestamped picks and automatic settlement; inspect public record and source terms before automated ingestion."
  },
  {
    id: "betslip-social", name: "BetSlip Social", domains: ["betslipsocial.com"],
    url: "https://betslipsocial.com/", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_feed_preview",
    note: "Public feed preview contains illustrative and community-style slips. Confirm each record is a real public post, not demo/sample content, before importing."
  },
  {
    id: "reddit", name: "Reddit public betting communities", domains: ["reddit.com"],
    url: "https://www.reddit.com/r/sportsbook/", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_posts_and_threads",
    note: "Public posts and threads only. Use official Reddit API or approved export after terms/rate-limit review; do not access private communities or user data."
  },
  {
    id: "x-public", name: "X public posts", domains: ["x.com", "twitter.com"],
    url: "https://x.com/search?q=sports%20betting%20picks", mode: "permission_required" as SourceMode, automatedCollection: false,
    access: "public_posts",
    note: "Public posts only. Automated monitoring requires an approved API/plan or written permission; preserve timestamps and original post URLs."
  },
  {
    id: "youtube-public", name: "YouTube public betting analysis", domains: ["youtube.com", "youtu.be"],
    url: "https://www.youtube.com/", mode: "policy_review_required" as SourceMode, automatedCollection: false,
    access: "public_videos_and_descriptions",
    note: "Public videos and descriptions only. Do not download/re-host copyrighted video or infer unspoken picks; capture explicit public selections and timestamps."
  },
  {
    id: "tippium", name: "Tippium", domains: ["tippium.com"],
    url: "https://tippium.com/en/tipsters/",
    mode: "permission_required" as SourceMode,
    automatedCollection: false,
    note: "Do not run bots or automated collection without written platform permission. User-provided exports or snapshots may be imported with an authorization attestation."
  },
  {
    id: "blogabet", name: "Blogabet", domains: ["blogabet.com"],
    url: "https://blogabet.com/",
    mode: "policy_review_required" as SourceMode,
    automatedCollection: false,
    note: "No automated profile harvesting. Minimize personal data; import only user-provided material the user is entitled to retain, subject to platform terms and applicable law."
  },
  {
    id: "tipstrr", name: "Tipstrr", domains: ["tipstrr.com"],
    url: "https://tipstrr.com/",
    mode: "permission_required" as SourceMode,
    automatedCollection: false,
    note: "Automated monitoring or replication is disabled pending written permission or an approved API."
  },
  {
    id: "oddra", name: "Oddra", domains: ["oddra.org"],
    url: "https://www.oddra.org/",
    mode: "policy_review_required" as SourceMode,
    automatedCollection: false,
    note: "Terms and data rights must be reviewed before automation. User-provided records can be imported with an authorization attestation."
  }
];

function clean(value: unknown, max = 3000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function safeUrl(value: unknown): string {
  const raw = clean(value, 2000);
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}
function makeId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

export function listTipsterSources() {
  return {
    sources: SOURCES.map(source => ({
      ...source,
      status: source.mode === "manual_import" ? "manual_import_available" :
        source.mode === "permission_required" ? "awaiting_written_permission" : "awaiting_policy_review"
    })),
    policy: {
      automatedCollectionDefault: "disabled",
      allowedModes: ["official_api", "written_permission", "user_provided_export", "manual_user_submission", "public_page_manual_capture"],
      prohibited: ["login_bypass", "captcha_bypass", "session_cookie_reuse", "paywall_bypass", "private_account_harvesting"],
      settlementRule: "Every imported coupon starts pending. Only evidence-backed settlement may classify it as won or lost."
    }
  };
}

export async function importTipsterCoupon(input: any) {
  const sourceId = clean(input?.sourceId, 80).toLowerCase();
  const source = SOURCES.find(item => item.id === sourceId);
  if (!source) throw new Error("Unknown sourceId. Call list_tipster_sources first.");
  if (input?.authorizedToStore !== true) {
    throw new Error("Confirm authorizedToStore=true only if you are entitled to provide and retain this coupon data.");
  }
  const sourceUrl = safeUrl(input?.sourceUrl);
  if (!sourceUrl) throw new Error("A valid HTTPS sourceUrl is required.");
  const sourceHost = new URL(sourceUrl).hostname.toLowerCase();
  if (!source.domains.some(domain => sourceHost === domain || sourceHost.endsWith("." + domain))) {
    throw new Error("sourceUrl must belong to the selected source domain.");
  }
  const importMethod = clean(input?.importMethod, 50) || "manual_user_submission";
  if (!["manual_user_submission", "user_provided_export", "public_page_manual_capture"].includes(importMethod)) {
    throw new Error("Only manual_user_submission, user_provided_export and public_page_manual_capture are enabled. API and written-permission connectors require separate verification and implementation.");
  }
  const contentClass = clean(input?.contentClass, 100).toLowerCase().replace(/[_-]+/g, " ").replace(/\\s+/g, " ").trim();
  if (importMethod === "public_page_manual_capture" && !["original human coupon", "single human pick"].includes(contentClass)) {
    throw new Error("Public captures must be explicitly classified as 'original human coupon' or 'single human pick'. Promotions, demos, consensus posts and unclassified material are not imported.");
  }
  const couponText = clean(input?.couponText, 30000);
  if (couponText.length < 3) throw new Error("couponText must contain the human coupon selections.");
  const publishedAt = clean(input?.publishedAt, 100);
  const tipsterName = clean(input?.tipsterName, 160);
  const sourceSnapshot = clean(input?.sourceSnapshot, 10000);
  const selections = Array.isArray(input?.selections) ? input.selections.slice(0, 100) : [];
  const id = "tipster-" + makeId([sourceId, sourceUrl, publishedAt, couponText].join("|"));
  const existing = await get<any>("library/tipster-imports", id);
  if (existing) return { ...existing, duplicate: true };

  const saved = await saveCouponRecord({
    id,
    origin: "human",
    label: clean(input?.label, 250) || (tipsterName ? "Public tipster coupon — " + tipsterName : "Public tipster coupon"),
    couponText,
    selections,
    sport: clean(input?.sport, 100),
    country: clean(input?.country, 100),
    competition: clean(input?.competition, 200),
    combinedOdds: Number.isFinite(Number(input?.combinedOdds)) && Number(input?.combinedOdds) > 1 ? Number(input.combinedOdds) : undefined,
    bookmaker: clean(input?.bookmaker, 100) || "Source odds (not assumed to be STS)",
    outcome: "pending",
    source: sourceUrl,
    sourceType: "public_tipster",
    tipsterName,
    publishedAt,
    sourceSnapshot,
    notes: "Imported from " + source.name + ". Coupon retained as pending until settlement is independently evidenced."
  });
  const record = {
    id, couponId: saved.id, sourceId, sourceName: source.name, sourceUrl,
    sourceMode: source.mode, automatedCollection: false,
    importMethod,
    authorizationAttested: true,
    captureClass: importMethod === "public_page_manual_capture" ? contentClass : "user_attested_material",
    contentClass: contentClass || null,
    authorizationAttestedAt: new Date().toISOString(),
    tipsterName: tipsterName || null,
    publishedAt: publishedAt || null,
    importedAt: new Date().toISOString(),
    settlementStatus: "pending",
    duplicate: false
  };
  await put("library/tipster-imports", id, record);
  return record;
}

export async function getTipsterSourceReport() {
  const imports = await list<any>("library/tipster-imports", 1000);
  const counts = imports.reduce((acc: any, item: any) => {
    acc.total++;
    acc.bySource[item.sourceId] = (acc.bySource[item.sourceId] || 0) + 1;
    acc.pending += item.settlementStatus === "pending" ? 1 : 0;
    return acc;
  }, { total: 0, pending: 0, bySource: {} as Record<string, number> });
  return { ...counts, latestImports: imports.slice(0, 100) };
}

export async function listHumanCouponRecords(options: any = {}) {
  const records = await list<any>("library/coupons", 2000);
  const q = clean(options?.q, 500).toLowerCase();
  const sport = clean(options?.sport, 100).toLowerCase();
  const outcome = clean(options?.outcome, 30).toLowerCase();
  const sourceId = clean(options?.sourceId, 80).toLowerCase();
  const filtered = records.filter((item: any) => {
    if (item.origin !== "human") return false;
    const source = clean(item.source, 2000).toLowerCase();
    const searchable = [item.label, item.couponText, item.tipsterName, item.sport, item.competition, source].join(" ").toLowerCase();
    const domain = SOURCES.find(x => x.id === sourceId)?.domains?.[0] || sourceId;
    return (!q || searchable.includes(q)) &&
      (!sport || clean(item.sport, 100).toLowerCase() === sport) &&
      (!outcome || clean(item.outcome, 30).toLowerCase() === outcome) &&
      (!sourceId || source.includes(sourceId) || source.includes(domain));
  });
  const limit = Math.min(200, Math.max(1, Number(options?.limit) || 50));
  return { count: filtered.length, items: filtered.slice(0, limit), retrievedAt: new Date().toISOString() };
}

export async function ensureHumanCouponSeedExamples() {
  const examples = [
    {
      sourceId: "reddit",
      sourceUrl: "https://www.reddit.com/r/sportsbook/comments/1qves75/nba_props_daily_2426_wednesday/",
      tipsterName: "Novel_Calendar5168",
      publishedAt: "2026-02-04",
      sport: "basketball",
      couponText: "Public Reddit comment described a 3-leg NBA player-prop parlay: Jaylin Williams over 29.5 PRA; Kenrich Williams over 24.5 PRA; Aaron Wiggins 4+ assists. The author wrote that the +650 parlay cashed. The result is self-reported in the thread and remains pending until independently checked.",
      selections: [
        { event: null, market: "player points+rebounds+assists", selection: "Jaylin Williams over 29.5 PRA", line: "29.5", odds: null, bookmaker: null },
        { event: null, market: "player points+rebounds+assists", selection: "Kenrich Williams over 24.5 PRA", line: "24.5", odds: null, bookmaker: null },
        { event: null, market: "player assists", selection: "Aaron Wiggins 4+ assists", line: "4+", odds: null, bookmaker: null }
      ],
      sourceSnapshot: JSON.stringify({
        captureType: "manual_public_web_research",
        retrievedAt: new Date().toISOString(),
        threadTitle: "NBA Props Daily - 2/4/26 (Wednesday)",
        publicCommentExcerpt: "Jaylin Williams over 29.5 PRA, Kenrich Williams over 24.5 PRA, Aaron Wiggins 4+ assists +650",
        authorClaim: "The commenter described the parlay as cashed.",
        resultVerification: "not_independently_verified",
        oddsNotation: "+650 American odds as written by the commenter; no normalized price stored",
        limitations: ["No bookmaker slip image or bet receipt", "Event mapping and individual leg prices not supplied", "Self-reported result only", "Must remain pending until independent settlement evidence is found"]
      })
    }
  ];
  const results = [];
  for (const example of examples) {
    results.push(await importTipsterCoupon({
      ...example, importMethod: "public_page_manual_capture", authorizedToStore: true,
      contentClass: "original human coupon",
      label: "Reddit human parlay example — NBA player props"
    }));
  }
  return { seeded: results.length, imported: results.filter(x => !x.duplicate).length, duplicates: results.filter(x => x.duplicate).length };
}

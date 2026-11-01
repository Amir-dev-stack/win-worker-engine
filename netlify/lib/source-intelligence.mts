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
      allowedModes: ["official_api", "written_permission", "user_provided_export", "manual_user_submission"],
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
  if (!["manual_user_submission", "user_provided_export"].includes(importMethod)) {
    throw new Error("Only manual_user_submission and user_provided_export are enabled. API and written-permission connectors require separate verification and implementation.");
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

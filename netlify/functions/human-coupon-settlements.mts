import { createHash } from "node:crypto";
import { requireAuth } from "../lib/auth.mts";
import { get, getWithMetadata, putIfNew } from "../lib/store.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";

const clean = (value: unknown, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const outcomes = new Set(["won", "lost", "void", "partial", "cancelled"]);

export function humanSettlementSubmissionId(couponId: string, evidenceUrl: string, outcome: string): string {
  const identity = JSON.stringify([couponId, evidenceUrl, outcome]);
  return "human-settlement-" + createHash("sha256").update(identity).digest("hex");
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = clean(url.searchParams.get("status"), 80).toLowerCase();
    const cases = await list<any>("library/human-settlement-cases", 2000);
    const filtered = cases.filter(item => !status || item.reviewStatus === status);
    return Response.json({ count: filtered.length, items: filtered.slice(0, 300) }, { headers: { "cache-control": "no-store" } });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsedRequest = await readBoundedJsonObject(req, 16 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;
  const couponId = clean(body?.couponId, 180);
  const claimedOutcome = clean(body?.claimedOutcome, 30).toLowerCase();
  const evidenceUrl = clean(body?.evidenceUrl, 1500);
  const evidenceSummary = clean(body?.evidenceSummary, 4000);
  const reviewerNotes = clean(body?.reviewerNotes, 2000);
  if (!couponId || !outcomes.has(claimedOutcome)) return Response.json({ error: "couponId and a supported claimedOutcome are required" }, { status: 400 });
  let parsed: URL;
  try { parsed = new URL(evidenceUrl); } catch { return Response.json({ error: "A public HTTPS evidenceUrl is required" }, { status: 400 }); }
  if (parsed.protocol !== "https:") return Response.json({ error: "Settlement evidence must use HTTPS" }, { status: 400 });
  if (evidenceSummary.length < 30) return Response.json({ error: "Provide a concise evidence summary of at least 30 characters" }, { status: 400 });
  const coupon = await get<any>("library/coupons", couponId);
  if (!coupon || coupon.origin !== "human") return Response.json({ error: "Human coupon not found" }, { status: 404 });
  if (clean(coupon.outcome).toLowerCase() !== "pending") return Response.json({ error: "Only pending human coupons can enter settlement review" }, { status: 409 });
  if (clean(coupon.source) === evidenceUrl) return Response.json({ error: "The original tipster post cannot independently verify its own claimed result" }, { status: 400 });
  // Preserve the prior duplicate identity while closing the concurrent POST race.
  const id = humanSettlementSubmissionId(couponId, evidenceUrl, claimedOutcome);
  const record = {
    id, couponId, sourceCouponUrl: coupon.source || null,
    claimedOutcome, evidenceUrl, evidenceSummary, reviewerNotes: reviewerNotes || null,
    reviewStatus: "pending_independent_review",
    submitterCredentialId: "owner-internal-token",
    outcomeApplied: false,
    submittedAt: new Date().toISOString(),
    guardrails: [
      "Submission is a claim, not a verified settlement.",
      "Original tipster self-report is not independent settlement evidence.",
      "Coupon outcome remains pending until an independent review process confirms market rules, event identity and all legs."
    ]
  };
  const claim = await putIfNew("library/human-settlement-cases", id, record);
  if (!claim.modified) {
    const existing = await getWithMetadata<any>("library/human-settlement-cases", id);
    if (!existing || existing.value.couponId !== couponId ||
        existing.value.evidenceUrl !== evidenceUrl || existing.value.claimedOutcome !== claimedOutcome) {
      return Response.json({ error: "Settlement submission identity is already occupied; manual reconciliation is required" }, { status: 409 });
    }
    return Response.json({
      accepted: true,
      duplicate: true,
      record: existing.value,
      message: "This evidence submission already exists."
    }, { status: 202 });
  }
  return Response.json({ accepted: true, duplicate: false, record }, { status: 202 });
};
export const config = { path: "/api/human-coupon-settlements" };

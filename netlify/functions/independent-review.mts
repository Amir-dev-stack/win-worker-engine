import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { authorized } from "../lib/auth.mts";
import { get, list, put, remove } from "../lib/store.mts";

const OWNER_SUBMITTER_CREDENTIAL = "owner-internal-token";
const HUMAN_OUTCOMES = new Set(["won", "lost", "void", "partial", "cancelled"]);
const clean = (value: unknown, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && url.hostname ? url : null; }
  catch { return null; }
}
function uniqueHttpsUrls(values: unknown): string[] {
  return Array.isArray(values)
    ? [...new Set(values.slice(0, 20).map(value => clean(value, 1500)).filter(value => Boolean(httpsUrl(value))))]
    : [];
}
function hasNewEvidenceDomain(newUrls: string[], submittedUrls: string[]): boolean {
  const oldHosts = new Set(submittedUrls.map(value => httpsUrl(value)?.hostname.toLowerCase()).filter(Boolean));
  return newUrls.some(value => {
    const host = httpsUrl(value)?.hostname.toLowerCase();
    return Boolean(host && !oldHosts.has(host));
  });
}
function credentialIdFromToken(token: string): string {
  return "reviewer-" + createHash("sha256").update(token).digest("hex").slice(0, 20);
}
async function authenticateReviewer(req: Request): Promise<{ credentialId: string } | null> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  const ownerToken = Netlify.env.get("WIN_INTERNAL_TOKEN");
  if (token.length < 32 || !ownerToken || token === ownerToken) return null;
  const config = await get<any>("library/reviewer-config", "active");
  if (!config?.tokenHash || typeof config.tokenHash !== "string") return null;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "utf8");
  const expected = Buffer.from(config.tokenHash, "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { credentialId: clean(config.credentialId, 80) || credentialIdFromToken(token) };
}
function reviewMetadata(reviewer: any, name: string, notes: string, at: string, urls: string[], checks: Record<string, boolean>) {
  return {
    status: "approved",
    reviewerAuth: "separate_reviewer_credential",
    reviewerCredentialId: reviewer.credentialId,
    reviewerName: name,
    reviewerNameIsSelfReported: true,
    reviewerNotes: notes,
    reviewedAt: at,
    evidence: urls.map(url => ({ type: "reviewer_corroboration", url })),
    checks,
    limitation: "WIN verifies credential separation, not the holder's real-world identity. The owner must share this credential only with a different trusted reviewer."
  };
}
async function pendingQueue() {
  const [lessonCases, humanCases] = await Promise.all([
    list<any>("library/lesson-review-cases", 1000),
    list<any>("library/human-settlement-cases", 2000)
  ]);
  const lessons = await Promise.all(lessonCases.filter(x => x.reviewStatus === "pending_independent_review").slice(0, 200).map(async item => {
    const lesson = await get<any>("library/lessons", item.lessonId);
    return lesson ? {
      id: item.id, caseType: "lesson", submittedAt: item.submittedAt, evidence: item.evidence || [],
      lesson: {
        id: lesson.id, title: lesson.title || lesson.label || lesson.event || lesson.recordType || lesson.id,
        note: lesson.note || lesson.observation || lesson.summary || lesson.hypothesis || "",
        sport: lesson.sport || null, competition: lesson.competition || null
      }
    } : null;
  }));
  const humans = await Promise.all(humanCases.filter(x => x.reviewStatus === "pending_independent_review").slice(0, 200).map(async item => {
    const coupon = await get<any>("library/coupons", item.couponId);
    return coupon ? {
      id: item.id, caseType: "human_coupon", submittedAt: item.submittedAt,
      claimedOutcome: item.claimedOutcome, evidenceUrl: item.evidenceUrl,
      evidenceSummary: item.evidenceSummary, sourceCouponUrl: item.sourceCouponUrl || null,
      coupon: {
        id: coupon.id, label: coupon.label, couponText: coupon.couponText,
        selections: Array.isArray(coupon.selections) ? coupon.selections.slice(0, 100) : [],
        sport: coupon.sport || null, competition: coupon.competition || null, outcome: coupon.outcome
      }
    } : null;
  }));
  return {
    lessonCases: lessons.filter(Boolean),
    humanSettlementCases: humans.filter(Boolean),
    reviewerAccessMode: "separate_credential",
    identityLimitation: "A separate token is not proof of a separate human identity. Share it only with a different trusted person."
  };
}
async function reviewCase(body: any, reviewer: { credentialId: string }) {
  const caseType = clean(body?.caseType, 30);
  const caseId = clean(body?.caseId, 180);
  const decision = clean(body?.decision, 20).toLowerCase();
  const reviewerName = clean(body?.reviewerName, 120);
  const notes = clean(body?.reviewerNotes, 3000);
  const evidenceUrls = uniqueHttpsUrls(body?.evidenceUrls);
  const checks = body?.checks && typeof body.checks === "object" && !Array.isArray(body.checks) ? body.checks : {};
  if (!caseId || !["approve", "reject"].includes(decision) || reviewerName.length < 2 || notes.length < 40)
    return { status: 400, body: { error: "caseId, approve/reject decision, reviewer name and at least 40 characters of reviewer notes are required." } };
  if (!["lesson", "human_coupon"].includes(caseType))
    return { status: 400, body: { error: "caseType must be lesson or human_coupon." } };
  const collection = caseType === "lesson" ? "library/lesson-review-cases" : "library/human-settlement-cases";
  const record = await get<any>(collection, caseId);
  if (!record || record.reviewStatus !== "pending_independent_review")
    return { status: 404, body: { error: "Pending review case not found; it may already have been reviewed." } };
  const submitterCredentialId = clean(record.submitterCredentialId, 100) || OWNER_SUBMITTER_CREDENTIAL;
  if (reviewer.credentialId === submitterCredentialId)
    return { status: 403, body: { error: "Reviewer credential must be different from the submission credential." } };
  const now = new Date().toISOString();

  if (decision === "reject") {
    const rejected = {
      ...record, reviewStatus: "rejected_by_reviewer",
      reviewerCredentialId: reviewer.credentialId, reviewerName,
      reviewerNameIsSelfReported: true, reviewerNotes: notes, reviewedAt: now,
      outcomeApplied: false
    };
    await put(collection, caseId, rejected);
    if (caseType === "lesson") {
      const lesson = await get<any>("library/lessons", record.lessonId);
      if (lesson) await put("library/lessons", record.lessonId, {
        ...lesson, validationStatus: "rejected_by_reviewer", validatedAt: null, validatedBy: null
      });
    }
    return { status: 200, body: { accepted: true, decision, reviewCase: rejected, outcomeApplied: false } };
  }

  if (!evidenceUrls.length)
    return { status: 400, body: { error: "Approval requires at least one new HTTPS corroboration URL supplied by the reviewer." } };

  if (caseType === "lesson") {
    if (checks.claimSupported !== true || checks.independentEvidenceConfirmed !== true)
      return { status: 400, body: { error: "Lesson approval requires both claim-supported and independent-evidence checks." } };
    const lesson = await get<any>("library/lessons", record.lessonId);
    if (!lesson) return { status: 404, body: { error: "Lesson record not found." } };
    const submittedUrls = (Array.isArray(record.evidence) ? record.evidence : [])
      .map((item: any) => typeof item === "string" ? item : item?.url || item?.reference || item?.sourceUrl || item?.evidenceUrl)
      .filter((value: any): value is string => typeof value === "string" && Boolean(httpsUrl(value)));
    if (!hasNewEvidenceDomain(evidenceUrls, submittedUrls))
      return { status: 400, body: { error: "Reviewer corroboration must include a different HTTPS host from submitted evidence." } };
    const allEvidence = [
      ...(Array.isArray(record.evidence) ? record.evidence : []),
      ...evidenceUrls.map(url => ({ type: "reviewer_corroboration", url }))
    ].slice(0, 30);
    const independentReview = reviewMetadata(reviewer, reviewerName, notes, now, evidenceUrls, checks);
    const updatedLesson = {
      ...lesson, validationStatus: "validated",
      submitterCredentialId,
      validationReviewCaseId: caseId,
      validationEvidence: allEvidence,
      independentReview,
      validatedAt: now,
      validatedBy: reviewerName
    };
    const approved = {
      ...record, reviewStatus: "approved",
      reviewerCredentialId: reviewer.credentialId, reviewerName,
      reviewerNameIsSelfReported: true, reviewerNotes: notes,
      reviewerEvidenceUrls: evidenceUrls, reviewedAt: now,
      lessonValidated: true, outcomeApplied: false
    };
    await put("library/lessons", record.lessonId, updatedLesson);
    await put(collection, caseId, approved);
    return { status: 200, body: { accepted: true, decision, reviewCase: approved, lesson: updatedLesson, outcomeApplied: false } };
  }

  if (checks.eventIdentityConfirmed !== true || checks.marketRulesConfirmed !== true ||
      checks.everySelectionReviewed !== true || checks.evidenceIndependent !== true)
    return { status: 400, body: { error: "Human-coupon approval requires confirming event identity, market settlement rules, every selection and independent evidence." } };
  const claimedOutcome = clean(record.claimedOutcome, 30).toLowerCase();
  if (!HUMAN_OUTCOMES.has(claimedOutcome))
    return { status: 400, body: { error: "The claimed settlement outcome is unsupported." } };
  const coupon = await get<any>("library/coupons", record.couponId);
  if (!coupon || coupon.origin !== "human" || clean(coupon.outcome).toLowerCase() !== "pending")
    return { status: 409, body: { error: "Coupon is missing, not human-origin, or no longer pending." } };
  const submittedUrls = [record.sourceCouponUrl, record.evidenceUrl].filter((value: any) =>
    typeof value === "string" && Boolean(httpsUrl(value))
  );
  if (!hasNewEvidenceDomain(evidenceUrls, submittedUrls))
    return { status: 400, body: { error: "Reviewer corroboration must include a different HTTPS host from the original coupon source and submitted settlement evidence." } };

  const allEvidence = [
    { type: "submitted_settlement_evidence", url: record.evidenceUrl },
    ...evidenceUrls.map(url => ({ type: "reviewer_corroboration", url }))
  ];
  const independentReview = reviewMetadata(reviewer, reviewerName, notes, now, evidenceUrls, checks);
  const settlementLearningId = "human-settlement-" + clean(coupon.id, 180);
  const learning = {
    id: settlementLearningId, recordType: "settlement_learning_case",
    couponId: coupon.id, outcome: claimedOutcome,
    sport: coupon.sport || null, country: coupon.country || null,
    competition: coupon.competition || null, combinedOdds: coupon.combinedOdds ?? null,
    selections: Array.isArray(coupon.selections) ? coupon.selections.slice(0, 100) : [],
    settlementSource: record.evidenceUrl, evidence: allEvidence,
    validationStatus: "validated", submitterCredentialId, independentReview,
    observation: "Human coupon outcome was approved after a separate reviewer credential supplied distinct-host corroboration and attested to event identity, market rules, every selection and evidence independence. WIN verifies credential separation, not the holder's identity.",
    createdAt: now, updatedAt: now
  };
  const updatedCoupon = {
    ...coupon, outcome: claimedOutcome, settledAt: now, updatedAt: now,
    settlementSource: record.evidenceUrl, settlementEvidence: allEvidence,
    settlementReviewStatus: "approved_by_separate_reviewer_credential",
    independentSettlementReview: independentReview,
    learningStatus: "recorded", settlementLearningId
  };
  await put("library/coupons", coupon.id, updatedCoupon);
  await remove("library/pending-coupons", coupon.id);
  await remove("library/winning-coupons", coupon.id);
  await remove("library/losing-coupons", coupon.id);
  await remove("library/other-settlements", coupon.id);
  if (claimedOutcome === "won") await put("library/winning-coupons", coupon.id, updatedCoupon);
  else if (claimedOutcome === "lost") await put("library/losing-coupons", coupon.id, updatedCoupon);
  else await put("library/other-settlements", coupon.id, updatedCoupon);
  const historyId = crypto.randomUUID();
  await put("library/coupon-history", historyId, {
    id: historyId, couponId: coupon.id,
    action: "independent_settlement_review_approved",
    outcome: claimedOutcome, at: now, reviewerCredentialId: reviewer.credentialId
  });
  await put("library/lessons", settlementLearningId, learning);
  await put("library/settlement-learning", settlementLearningId, learning);
  const approved = {
    ...record, reviewStatus: "approved",
    reviewerCredentialId: reviewer.credentialId, reviewerName,
    reviewerNameIsSelfReported: true, reviewerNotes: notes,
    reviewerEvidenceUrls: evidenceUrls, reviewedAt: now,
    outcomeApplied: true, appliedCouponOutcome: claimedOutcome,
    settlementLearningId
  };
  await put(collection, caseId, approved);
  return { status: 200, body: { accepted: true, decision, reviewCase: approved, coupon: updatedCoupon, outcomeApplied: true, settlementLearningId } };
}

export default async (req: Request) => {
  let body: any = null;
  if (req.method === "POST") {
    try { body = await req.json(); }
    catch { return Response.json({ error: "Expected JSON body." }, { status: 400 }); }
    if (body?.action === "create_reviewer_access") {
      if (!authorized(req)) return Response.json({ error: "Owner authorization required." }, { status: 401 });
      const token = randomBytes(32).toString("base64url");
      const now = new Date().toISOString();
      const current = await get<any>("library/reviewer-config", "active");
      const credentialId = credentialIdFromToken(token);
      await put("library/reviewer-config", "active", {
        credentialId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        createdAt: now,
        rotatedAt: current ? now : null,
        previousCredentialId: current?.credentialId || null,
        createdBy: OWNER_SUBMITTER_CREDENTIAL,
        status: "active"
      });
      return Response.json({
        created: true, credentialId, token, shownOnce: true,
        warning: "Copy this credential now and provide it only to a different trusted reviewer. It proves credential separation, not the holder's real-world identity. Creating a new credential immediately revokes the previous one."
      }, { headers: { "cache-control": "no-store" } });
    }
  }

  const reviewer = await authenticateReviewer(req);
  if (!reviewer) return Response.json({ error: "Separate reviewer credential is missing or invalid." }, { status: 401 });
  if (req.method === "GET")
    return Response.json(await pendingQueue(), { headers: { "cache-control": "no-store" } });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (body?.action !== "review_case")
    return Response.json({ error: "Reviewer action must be review_case." }, { status: 400 });
  try {
    const result = await reviewCase(body, reviewer);
    return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Review could not be saved: " + String(error).slice(0, 300) }, { status: 500 });
  }
};

export const config = { path: "/api/independent-review" };

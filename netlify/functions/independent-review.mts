import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { authorized } from "../lib/auth.mts";
import { get, getWithMetadata, list, put, putIfMatch, putIfNew, remove } from "../lib/store.mts";
import { deriveReviewedCouponOutcome as deriveCouponOutcome } from "../lib/win-learning-core.mjs";

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
function reviewOperationId(caseType: string, caseId: string): string {
  return "review-" + createHash("sha256").update(caseType + ":" + caseId).digest("hex").slice(0, 40);
}

async function pendingQueue() {
  const [lessonCases, humanCases, winCouponCases, operations] = await Promise.all([
    list<any>("library/lesson-review-cases", 1000),
    list<any>("library/human-settlement-cases", 2000),
    list<any>("library/win-post-match-review-cases", 1000),
    list<any>("library/review-operations", 1000)
  ]);
  const operationById = new Map(operations.map((operation: any) => [operation.id, operation]));
  const lessons = await Promise.all(lessonCases.filter(item =>
    item.reviewStatus === "pending_independent_review" ||
    operationById.get(reviewOperationId("lesson", item.id))?.status === "in_progress"
  ).slice(0, 200).map(async item => {
    const operation: any = operationById.get(reviewOperationId("lesson", item.id));
    const recoveryRequired = operation?.status === "in_progress";
    const lesson = await get<any>("library/lessons", item.lessonId);
    return lesson ? {
      id: item.id, caseType: "lesson", submittedAt: item.submittedAt,
      evidence: item.evidence || [], recoveryRequired,
      recoveryLeaseExpiresAt: recoveryRequired ? operation.leaseExpiresAt : null,
      lesson: {
        id: lesson.id, title: lesson.title || lesson.label || lesson.event || lesson.recordType || lesson.id,
        note: lesson.note || lesson.observation || lesson.summary || lesson.hypothesis || "",
        sport: lesson.sport || null, competition: lesson.competition || null,
        matchResult: lesson.matchResult || null,
        preMatchReports: Array.isArray(lesson.preMatchReports) ? lesson.preMatchReports : [],
        diagnosticChecklist: Array.isArray(lesson.diagnosticChecklist) ? lesson.diagnosticChecklist : [],
        searchLeads: Array.isArray(lesson.searchLeads) ? lesson.searchLeads : []
      }
    } : null;
  }));
  const humans = await Promise.all(humanCases.filter(item =>
    item.reviewStatus === "pending_independent_review" ||
    operationById.get(reviewOperationId("human_coupon", item.id))?.status === "in_progress"
  ).slice(0, 200).map(async item => {
    const operation: any = operationById.get(reviewOperationId("human_coupon", item.id));
    const recoveryRequired = operation?.status === "in_progress";
    const coupon = await get<any>("library/coupons", item.couponId);
    return coupon ? {
      id: item.id, caseType: "human_coupon", submittedAt: item.submittedAt,
      claimedOutcome: item.claimedOutcome, evidenceUrl: item.evidenceUrl,
      evidenceSummary: item.evidenceSummary, sourceCouponUrl: item.sourceCouponUrl || null,
      recoveryRequired,
      recoveryLeaseExpiresAt: recoveryRequired ? operation.leaseExpiresAt : null,
      coupon: {
        id: coupon.id, label: coupon.label, couponText: coupon.couponText,
        selections: Array.isArray(coupon.selections) ? coupon.selections.slice(0, 100) : [],
        sport: coupon.sport || null, competition: coupon.competition || null, outcome: coupon.outcome
      }
    } : null;
  }));
  const winCoupons = await Promise.all(winCouponCases.filter(item =>
    item.reviewStatus === "pending_independent_review" ||
    operationById.get(reviewOperationId("win_coupon", item.id))?.status === "in_progress"
  ).slice(0, 200).map(async item => {
    const operation: any = operationById.get(reviewOperationId("win_coupon", item.id));
    const recoveryRequired = operation?.status === "in_progress";
    const coupon = await get<any>("library/coupons", item.couponId);
    return coupon ? {
      id: item.id, caseType: "win_coupon", submittedAt: item.submittedAt,
      claimedOutcome: item.claimedOutcome, sourceUrls: item.sourceUrls || [],
      searchLeads: item.searchLeads || [],
      legs: item.legs || [], lessonCandidateIds: item.lessonCandidateIds || [],
      recoveryRequired, recoveryLeaseExpiresAt: recoveryRequired ? operation.leaseExpiresAt : null,
      coupon: {
        id: coupon.id, label: coupon.label, couponText: coupon.couponText,
        selections: Array.isArray(coupon.selections) ? coupon.selections.slice(0, 100) : [],
        sport: coupon.sport || null, competition: coupon.competition || null,
        outcome: coupon.outcome, executionStatus: coupon.executionStatus || "not_placed_by_WIN"
      }
    } : null;
  }));
  return {
    lessonCases: lessons.filter(Boolean),
    humanSettlementCases: humans.filter(Boolean),
    winCouponCases: winCoupons.filter(Boolean),
    reviewerAccessMode: "separate_credential",
    identityLimitation: "A separate token is not proof of a separate human identity. Share it only with a different trusted reviewer."
  };
}

const REVIEW_OPERATION_LEASE_MS = 120_000;
const REVIEW_CHECK_KEYS = [
  "claimSupported", "independentEvidenceConfirmed", "eventIdentityConfirmed",
  "marketRulesConfirmed", "everySelectionReviewed", "evidenceIndependent"
];

function reviewFingerprint(input: {
  caseType: string; caseId: string; decision: string; reviewerName: string;
  notes: string; evidenceUrls: string[]; manualLegResults: any[];
  checks: Record<string, boolean>; reviewerCredentialId: string;
}): string {
  const canonical = {
    caseType: input.caseType,
    caseId: input.caseId,
    decision: input.decision,
    reviewerName: input.reviewerName,
    notes: input.notes,
    evidenceUrls: [...input.evidenceUrls].sort(),
    manualLegResults: input.manualLegResults.slice().sort((a:any,b:any)=>a.index-b.index),
    checks: Object.fromEntries(REVIEW_CHECK_KEYS.map(key => [key, input.checks[key] === true])),
    reviewerCredentialId: input.reviewerCredentialId
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function claimReviewOperation(
  operationId: string,
  fingerprint: string,
  reviewerCredentialId: string,
  caseType: string,
  caseId: string
): Promise<
  | { kind: "claimed"; operation: any; etag: string }
  | { kind: "completed"; response: any }
  | { kind: "busy" }
  | { kind: "conflict" }
> {
  const now = Date.now();
  const existing = await getWithMetadata<any>("library/review-operations", operationId);
  if (existing) {
    const operation = existing.value;
    if (operation?.fingerprint !== fingerprint || operation?.reviewerCredentialId !== reviewerCredentialId ||
        operation?.caseType !== caseType || operation?.caseId !== caseId) return { kind: "conflict" };
    if (operation.status === "completed" && operation.response)
      return { kind: "completed", response: operation.response };
    if (operation.status !== "in_progress") return { kind: "conflict" };
    if (Date.parse(operation.leaseExpiresAt || "") > now) return { kind: "busy" };
    const renewed = {
      ...operation,
      updatedAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + REVIEW_OPERATION_LEASE_MS).toISOString()
    };
    const write = await putIfMatch("library/review-operations", operationId, renewed, existing.etag);
    if (!write.modified || !write.etag) return { kind: "busy" };
    return { kind: "claimed", operation: renewed, etag: write.etag };
  }
  const createdAt = new Date(now).toISOString();
  const operation = {
    id: operationId, caseType, caseId, fingerprint, reviewerCredentialId,
    status: "in_progress", createdAt, updatedAt: createdAt,
    leaseExpiresAt: new Date(now + REVIEW_OPERATION_LEASE_MS).toISOString(),
    recoveryPolicy: "retry_same_review_payload_after_lease_expiry"
  };
  const write = await putIfNew("library/review-operations", operationId, operation);
  if (!write.modified || !write.etag) return { kind: "busy" };
  return { kind: "claimed", operation, etag: write.etag };
}

async function completeReviewOperation(operationId: string, operation: any, etag: string, response: any): Promise<any> {
  const completedAt = new Date().toISOString();
  const completed = {
    ...operation, status: "completed", updatedAt: completedAt,
    leaseExpiresAt: null, completedAt, response
  };
  const write = await putIfMatch("library/review-operations", operationId, completed, etag);
  if (write.modified) return response;
  const latest = await getWithMetadata<any>("library/review-operations", operationId);
  if (latest?.value?.status === "completed" && latest.value.fingerprint === operation.fingerprint)
    return latest.value.response;
  throw new Error("Review artifacts were saved, but the completion marker needs the same review submission retried after the operation lease expires.");
}

async function reviewCase(body: any, reviewer: { credentialId: string }) {
  const caseType = clean(body?.caseType, 30);
  const caseId = clean(body?.caseId, 180);
  const decision = clean(body?.decision, 20).toLowerCase();
  const reviewerName = clean(body?.reviewerName, 120);
  const notes = clean(body?.reviewerNotes, 3000);
  const submittedReviewerEvidence = uniqueHttpsUrls(body?.evidenceUrls);
  const manualLegResults = Array.isArray(body?.manualLegResults)
    ? body.manualLegResults.slice(0,100).map((item:any)=>({
      index:Number(item?.index),status:clean(item?.status,20).toLowerCase(),
      evidenceUrl:clean(item?.evidenceUrl,1500),notes:clean(item?.notes,1000)
    })) : [];
  if(manualLegResults.some((item:any)=>!Number.isInteger(item.index)||item.index<1||
    !["won","lost","void"].includes(item.status)||!httpsUrl(item.evidenceUrl)))
    return {status:400,body:{error:"Every manually resolved leg needs a valid 1-based index, won/lost/void result and an independent HTTPS evidence URL."}};
  const evidenceUrls = uniqueHttpsUrls([...submittedReviewerEvidence,...manualLegResults.map((x:any)=>x.evidenceUrl)]);
  const checks = body?.checks && typeof body.checks === "object" && !Array.isArray(body.checks) ? body.checks : {};
  if (!caseId || !["approve", "reject"].includes(decision) || reviewerName.length < 2 || notes.length < 40)
    return { status: 400, body: { error: "caseId, approve/reject decision, reviewer name and at least 40 characters of reviewer notes are required." } };
  if (!["lesson", "human_coupon", "win_coupon"].includes(caseType))
    return { status: 400, body: { error: "caseType must be lesson, human_coupon or win_coupon." } };

  const operationId = reviewOperationId(caseType, caseId);
  const fingerprint = reviewFingerprint({
    caseType, caseId, decision, reviewerName, notes, evidenceUrls, manualLegResults,
    checks: Object.fromEntries(REVIEW_CHECK_KEYS.map(key => [key, checks[key] === true])),
    reviewerCredentialId: reviewer.credentialId
  });
  const priorOperation = await getWithMetadata<any>("library/review-operations", operationId);
  if (priorOperation) {
    const prior = priorOperation.value;
    if (prior?.fingerprint !== fingerprint || prior?.reviewerCredentialId !== reviewer.credentialId)
      return { status: 409, body: { error: "This case already has a review operation with a different payload or reviewer. Reuse the original reviewer and exact submission to recover it." } };
    if (prior.status === "completed" && prior.response)
      return { status: 200, body: prior.response };
    if (prior.status !== "in_progress")
      return { status: 409, body: { error: "Review operation is in an unsupported state; no new settlement was applied." } };
    if (Date.parse(prior.leaseExpiresAt || "") > Date.now())
      return { status: 409, body: { error: "This review is already being processed. Retry the exact same submission after the operation lease expires.", retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(prior.leaseExpiresAt) - Date.now()) / 1000)) } };
  }

  const collection = caseType === "lesson" ? "library/lesson-review-cases"
    : caseType === "human_coupon" ? "library/human-settlement-cases"
    : "library/win-post-match-review-cases";
  const record = await get<any>(collection, caseId);
  if (!record || (!priorOperation && record.reviewStatus !== "pending_independent_review"))
    return { status: 404, body: { error: "Pending review case not found; it may already have been reviewed." } };
  const submitterCredentialId = clean(record.submitterCredentialId, 100) || OWNER_SUBMITTER_CREDENTIAL;
  if (reviewer.credentialId === submitterCredentialId)
    return { status: 403, body: { error: "Reviewer credential must be different from the submission credential." } };

  let lesson: any = null;
  let coupon: any = null;
  let claimedOutcome = clean(record.claimedOutcome, 30).toLowerCase();
  let reviewedLegs:any[] = [];
  const settlementLearningId = caseType === "human_coupon" ? "human-settlement-" + clean(record.couponId, 180)
    : caseType === "win_coupon" ? "win-settlement-" + clean(record.couponId, 180) : "";

  if(decision==="approve"&&caseType==="win_coupon"){
    const sourceLegs=Array.isArray(record.legs)?record.legs:[];
    const manualByIndex=new Map<number,any>();
    for(const item of manualLegResults){
      if(item.index>sourceLegs.length||manualByIndex.has(item.index))
        return {status:400,body:{error:"Manual leg resolutions must use unique indexes that exist in the coupon."}};
      manualByIndex.set(item.index,item);
    }
    for(const [index,manual] of manualByIndex.entries()){
      const leg=sourceLegs[index-1];
      const oldUrls=[
        leg?.sourceUrl,
        ...(Array.isArray(leg?.searchLeads)?leg.searchLeads.map((x:any)=>x.url):[])
      ].filter((value:any)=>typeof value==="string"&&Boolean(httpsUrl(value)));
      if(!hasNewEvidenceDomain([manual.evidenceUrl],oldUrls))
        return {status:400,body:{error:"Manual result for leg "+index+" needs an HTTPS source from a different host than its original result/search leads."}};
    }
    reviewedLegs=sourceLegs.map((leg:any,index:number)=>{
      const manual=manualByIndex.get(index+1);
      if(!manual)return {...leg};
      return {
        ...leg,status:manual.status,reason:"Leg outcome manually resolved by an independent reviewer against the supplied source.",
        resolutionMode:"reviewer_manual_resolution",reviewerEvidenceUrl:manual.evidenceUrl,
        reviewerResolutionNotes:manual.notes||null,checkedAt:new Date().toISOString()
      };
    });
    if(reviewedLegs.length!==sourceLegs.length||!reviewedLegs.length)
      return {status:400,body:{error:"Coupon review requires the full stored list of selections."}};
    if(reviewedLegs.some((leg:any)=>!["won","lost","void"].includes(String(leg.status))))
      return {status:400,body:{error:"Every coupon leg must have a verified automatic result or a manual reviewer resolution before approval."}};
    claimedOutcome=deriveCouponOutcome(reviewedLegs)||"";
    if(!HUMAN_OUTCOMES.has(claimedOutcome))
      return {status:400,body:{error:"The full coupon outcome could not be derived from every reviewed leg."}};
  }

  if (decision === "approve") {
    if (!evidenceUrls.length)
      return { status: 400, body: { error: "Approval requires at least one new HTTPS corroboration URL supplied by the reviewer." } };
    if (caseType === "lesson") {
      if (checks.claimSupported !== true || checks.independentEvidenceConfirmed !== true)
        return { status: 400, body: { error: "Lesson approval requires both claim-supported and independent-evidence checks." } };
      lesson = await get<any>("library/lessons", record.lessonId);
      if (!lesson) return { status: 404, body: { error: "Lesson record not found." } };
      const submittedUrls = (Array.isArray(record.evidence) ? record.evidence : [])
        .map((item: any) => typeof item === "string" ? item : item?.url || item?.reference || item?.sourceUrl || item?.evidenceUrl)
        .filter((value: any): value is string => typeof value === "string" && Boolean(httpsUrl(value)));
      if (!hasNewEvidenceDomain(evidenceUrls, submittedUrls))
        return { status: 400, body: { error: "Reviewer corroboration must include a different HTTPS host from submitted evidence." } };
    } else {
      if (checks.eventIdentityConfirmed !== true || checks.marketRulesConfirmed !== true ||
          checks.everySelectionReviewed !== true || checks.evidenceIndependent !== true)
        return { status: 400, body: { error: "Coupon approval requires confirming event identity, market rules, every selection and independent evidence." } };
      if (caseType === "human_coupon" && !HUMAN_OUTCOMES.has(claimedOutcome))
        return { status: 400, body: { error: "The claimed settlement outcome is unsupported." } };
      coupon = await get<any>("library/coupons", record.couponId);
      const expectedOrigin = caseType === "human_coupon" ? "human" : "win";
      const alreadyApplied = Boolean(priorOperation) && coupon?.origin === expectedOrigin &&
        clean(coupon?.outcome).toLowerCase() === claimedOutcome && coupon?.settlementLearningId === settlementLearningId;
      if (!coupon || coupon.origin !== expectedOrigin ||
          (clean(coupon.outcome).toLowerCase() !== "pending" && !alreadyApplied))
        return { status: 409, body: { error: "Coupon is missing, has the wrong origin, or was settled by a different operation." } };
      const submittedUrls = caseType === "human_coupon"
        ? [record.sourceCouponUrl, record.evidenceUrl]
        : [
          ...(Array.isArray(record.sourceUrls) ? record.sourceUrls : []),
          ...(Array.isArray(record.searchLeads) ? record.searchLeads.map((x:any)=>x.url) : [])
        ];
      if (!hasNewEvidenceDomain(evidenceUrls, submittedUrls.filter((value: any) =>
        typeof value === "string" && Boolean(httpsUrl(value))
      )))
        return { status: 400, body: { error: "Reviewer corroboration must include a different HTTPS host from the submitted match-result evidence." } };
    }
  }

  const claimed = await claimReviewOperation(operationId, fingerprint, reviewer.credentialId, caseType, caseId);
  if (claimed.kind === "completed") return { status: 200, body: claimed.response };
  if (claimed.kind === "conflict")
    return { status: 409, body: { error: "A different review operation already owns this case." } };
  if (claimed.kind === "busy")
    return { status: 409, body: { error: "This review is already being processed or claimed by another request. Retry the exact same submission after the operation lease expires.", retryAfterSeconds: 120 } };
  const reviewedAt = claimed.operation.createdAt;
  const operationEtag = claimed.etag;

  if (decision === "reject") {
    const rejected = {
      ...record, reviewStatus: "rejected_by_reviewer",
      reviewerCredentialId: reviewer.credentialId, reviewerName,
      reviewerNameIsSelfReported: true, reviewerNotes: notes, reviewedAt,
      outcomeApplied: false, reviewOperationId: operationId
    };
    if (caseType === "lesson") {
      lesson = await get<any>("library/lessons", record.lessonId);
      if (lesson) await put("library/lessons", record.lessonId, {
        ...lesson, validationStatus: "rejected_by_reviewer", validatedAt: null, validatedBy: null
      });
    }
    await put(collection, caseId, rejected);
    if (caseType === "win_coupon") {
      const followupId = "post-match-" + clean(record.couponId, 180);
      const followup = await get<any>("library/post-match-followups", followupId);
      if (followup) await put("library/post-match-followups", followupId, {
        ...followup, status: "review_rejected", reviewRejectedAt: reviewedAt,
        reviewRejectNotes: notes, updatedAt: reviewedAt
      });
    }
    const response = { accepted: true, decision, reviewCase: rejected, outcomeApplied: false };
    await completeReviewOperation(operationId, claimed.operation, operationEtag, response);
    return { status: 200, body: response };
  }

  if (caseType === "lesson") {
    const allEvidence = [
      ...(Array.isArray(record.evidence) ? record.evidence : []),
      ...evidenceUrls.map(url => ({ type: "reviewer_corroboration", url }))
    ].slice(0, 30);
    const independentReview = reviewMetadata(reviewer, reviewerName, notes, reviewedAt, evidenceUrls, checks);
    const updatedLesson = {
      ...lesson, validationStatus: "validated", submitterCredentialId,
      validationReviewCaseId: caseId, validationEvidence: allEvidence,
      independentReview, validatedAt: reviewedAt, validatedBy: reviewerName
    };
    const approved = {
      ...record, reviewStatus: "approved",
      reviewerCredentialId: reviewer.credentialId, reviewerName,
      reviewerNameIsSelfReported: true, reviewerNotes: notes,
      reviewerEvidenceUrls: evidenceUrls, reviewedAt,
      lessonValidated: true, outcomeApplied: false, reviewOperationId: operationId
    };
    await put("library/lessons", record.lessonId, updatedLesson);
    await put(collection, caseId, approved);
    const response = { accepted: true, decision, reviewCase: approved, lesson: updatedLesson, outcomeApplied: false };
    await completeReviewOperation(operationId, claimed.operation, operationEtag, response);
    return { status: 200, body: response };
  }

  const submittedEvidence = caseType === "human_coupon"
    ? [{ type: "submitted_settlement_evidence", url: record.evidenceUrl }]
    : (Array.isArray(record.sourceUrls) ? record.sourceUrls : []).map((url: string) => ({ type: "automated_match_result", url }));
  const manualEvidence = reviewedLegs.filter((leg:any)=>leg.resolutionMode==="reviewer_manual_resolution")
    .map((leg:any)=>({type:"reviewer_manual_leg_settlement",index:leg.index,url:leg.reviewerEvidenceUrl}));
  const allEvidence = [
    ...submittedEvidence,
    ...manualEvidence,
    ...evidenceUrls.map(url => ({ type: "reviewer_corroboration", url }))
  ];
  const independentReview = reviewMetadata(reviewer, reviewerName, notes, reviewedAt, evidenceUrls, checks);
  const learning = {
    id: settlementLearningId, recordType: caseType === "human_coupon" ? "settlement_learning_case" : "verified_coupon_outcome",
    couponId: coupon.id, outcome: claimedOutcome,
    sport: coupon.sport || null, country: coupon.country || null,
    competition: coupon.competition || null, combinedOdds: coupon.combinedOdds ?? null,
    selections: Array.isArray(coupon.selections) ? coupon.selections.map((selection:any,index:number)=>({
      ...selection,result:caseType==="win_coupon"?reviewedLegs[index]?.status:selection.result,
      resultSource:caseType==="win_coupon"?(reviewedLegs[index]?.reviewerEvidenceUrl||reviewedLegs[index]?.sourceUrl||null):selection.resultSource
    })).slice(0, 100) : [],
    legs:caseType==="win_coupon"?reviewedLegs:undefined,
    searchLeads:caseType==="win_coupon"?(record.searchLeads||[]):undefined,
    settlementSource: record.evidenceUrl || (Array.isArray(record.sourceUrls) ? record.sourceUrls[0] || null : null), evidence: allEvidence,
    validationStatus: caseType === "human_coupon" ? "validated" : "outcome_verified_cause_unvalidated",
    submitterCredentialId, independentReview,
    observation: caseType === "human_coupon"
      ? "Human coupon outcome was approved after a separate reviewer credential supplied distinct-host corroboration and attested to event identity, market rules, every selection and evidence independence. WIN verifies credential separation, not the holder's identity."
      : "WIN research-coupon outcome was approved after a separate reviewer credential corroborated match identity, market rules and every leg. The coupon was not placed by WIN; the result is a forecast calibration observation, not a record of a real wager.",
    createdAt: reviewedAt, updatedAt: reviewedAt, reviewOperationId: operationId
  };
  const updatedCoupon = {
    ...coupon, outcome: claimedOutcome, settledAt: coupon.settledAt || reviewedAt,
    selections:caseType==="win_coupon"&&Array.isArray(coupon.selections)?coupon.selections.map((selection:any,index:number)=>({
      ...selection,result:reviewedLegs[index]?.status||selection.result,
      resultSource:reviewedLegs[index]?.reviewerEvidenceUrl||reviewedLegs[index]?.sourceUrl||null,
      resultEvidence:reviewedLegs[index]?.reviewerEvidenceUrl?[{url:reviewedLegs[index].reviewerEvidenceUrl}]:selection.resultEvidence
    })):coupon.selections,
    updatedAt: reviewedAt, settlementSource: record.evidenceUrl || (Array.isArray(record.sourceUrls) ? record.sourceUrls[0] || null : null),
    settlementEvidence: allEvidence,
    settlementReviewStatus: "approved_by_separate_reviewer_credential",
    independentSettlementReview: independentReview,
    learningStatus: "recorded", settlementLearningId, reviewOperationId: operationId
  };
  const validatedLessonCandidates:string[]=[];
  if(caseType==="win_coupon"){
    const sourceRun=coupon.runId?await get<any>("runs",coupon.runId):null;
    const preMatchReports=(sourceRun?.workers||[]).filter((report:any)=>
      ["D1","D2","D3","D4","D6","D8"].includes(report.departmentId)
    ).map((report:any)=>({
      departmentId:report.departmentId,role:clean(report.role,180),status:report.status,
      report:clean(report.report,5000),citations:(Array.isArray(report.citations)?report.citations:[]).slice(0,20)
    }));
    for(const [legIndex,leg] of reviewedLegs.entries()){
      if(leg.status!=="lost")continue;
      const index=Number(leg.index)||legIndex+1;
      const lessonId="post-match-diagnostic-"+coupon.id+"-"+index;
      let lesson=await get<any>("library/lessons",lessonId);
      if(!lesson){
        lesson={
          id:lessonId,recordType:"post_match_diagnostic_candidate",
          title:"Post-match review: "+clean(leg.event,200),
          sport:coupon.sport||"football",competition:coupon.competition||null,outcome:"lost",
          couponId:coupon.id,runId:coupon.runId||null,market:leg.market,pick:leg.pick||leg.selection,
          predictionOdds:leg.odds,actualScore:Number.isFinite(leg.homeScore)&&Number.isFinite(leg.awayScore)
            ?String(leg.homeScore)+"-"+String(leg.awayScore):null,
          matchResult:{homeTeam:leg.homeTeam,awayTeam:leg.awayTeam,homeScore:leg.homeScore??null,
            awayScore:leg.awayScore??null,eventStart:leg.matchDateTimeUTC||leg.startTime||null,
            sourceProvider:leg.sourceProvider||"reviewer_supplied",sourceUrl:leg.reviewerEvidenceUrl||leg.sourceUrl||null},
          preMatchReports,
          searchLeads:Array.isArray(leg.searchLeads)?leg.searchLeads:[],
          observation:"The separate coupon reviewer recorded this selection as a loss after checking the supplied result source. This validates the selection outcome, not the cause of the miss.",
          note:preMatchReports.length
            ?"Compare the stored D1/D2/D3/D4/D6/D8 pre-match reports with the reviewed result and independent match facts. Identify only specific contradictions or missed evidence; do not infer causation from the score."
            :"No archived pre-match department reports were available. No causal explanation is established.",
          diagnosticChecklist:[
            "Check D1 fixture identity, kickoff and event status.",
            "Compare D2's form, availability, tactics and matchup assumptions with dated post-match facts.",
            "Check D3's market, period, line and settlement interpretation.",
            "Check D4's probabilities, price, sample size and uncertainty.",
            "Check D6's correlation and common-cause exposure.",
            "Check D8's evidence integrity and assumptions.",
            "Propose a change only where independent evidence supports it."
          ],
          validationStatus:"candidate_for_validation",
          evidence:[
            ...(leg.sourceUrl?[{type:"automated_match_result",url:leg.sourceUrl}]:[]),
            ...(leg.reviewerEvidenceUrl?[{type:"reviewer_manual_result",url:leg.reviewerEvidenceUrl}]:[])
          ],
          createdAt:reviewedAt,submitterCredentialId:reviewer.credentialId,
          outcomeReviewerCredentialId:reviewer.credentialId
        };
        await put("library/lessons",lessonId,lesson);
      }else{
        lesson={...lesson,submitterCredentialId:reviewer.credentialId,
          outcomeReviewerCredentialId:reviewer.credentialId};
        await put("library/lessons",lessonId,lesson);
      }
      const lessonCaseId="post-match-lesson-review-"+coupon.id+"-"+index;
      const oldCase=await get<any>("library/lesson-review-cases",lessonCaseId);
      await put("library/lesson-review-cases",lessonCaseId,{
        ...(oldCase||{}),id:lessonCaseId,lessonId,reviewStatus:"pending_independent_review",
        evidence:lesson.evidence||[],submittedAt:oldCase?.submittedAt||reviewedAt,
        submittedBy:"post_match_outcome_review",
        submitterCredentialId:reviewer.credentialId,
        independentReviewerRequired:true,outcomeApplied:false,
        guardrails:["This is a candidate diagnosis, not a validated causal lesson. A different reviewer credential must independently compare pre-match reports with dated match evidence."]
      });
      validatedLessonCandidates.push(lessonId);
    }
  }
  await put("library/coupons", coupon.id, updatedCoupon);
  await remove("library/pending-coupons", coupon.id);
  await remove("library/winning-coupons", coupon.id);
  await remove("library/losing-coupons", coupon.id);
  await remove("library/other-settlements", coupon.id);
  if (claimedOutcome === "won") await put("library/winning-coupons", coupon.id, updatedCoupon);
  else if (claimedOutcome === "lost") await put("library/losing-coupons", coupon.id, updatedCoupon);
  else await put("library/other-settlements", coupon.id, updatedCoupon);
  const historyId = "review-" + createHash("sha256").update(caseType + ":" + caseId).digest("hex").slice(0, 40);
  await put("library/coupon-history", historyId, {
    id: historyId, couponId: coupon.id, action: "independent_settlement_review_approved",
    outcome: claimedOutcome, at: reviewedAt, reviewerCredentialId: reviewer.credentialId, reviewOperationId: operationId
  });
  if (caseType === "human_coupon") await put("library/lessons", settlementLearningId, learning);
  if (caseType === "win_coupon") await put("library/win-settlement-learning", settlementLearningId, learning);
  await put("library/settlement-learning", settlementLearningId, learning);
  const approved = {
    ...record, ...(caseType==="win_coupon"?{legs:reviewedLegs,claimedOutcome,
      searchLeads:record.searchLeads||[],lessonCandidateIds:validatedLessonCandidates}:{}),
    reviewStatus: "approved", reviewerCredentialId: reviewer.credentialId,
    reviewerName, reviewerNameIsSelfReported: true, reviewerNotes: notes,
    reviewerEvidenceUrls: evidenceUrls, reviewedAt, outcomeApplied: true,
    appliedCouponOutcome: claimedOutcome, settlementLearningId, reviewOperationId: operationId
  };
  await put(collection, caseId, approved);
  if (caseType === "win_coupon") {
    await put("library/post-match-followups", "post-match-" + coupon.id, {
      ...(await get<any>("library/post-match-followups", "post-match-" + coupon.id) || {}),
      status: "independently_reviewed", outcome: claimedOutcome, legs:reviewedLegs,
      independentReview, reviewedAt, settlementLearningId, updatedAt: reviewedAt
    });
  }
  const response = { accepted: true, decision, reviewCase: approved, coupon: updatedCoupon, outcomeApplied: true, settlementLearningId };
  await completeReviewOperation(operationId, claimed.operation, operationEtag, response);
  return { status: 200, body: response };
}


// Direct service entry point for the isolated in-memory end-to-end test. The
// ordinary Netlify handler still authenticates reviewer tokens before calling
// this same reviewCase implementation.
export async function reviewCaseForIsolatedTest(body: any, reviewer: { credentialId: string }) {
  if (process.env.WIN_STORE_TEST_MODE !== "1") {
    throw new Error("Direct reviewer invocation is disabled outside the isolated test process.");
  }
  return reviewCase(body, reviewer);
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

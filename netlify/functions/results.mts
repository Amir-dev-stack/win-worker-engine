import { createHash } from "node:crypto";
import { requireAuth } from "../lib/auth.mts";
import { get, list, put, putIfNew } from "../lib/store.mts";

const MAX_RESULT_REQUEST_BYTES = 64 * 1024;

export async function readResultSubmissionBody(req: Request): Promise<{ body: any } | Response> {
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "application_json_required" }, { status: 415 });
  }
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESULT_REQUEST_BYTES) {
    return Response.json({ error: "request_body_too_large" }, { status: 413 });
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (req.body) {
    const reader = req.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        totalBytes += part.value.byteLength;
        if (totalBytes > MAX_RESULT_REQUEST_BYTES) {
          await reader.cancel();
          return Response.json({ error: "request_body_too_large" }, { status: 413 });
        }
        chunks.push(part.value);
      }
    } catch {
      return Response.json({ error: "request_body_unreadable" }, { status: 400 });
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return Response.json({ error: "request_body_invalid_utf8" }, { status: 400 }); }
  let body: any;
  try { body = JSON.parse(raw); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "json_object_required" }, { status: 400 });
  }
  return { body };
}

const SETTLED_OUTCOMES = new Set(["won", "lost", "void", "partial", "cancelled"]);
const text = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const array = (value: unknown, max = 100) =>
  Array.isArray(value) ? value.slice(0, max) : [];
const isHttpsUrl = (value: unknown) => {
  const raw = text(value, 1500);
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};
const evidenceHasHttpsUrl = (entry: any) => isHttpsUrl(
  typeof entry === "string" ? entry : entry?.url || entry?.reference || entry?.sourceUrl || entry?.evidenceUrl
);
const searchable = (value: unknown) => {
  try { return JSON.stringify(value).toLowerCase(); } catch { return ""; }
};

async function archivePredictionLearning(prediction: any, result: any) {
  const predictionId = text(prediction.id || result.predictionId, 180);
  const learningId = "prediction-settlement-" + predictionId;
  const brief = prediction.brief || {};
  const coupons = array(prediction.coupons, 100);
  const selections = coupons.flatMap((coupon: any) =>
    array(coupon?.legs, 100).map((leg: any, index: number) => ({
      couponId: text(coupon?.id, 180) || null,
      couponLabel: text(coupon?.label, 250) || null,
      index: index + 1,
      event: text(leg?.event || leg?.match || leg?.fixture, 250) || text(brief.event, 250) || null,
      market: text(leg?.market || leg?.selectionType, 180) || null,
      pick: text(leg?.selection || leg?.pick || leg?.outcome, 180) || null,
      odds: leg?.odds ?? leg?.price ?? null,
      settlementRule: text(leg?.settlementRule, 500) || null
    }))
  );
  const observation =
    "A frozen WIN prediction has a user-submitted outcome classification and an HTTPS evidence reference. WIN has not independently verified the source or settlement. This is an observation candidate, not proof that any selection, department or strategy caused the outcome.";
  const learningRecord = {
    id: learningId,
    recordType: "prediction_settlement_learning_case",
    predictionId,
    runId: prediction.runId || null,
    outcome: result.outcome,
    sport: brief.sport || null,
    country: brief.country || null,
    competition: brief.competition || null,
    event: brief.event || null,
    combinedOdds: coupons.length === 1 ? coupons[0]?.combinedOdds ?? null : null,
    coupons: coupons.map((coupon: any) => ({
      id: text(coupon?.id, 180) || null,
      label: text(coupon?.label, 250) || null,
      status: text(coupon?.status, 40) || null,
      combinedOdds: coupon?.combinedOdds ?? null
    })),
    selections,
    settlementSource: result.settlementSource,
    evidence: result.evidence,
    observation,
    settlementReviewStatus: "pending_independent_review",
    validationStatus: "candidate_for_validation",
    createdAt: result.recordedAt,
    updatedAt: new Date().toISOString()
  };

  // Stable key makes retries idempotent; settlement cases remain unvalidated
  // until a separate reviewer supplies independent evidence.
  await put("library/lessons", learningId, learningRecord);
  await put("library/settlement-learning", learningId, learningRecord);

  const profiles = await list<any>("library/entity-profiles", 1000);
  const entityTerms = [
    brief.event,
    ...array(brief.teams, 30),
    ...array(brief.clubs, 30),
    ...array(brief.players, 100),
    ...selections.flatMap((selection: any) => [selection.event, selection.pick])
  ].filter((value: any) => typeof value === "string" && value.trim());
  const matchingProfiles = profiles.filter((profile: any) => {
    const scope = profile.scope || {};
    const same = (actual: any, expected: any) =>
      !expected || !actual || text(actual, 250).toLowerCase() === text(expected, 250).toLowerCase();
    const sameSport = same(scope.sport, brief.sport);
    const sameCountry = same(scope.country, brief.country);
    const sameCompetition = same(scope.competition, brief.competition);
    const profileText = searchable({ name: profile.name, scope, aliases: profile.aliases });
    const entityMentioned = entityTerms.some((term: string) => profileText.includes(term.toLowerCase()));
    const hierarchyMatch = ["sport", "country", "league", "specialist"].includes(profile.entityType);
    return sameSport && sameCountry && sameCompetition && (hierarchyMatch || entityMentioned);
  });

  for (const profile of matchingProfiles) {
    const agentId = text(profile.agentId, 200);
    const profileId = text(profile.id, 180);
    if (!agentId || !profileId) continue;
    const observationId = learningId + ":" + profileId;
    await put("library/agent-observations", observationId, {
      id: observationId,
      agentId,
      entityId: profileId,
      entityType: profile.entityType,
      predictionId,
      runId: prediction.runId || null,
      outcome: result.outcome,
      recordType: "prediction_settlement_observation",
      observation,
      settlementLearningId: learningId,
      evidence: result.evidence,
      status: "user_submitted_outcome_unverified",
      observedAt: result.recordedAt
    });
    await put("library/agent-profiles", agentId, {
      ...(await get<any>("library/agent-profiles", agentId) || {}),
      agentId,
      entityId: profileId,
      entityType: profile.entityType,
      name: profile.name,
      scope: profile.scope,
      lastUserSubmittedSettlementLearningId: learningId,
      lastUserSubmittedOutcome: result.outcome,
      lastLearningAt: result.recordedAt
    });
  }

  return {
    learningStatus: "recorded",
    settlementLearningId: learningId,
    learningAgentsUpdated: matchingProfiles.length
  };
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const parsedRequest = await readResultSubmissionBody(req);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;

  const predictionId = text(body?.predictionId, 180);
  const outcome = text(body?.outcome, 20).toLowerCase();
  const settlementSource = text(body?.settlementSource, 1000);
  const evidence = Array.isArray(body?.evidence)
    ? body.evidence.slice(0, 30)
    : body?.evidence ? [body.evidence] : [];

  if (!predictionId || !outcome || !settlementSource) {
    return Response.json({ error: "predictionId, outcome and settlementSource are required" }, { status: 400 });
  }
  if (!SETTLED_OUTCOMES.has(outcome)) {
    return Response.json({ error: "outcome must be won, lost, void, partial or cancelled" }, { status: 400 });
  }
  if (!isHttpsUrl(settlementSource) || !evidence.some(evidenceHasHttpsUrl)) {
    return Response.json({
      error: "Provide an HTTPS settlement source URL and at least one HTTPS evidence URL. User-submitted outcomes remain pending independent verification."
    }, { status: 400 });
  }

  const prediction = await get<any>("predictions", predictionId);
  if (!prediction) return Response.json({ error: "Prediction not found" }, { status: 404 });

  // First preserve compatibility with results written before claims existed.
  // More than one legacy canonical result is ambiguous and must not be guessed.
  const existingMatches = (await list<any>("results", 500))
    .filter((item: any) => item.predictionId === predictionId);
  if (existingMatches.length > 1) {
    return Response.json({
      error: "Multiple canonical results already exist for this prediction; manual reconciliation is required"
    }, { status: 409 });
  }
  const existing = existingMatches[0] || null;
  if (existing && existing.outcome !== outcome) {
    return Response.json({
      error: "This prediction already has a different recorded outcome; an explicit correction workflow is required",
      existingOutcome: existing.outcome
    }, { status: 409 });
  }

  const proposedResult = existing
    ? { ...existing, settlementSource: existing.settlementSource || settlementSource,
        evidence: existing.evidence || evidence,
        settlementReviewStatus: existing.settlementReviewStatus || "pending_independent_review" }
    : {
        id: crypto.randomUUID(),
        predictionId,
        outcome,
        settlementSource,
        evidence,
        settlementReviewStatus: "pending_independent_review",
        recordedAt: new Date().toISOString()
      };

  // Atomically choose one immutable result identity and payload per prediction.
  // The claim contains the complete recovery payload, so a crash before the
  // canonical write can be repaired by any same-outcome retry.
  const claimId = createHash("sha256").update(predictionId, "utf8").digest("hex");
  const proposedClaim = {
    claimVersion: "win.result-submission-claim.v1",
    predictionId,
    result: proposedResult,
    claimedAt: new Date().toISOString()
  };
  const claimWrite = await putIfNew("library/result-submission-claims", claimId, proposedClaim);
  const claim = claimWrite.modified
    ? proposedClaim
    : await get<any>("library/result-submission-claims", claimId);
  if (!claim || claim.claimVersion !== "win.result-submission-claim.v1" ||
      claim.predictionId !== predictionId || !claim.result ||
      claim.result.predictionId !== predictionId || !claim.result.id) {
    return Response.json({ error: "Result submission claim is invalid; manual reconciliation is required" }, { status: 409 });
  }
  if (claim.result.outcome !== outcome) {
    return Response.json({
      error: "This prediction already has a different claimed outcome; an explicit correction workflow is required",
      existingOutcome: claim.result.outcome
    }, { status: 409 });
  }
  const result = claim.result;

  await put("results", result.id, result);
  await put("library/settled-results", result.id, result);
  const learning = await archivePredictionLearning(prediction, result);
  const completed = { ...result, ...learning };
  await put("results", result.id, completed);
  await put("library/settled-results", result.id, completed);
  return Response.json(completed, { status: existing || !claimWrite.modified ? 200 : 201 });
};

export const config = { path: "/api/results" };

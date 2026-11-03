import { requireAuth } from "../lib/auth.mts";
import { get, list, put } from "../lib/store.mts";

const SETTLED_OUTCOMES = new Set(["won", "lost", "void", "partial", "cancelled"]);
const text = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const array = (value: unknown, max = 100) =>
  Array.isArray(value) ? value.slice(0, max) : [];
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
    "A frozen WIN prediction has a recorded, evidence-linked settlement. The coupon outcome is an observed result; it does not by itself establish which selection, department or strategy caused the outcome.";
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
      status: "verified_prediction_outcome_unattributed",
      observedAt: result.recordedAt
    });
    await put("library/agent-profiles", agentId, {
      ...(await get<any>("library/agent-profiles", agentId) || {}),
      agentId,
      entityId: profileId,
      entityType: profile.entityType,
      name: profile.name,
      scope: profile.scope,
      lastSettlementLearningId: learningId,
      lastSettlementOutcome: result.outcome,
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

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Expected JSON" }, { status: 400 }); }

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
  if (!evidence.length) {
    return Response.json({ error: "At least one settlement evidence reference is required" }, { status: 400 });
  }

  const prediction = await get<any>("predictions", predictionId);
  if (!prediction) return Response.json({ error: "Prediction not found" }, { status: 404 });

  // Avoid duplicate settlement rows on client/network retries. A conflicting
  // outcome is rejected rather than silently overwriting an audited result.
  const existing = (await list<any>("results", 500)).find((item: any) => item.predictionId === predictionId);
  if (existing && existing.outcome !== outcome) {
    return Response.json({
      error: "This prediction already has a different recorded outcome; an explicit correction workflow is required",
      existingOutcome: existing.outcome
    }, { status: 409 });
  }

  const result = existing
    ? { ...existing, settlementSource: existing.settlementSource || settlementSource,
        evidence: existing.evidence || evidence }
    : {
        id: crypto.randomUUID(),
        predictionId,
        outcome,
        settlementSource,
        evidence,
        recordedAt: new Date().toISOString()
      };

  await put("results", result.id, result);
  await put("library/settled-results", result.id, result);
  const learning = await archivePredictionLearning(prediction, result);
  const completed = { ...result, ...learning };
  await put("results", result.id, completed);
  await put("library/settled-results", result.id, completed);
  return Response.json(completed, { status: existing ? 200 : 201 });
};

export const config = { path: "/api/results" };

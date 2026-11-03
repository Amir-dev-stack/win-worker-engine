import { requireAuth } from "../lib/auth.mts";
import {
  searchWinLibrary, saveCouponRecord, settleCouponRecord,
  saveEntityProfile, saveLearningNote
} from "../lib/library.mts";

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
function evidenceHasHttpsUrl(entry: any): boolean {
  return isHttpsUrl(typeof entry === "string" ? entry : entry?.url || entry?.reference || entry?.sourceUrl || entry?.evidenceUrl);
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const url = new URL(req.url);
    const result = await searchWinLibrary({
      category: url.searchParams.get("category") || "all",
      query: url.searchParams.get("q") || "",
      outcome: url.searchParams.get("outcome") || undefined,
      sport: url.searchParams.get("sport") || undefined,
      entityType: url.searchParams.get("entityType") || undefined,
      limit: Number(url.searchParams.get("limit") || 30)
    });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Expected JSON body" }, { status: 400 }); }

  try {
    switch (body?.action) {
      case "save_coupon":
        return Response.json(await saveCouponRecord(body), { status: 201 });
      case "settle_coupon":
        return Response.json(await settleCouponRecord(body));
      case "save_entity_profile":
        return Response.json(await saveEntityProfile(body), { status: 201 });
      case "save_learning_note":
        return Response.json(await saveLearningNote(body), { status: 201 });
      case "validate_lesson":
      case "submit_lesson_review": {
        if (typeof body.lessonId !== "string" || !body.lessonId.trim()) {
          return Response.json({ error: "lessonId is required" }, { status: 400 });
        }
        const { get, list, put } = await import("../lib/store.mts");
        const current = await get<any>("library/lessons", body.lessonId);
        if (!current) return Response.json({ error: "Lesson not found" }, { status: 404 });
        const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 30) : [];
        if (!evidence.some(evidenceHasHttpsUrl)) {
          return Response.json({
            error: "At least one HTTPS evidence URL is required to submit a lesson for independent review. A URL alone cannot validate a lesson."
          }, { status: 400 });
        }

        const priorCases = await list<any>("library/lesson-review-cases", 1000);
        const alreadyPending = priorCases.find((item: any) =>
          item.lessonId === body.lessonId && item.reviewStatus === "pending_independent_review"
        );
        if (alreadyPending) {
          return Response.json({
            accepted: true,
            validationStatus: "pending_independent_review",
            reviewCase: alreadyPending,
            message: "This lesson already has a pending independent review case."
          }, { status: 202 });
        }

        const submittedAt = new Date().toISOString();
        const reviewCaseId = "lesson-review-" + crypto.randomUUID();
        const reviewCase = {
          id: reviewCaseId,
          lessonId: body.lessonId,
          reviewStatus: "pending_independent_review",
          evidence,
          previousValidationStatus: current.validationStatus || "candidate",
          previousValidatedAt: current.validatedAt || null,
          submittedAt,
          submittedBy: "shared_owner_token",
          submitterIdentityVerified: false,
          independentReviewerRequired: true,
          outcomeApplied: false,
          guardrails: [
            "An HTTPS URL proves only that a link uses HTTPS; it does not prove source independence or claim accuracy.",
            "This API uses a shared owner token and cannot establish a distinct reviewer identity.",
            "The lesson remains outside the trusted learning pack until a separate authenticated reviewer approves it."
          ]
        };
        await put("library/lesson-review-cases", reviewCaseId, reviewCase);

        const updated = {
          ...current,
          validationStatus: "pending_independent_review",
          validationEvidence: evidence,
          validationReviewCaseId: reviewCaseId,
          validatedAt: null,
          validatedBy: null
        };
        await put("library/lessons", body.lessonId, updated);
        return Response.json({
          accepted: true,
          validationStatus: "pending_independent_review",
          reviewCase,
          lesson: updated,
          message: "Submitted for independent review; this has not validated the lesson."
        }, { status: 202 });
      }
      default:
        return Response.json({
          error: "Unknown action",
          allowedActions: ["save_coupon", "settle_coupon", "save_entity_profile", "save_learning_note", "submit_lesson_review", "validate_lesson"]
        }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
};

export const config = { path: "/api/library" };

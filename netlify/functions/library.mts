import { requireAuth } from "../lib/auth.mts";
import {
  searchWinLibrary, saveCouponRecord, settleCouponRecord,
  saveEntityProfile, saveLearningNote
} from "../lib/library.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";

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
  const parsedRequest = await readBoundedJsonObject(req, 128 * 1024);
  if (parsedRequest instanceof Response) return parsedRequest;
  const body = parsedRequest.body;

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
        const { get, getWithMetadata, putIfMatch, putIfNew } = await import("../lib/store.mts");
        const { lessonReviewSubmissionId } = await import("../lib/lesson-review-submission.mts");
        const currentSnapshot = await getWithMetadata<any>("library/lessons", body.lessonId);
        const current = currentSnapshot?.value || null;
        if (!current || !currentSnapshot?.etag) return Response.json({ error: "Lesson not found" }, { status: 404 });
        const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 30) : [];
        if (!evidence.some(evidenceHasHttpsUrl)) {
          return Response.json({
            error: "At least one HTTPS evidence URL is required to submit a lesson for independent review. A URL alone cannot validate a lesson."
          }, { status: 400 });
        }

        if (current.validationStatus === "pending_independent_review") {
          const pendingId = typeof current.validationReviewCaseId === "string" ? current.validationReviewCaseId : "";
          const pendingCase = pendingId ? await get<any>("library/lesson-review-cases", pendingId) : null;
          if (!pendingCase || pendingCase.lessonId !== body.lessonId || pendingCase.reviewStatus !== "pending_independent_review") {
            return Response.json({ error: "Lesson is marked pending but its review case cannot be verified; manual reconciliation is required." }, { status: 409 });
          }
          return Response.json({
            accepted: true,
            validationStatus: "pending_independent_review",
            reviewCase: pendingCase,
            message: "This lesson already has a pending independent review case."
          }, { status: 202 });
        }

        const reviewCaseId = lessonReviewSubmissionId({
          lessonId: body.lessonId,
          validationStatus: current.validationStatus || "candidate",
          validationReviewCaseId: current.validationReviewCaseId || "",
          updatedAt: current.updatedAt || "",
          validatedAt: current.validatedAt || ""
        });
        const submittedAt = new Date().toISOString();
        const reviewCase = {
          id: reviewCaseId,
          lessonId: body.lessonId,
          reviewStatus: "pending_independent_review",
          evidence,
          previousValidationStatus: current.validationStatus || "candidate",
          previousValidatedAt: current.validatedAt || null,
          submittedAt,
          submittedBy: "shared_owner_token",
          submitterCredentialId: "owner-internal-token",
          submitterIdentityVerified: false,
          independentReviewerRequired: true,
          outcomeApplied: false,
          guardrails: [
            "An HTTPS URL proves only that a link uses HTTPS; it does not prove source independence or claim accuracy.",
            "This API uses a shared owner token and cannot establish a distinct reviewer identity.",
            "The lesson remains outside the trusted learning pack until a separate authenticated reviewer approves it."
          ]
        };
        const claim = await putIfNew("library/lesson-review-cases", reviewCaseId, reviewCase);
        let acceptedCase = reviewCase;
        if (!claim.modified) {
          const existing = await get<any>("library/lesson-review-cases", reviewCaseId);
          if (!existing || existing.lessonId !== body.lessonId || existing.reviewStatus !== "pending_independent_review") {
            return Response.json({ error: "Lesson review submission identity is occupied by an incompatible record; manual reconciliation is required." }, { status: 409 });
          }
          acceptedCase = existing;
        }

        const updated = {
          ...current,
          submitterCredentialId: current.submitterCredentialId || "owner-internal-token",
          validationStatus: "pending_independent_review",
          validationEvidence: evidence,
          validationReviewCaseId: reviewCaseId,
          validatedAt: null,
          validatedBy: null
        };
        const lessonWrite = await putIfMatch("library/lessons", body.lessonId, updated, currentSnapshot.etag);
        let acceptedLesson = updated;
        if (!lessonWrite.modified) {
          const latest = await get<any>("library/lessons", body.lessonId);
          if (latest?.validationStatus !== "pending_independent_review" || latest?.validationReviewCaseId !== reviewCaseId) {
            return Response.json({ error: "Review case was claimed but the lesson changed concurrently; retry the same submission or reconcile the pending case." }, { status: 409 });
          }
          acceptedLesson = latest;
        }
        return Response.json({
          accepted: true,
          validationStatus: "pending_independent_review",
          reviewCase: acceptedCase,
          lesson: acceptedLesson,
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

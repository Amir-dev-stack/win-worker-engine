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
      case "validate_lesson": {
        if (typeof body.lessonId !== "string" || !body.lessonId.trim()) {
          return Response.json({ error: "lessonId is required" }, { status: 400 });
        }
        const { get, put } = await import("../lib/store.mts");
        const current = await get<any>("library/lessons", body.lessonId);
        if (!current) return Response.json({ error: "Lesson not found" }, { status: 404 });
        const evidence = Array.isArray(body.evidence) ? body.evidence.slice(0, 30) : [];
        if (!evidence.some(evidenceHasHttpsUrl)) return Response.json({ error: "At least one HTTPS evidence URL is required to validate a lesson" }, { status: 400 });
        const updated = {
          ...current, validationStatus: "validated",
          validationEvidence: evidence,
          validatedAt: new Date().toISOString(),
          validatedBy: "authorized_library_reviewer"
        };
        await put("library/lessons", body.lessonId, updated);
        return Response.json(updated);
      }
      default:
        return Response.json({
          error: "Unknown action",
          allowedActions: ["save_coupon", "settle_coupon", "save_entity_profile", "save_learning_note", "validate_lesson"]
        }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
};

export const config = { path: "/api/library" };

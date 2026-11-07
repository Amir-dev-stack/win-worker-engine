import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import {
  approveResearchAssignment, claimResearchAssignment, createResearchAssignment,
  getResearchAssignmentStatus, submitResearchAssignment, challengeResearchSubmission,
  reviewResearchSubmission
} from "../lib/win-research-assignment-manager.mts";

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (req.method === "GET") return Response.json(await getResearchAssignmentStatus(), { headers: { "cache-control": "no-store" } });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsed = await readBoundedJsonObject(req, 64 * 1024);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;
  const action = typeof body.action === "string" ? body.action : "";
  const actorId = typeof body.actorId === "string" ? body.actorId.trim().slice(0,120) : "";
  try {
    let result: unknown;
    switch (action) {
      case "create":
        result = await createResearchAssignment(body.assignment, actorId);
        break;
      case "approve":
        result = await approveResearchAssignment(String(body.assignmentId || ""), actorId);
        break;
      case "claim":
        result = await claimResearchAssignment(String(body.assignmentId || ""), actorId);
        break;
      case "submit":
        result = await submitResearchAssignment(String(body.assignmentId || ""), actorId, String(body.leaseId || ""), body.submission);
        break;
      case "challenge":
        result = await challengeResearchSubmission(String(body.assignmentId || ""), actorId, body.challenge);
        break;
      case "review":
        if (body.decision !== "accept" && body.decision !== "reject") return Response.json({ error: "decision must be accept or reject" }, { status: 400 });
        result = await reviewResearchSubmission(String(body.assignmentId || ""), actorId, body.decision, String(body.rationale || ""));
        break;
      default:
        return Response.json({ error: "Unknown research assignment action." }, { status: 400 });
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};
export const config = { path: "/api/research-assignments" };

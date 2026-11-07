import { timingSafeEqual } from "node:crypto";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import {
  claimResearchAssignment, getApprovedResearchAssignments, storeResearchArtifact,
  releaseResearchAssignment, submitResearchAssignment
} from "../lib/win-research-assignment-manager.mts";

function authorized(req: Request) {
  const expected = process.env.WIN_RESEARCH_RUNNER_TOKEN || "";
  const supplied = req.headers.get("authorization") || "";
  if (!expected || !supplied.startsWith("Bearer ")) return false;
  const actual = supplied.slice(7);
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function allowedAgent(agentId: string) {
  const allowlist = (process.env.WIN_RESEARCH_RUNNER_AGENT_IDS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  return allowlist.includes(agentId);
}

export default async (req: Request) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (process.env.WIN_RESEARCH_RUNNER_ENABLED !== "true") {
    return Response.json({ error: "Local research runner is disabled by the owner." }, { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsed = await readBoundedJsonObject(req, 320 * 1024);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;
  const action = typeof body.action === "string" ? body.action : "";
  const agentId = typeof body.agentId === "string" ? body.agentId.trim().slice(0, 120) : "";
  if (!allowedAgent(agentId)) return Response.json({ error: "Runner agent identity is not allowlisted." }, { status: 403 });

  try {
    if (action === "claim_next") {
      const queue = await getApprovedResearchAssignments(50);
      for (const assignment of queue) {
        try {
          const claimed = await claimResearchAssignment(assignment.id, agentId);
          return Response.json({ ok: true, assignment: claimed });
        } catch {
          // Another runner may have won the lease; continue to the next approved task.
        }
      }
      return Response.json({ ok: true, assignment: null });
    }
    if (action === "upload_artifact") {
      const result = await storeResearchArtifact(
        String(body.assignmentId || ""), agentId, String(body.leaseId || ""),
        body.artifact, String(body.sha256 || "")
      );
      return Response.json({ ok: true, artifact: result }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "submit") {
      const result = await submitResearchAssignment(
        String(body.assignmentId || ""), agentId, String(body.leaseId || ""), body.submission
      );
      return Response.json({ ok: true, result });
    }
    if (action === "release") {
      const result = await releaseResearchAssignment(
        String(body.assignmentId || ""), agentId, String(body.leaseId || ""),
        String(body.reason || "Local runner released the assignment.")
      );
      return Response.json({ ok: true, result });
    }
    return Response.json({ error: "Unknown local runner action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

export const config = { path: "/api/research-runner" };

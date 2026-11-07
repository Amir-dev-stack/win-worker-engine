import { requireAuth } from "../lib/auth.mts";
import { readBoundedJsonObject } from "../lib/bounded-json-request.mts";
import { executeOpenAIResearchAssignment } from "../lib/win-research-openai-executor.mts";

function allowedAgent(agentId: string) {
  return (process.env.WIN_RESEARCH_OPENAI_AGENT_IDS || "")
    .split(",").map(value => value.trim()).filter(Boolean).includes(agentId);
}

export default async (req: Request) => {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (process.env.WIN_RESEARCH_OPENAI_EXECUTOR_ENABLED !== "true") {
    return Response.json({ error: "OpenAI assignment executor is disabled by owner configuration." }, { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const parsed = await readBoundedJsonObject(req, 16 * 1024);
  if (parsed instanceof Response) return parsed;
  const assignmentId = typeof parsed.body.assignmentId === "string" ? parsed.body.assignmentId.trim() : "";
  const agentId = typeof parsed.body.agentId === "string" ? parsed.body.agentId.trim().slice(0, 120) : "";
  if (!assignmentId || !allowedAgent(agentId)) {
    return Response.json({ error: "A valid assignment ID and allowlisted agent ID are required." }, { status: 400 });
  }
  try {
    const result = await executeOpenAIResearchAssignment(assignmentId, agentId);
    return Response.json({ ok: result.status !== "failed", result },
      { status: result.status === "failed" ? 409 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
};

export const config = { path: "/api/research-openai-execute" };

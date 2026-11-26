import { promises as fs } from "node:fs";

const MARKER = /\bWIN_(?:NEXT|HANDOFF)_V1\b/;
const ASSIGNMENT = /\b(A\d{2})\b/i;

function safeText(value) { return typeof value === "string" ? value.slice(0, 4000) : ""; }

export function selectLatestAssignment(comments) {
  if (!Array.isArray(comments)) throw Error("INVALID_ISSUE_COMMENTS");
  const eligible = comments.filter(comment => comment && MARKER.test(comment.body || ""));
  const latest = eligible.at(-1);
  if (!latest) return { assignmentId: null, sourceCommentId: null, direction: null };
  return {
    assignmentId: latest.body.match(ASSIGNMENT)?.[1]?.toUpperCase() || null,
    sourceCommentId: Number.isSafeInteger(latest.id) ? latest.id : null,
    direction: safeText(latest.body)
  };
}

export function claimAssignment(state, assignmentId, ownerId, now = new Date().toISOString()) {
  if (!state || typeof state !== "object" || !Number.isSafeInteger(state.fence) || state.fence < 0) throw Error("INVALID_RUN_STATE");
  if (typeof assignmentId !== "string" || !/^A\d{2}$/u.test(assignmentId)) return { claimed: false, reason: "NO_BOUNDED_ASSIGNMENT" };
  if (state.active?.assignmentId === assignmentId && state.active.ownerId !== ownerId) return { claimed: false, reason: "OWNERSHIP_CONFLICT" };
  const next = { fence: state.fence + 1, active: { assignmentId, ownerId, claimedAt: now } };
  return { claimed: true, state: next };
}

export async function runAutonomousCycle({ repository, issueNumber = 20, token, statePath, outputPath, fetchImpl = globalThis.fetch } = {}) {
  if (typeof repository !== "string" || !/^[^/]+\/[^/]+$/u.test(repository)) throw Error("REPOSITORY_REQUIRED");
  if (typeof token !== "string" || token.length < 1) throw Error("GITHUB_TOKEN_REQUIRED");
  if (typeof fetchImpl !== "function") throw Error("FETCH_REQUIRED");
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" };
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${issueNumber}/comments?per_page=100`, { headers });
  if (!response?.ok) throw Error(`GITHUB_ISSUE_READ_FAILED_${response?.status || "UNKNOWN"}`);
  const comments = await response.json();
  const assignment = selectLatestAssignment(comments);
  let state = { fence: 0, active: null };
  try { state = JSON.parse(await fs.readFile(statePath, "utf8")); } catch (error) { if (error?.code !== "ENOENT") throw Error("INVALID_RUN_STATE"); }
  const claimed = claimAssignment(state, assignment.assignmentId, "github-actions", new Date().toISOString());
  const result = {
    schema: "WIN_AUTONOMOUS_CYCLE_V1", repository, issueNumber,
    assignment, claimed: claimed.claimed, claimReason: claimed.reason || null,
    dispatchStatus: "not_configured", executionEvidence: false,
    requiresOwnerIntervention: true,
    note: "GitHub Actions can retrieve and fence the assignment while the PC is off; no model executor is configured in this proof of concept."
  };
  if (claimed.claimed) {
    state = claimed.state;
    result.state = state;
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runAutonomousCycle({
    repository: process.env.GITHUB_REPOSITORY,
    issueNumber: Number(process.env.WIN_ISSUE_NUMBER || 20),
    token: process.env.GITHUB_TOKEN,
    statePath: process.env.WIN_STATE_PATH || "win-autonomous-state.json",
    outputPath: process.env.WIN_OUTPUT_PATH || "win-autonomous-result.json"
  });
  console.log(JSON.stringify({ assignment: result.assignment, claimed: result.claimed, dispatchStatus: result.dispatchStatus, executionEvidence: result.executionEvidence }));
}

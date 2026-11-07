import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("local research runner endpoint is separately token-authenticated and owner-gated", async () => {
  const route = await readFile(new URL("../netlify/functions/research-runner.mts", import.meta.url), "utf8");
  const manager = await readFile(new URL("../netlify/lib/win-research-assignment-manager.mts", import.meta.url), "utf8");
  const runner = await readFile(new URL("./win-local-agent-runner.mjs", import.meta.url), "utf8");
  assert.match(route, /WIN_RESEARCH_RUNNER_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /WIN_RESEARCH_RUNNER_ENABLED === "true"/);
  assert.match(route, /WIN_RESEARCH_RUNNER_AGENT_IDS/);
  assert.match(route, /action === "claim_next"/);
  assert.match(route, /action === "upload_artifact"/);
  assert.match(route, /storeResearchArtifact/);
  assert.match(route, /readBoundedJsonObject\(req, 320 \* 1024\)/);
  assert.match(route, /claimResearchAssignment/);
  assert.match(route, /submitResearchAssignment/);
  assert.match(route, /releaseResearchAssignment/);
  assert.match(manager, /getApprovedResearchAssignments/);
  assert.match(manager, /releaseResearchAssignment/);
  assert.match(manager, /createHash/);
  assert.match(manager, /256 \\* 1024/);
  assert.match(manager, /Artifact SHA-256 verification failed/);
  assert.match(runner, /redirect: "error"/);
  assert.match(runner, /WIN_OLLAMA_BASE_URL/);
  assert.match(runner, /api\("upload_artifact"/);
  assert.match(runner, /win-blob:\\/\\//);
  assert.doesNotMatch(runner, /location: "local-file:"/);
  assert.match(runner, /https:/);
  assert.match(runner, /No general web search or external tools/);
  assert.doesNotMatch(runner, /child_process|execSync|spawn\(/);
});

test("local runner only claims owner-approved tasks with explicit HTTPS source scope", async () => {
  const manager = await readFile(new URL("../netlify/lib/win-research-assignment-manager.mts", import.meta.url), "utf8");
  assert.match(manager, /item\.status === "approved"/);
  assert.match(manager, /new URL\(source\)\.protocol === "https:"/);
  assert.match(manager, /claimResearchAssignment\(assignment\.id, agentId\)/);
});

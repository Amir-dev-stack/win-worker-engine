import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("OpenAI research executor is owner-approved, budget-bounded and memory-aware", async () => {
  const executor = await readFile(new URL("../netlify/lib/win-research-openai-executor.mts", import.meta.url), "utf8");
  const ai = await readFile(new URL("../netlify/lib/ai.mts", import.meta.url), "utf8");
  const route = await readFile(new URL("../netlify/functions/research-openai-execute.mts", import.meta.url), "utf8");
  assert.match(executor, /claimResearchAssignment/);
  assert.match(executor, /buildResearchMemoryContext/);
  assert.match(executor, /runScheduledLearning\(brief, assignment\.budgetCeilingUsd\)/);
  assert.match(executor, /storeResearchArtifact\(assignment\.id, agentId, leaseId, artifact, sha256\)/);
  assert.match(executor, /submitResearchAssignment/);
  assert.doesNotMatch(executor, /put\("library\/research-artifacts"/);
  assert.match(executor, /releaseResearchAssignment/);
  assert.match(executor, /protocol === "https:"/);
  assert.match(executor, /trustedKnowledgePromotion/);
  assert.match(ai, /maxBudgetUsd\?: number/);
  assert.match(ai, /budget\.reservedUsd > Number\(maxBudgetUsd\)/);
  assert.match(ai, /releaseAIRequest\(requestBudgetId/);
  assert.match(route, /requireAuth\(req\)/);
  assert.match(route, /WIN_RESEARCH_OPENAI_EXECUTOR_ENABLED === "true"/);
  assert.match(route, /WIN_RESEARCH_OPENAI_AGENT_IDS/);
});

test("OpenAI assignment executor does not bypass the existing global spending gate", async () => {
  const ai = await readFile(new URL("../netlify/lib/ai.mts", import.meta.url), "utf8");
  assert.match(ai, /WIN_AI_BUDGET_APPROVED/);
  assert.match(ai, /reserveAIRequest/);
  assert.match(ai, /settleAIRequest/);
  assert.match(ai, /releaseAIRequest/);
});

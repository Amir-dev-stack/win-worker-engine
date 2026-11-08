import test from "node:test";
import assert from "node:assert/strict";
import { listSupportedLocalAgents, planLocalAgentDispatch } from "./win-local-agent-router.mjs";

function approvedAssignment() {
  return {
    id: "research-12345678", division: "R1", status: "approved",
    approvalRequired: true, approvedBy: "owner-1", ownerId: "owner-1",
    approvedAt: "2026-11-08T00:00:00Z",
    independentReviewerId: "reviewer-2",
    objective: "Summarize timestamped public football records",
    acceptanceCriteria: ["Cite source evidence"],
    sourceScope: ["https://example.org/football"],
    dataRestrictions: ["Public historical fixtures only"],
    expectedArtifacts: ["Structured read-only report"],
    budgetCeilingUsd: 0, dueAt: null,
  };
}
const permissions = Object.freeze({
  action: "read_only_analysis", tools: "deny_all", allowWrite: false,
});

test("all advertised local model roles are immutable, tool-disabled and zero-write", () => {
  const agents = listSupportedLocalAgents();
  assert.equal(agents.length, 3);
  for (const agent of agents) {
    assert.match(agent.model, /^ollama\//);
    assert.equal(agent.tools, "deny_all");
    assert.equal(agent.writes, false);
    assert.equal(Object.isFrozen(agent), true);
  }
});

test("creates a proposal rather than executing an approved research task", () => {
  const proposal = planLocalAgentDispatch(approvedAssignment(), permissions);
  assert.equal(proposal.accepted, true);
  assert.equal(proposal.dispatch, "proposal_only");
  assert.equal(proposal.model, "ollama/qwen3.5:4b");
  assert.equal(proposal.requiresIsolatedRuntime, true);
  assert.equal(proposal.budgetCeilingUsd, 0);
  assert.equal(proposal.requireRuntimeLeaseAndIdentityValidation, true);
  assert.equal(Object.isFrozen(proposal), true);
});

test("supports explicitly requested local coding review or summary roles", () => {
  const coder = planLocalAgentDispatch(approvedAssignment(), {
    ...permissions, role: "research_code_review",
  });
  assert.equal(coder.model, "ollama/qwen2.5-coder:7b");
  const summary = planLocalAgentDispatch(approvedAssignment(), {
    ...permissions, role: "research_summary",
  });
  assert.equal(summary.model, "ollama/llama3.2:3b");
});

test("rejects unapproved assignments and unsupported divisions", () => {
  const bad = approvedAssignment(); bad.status = "proposed";
  assert.equal(planLocalAgentDispatch(bad, permissions).accepted, false);
  const unknown = approvedAssignment(); unknown.division = "R9";
  assert.equal(planLocalAgentDispatch(unknown, permissions).accepted, false);
});

test("rejects cloud providers, unknown roles, unsafe permissions and extra options", () => {
  const requests = [
    { ...permissions, role: "openrouter/gpt" },
    { ...permissions, model: "openrouter/some-paid-model" },
    { ...permissions, allowWrite: true },
    { ...permissions, tools: "allow" },
    { ...permissions, action: "run_shell" },
    { ...permissions, network: true },
    null,
  ];
  for (const options of requests) {
    const result = planLocalAgentDispatch(approvedAssignment(), options);
    assert.equal(result.accepted, false);
    assert.equal(result.dispatch, "none");
  }
});

test("blocks paid task budgets and missing independent review", () => {
  const paid = approvedAssignment(); paid.budgetCeilingUsd = 1;
  assert.equal(planLocalAgentDispatch(paid, permissions).accepted, false);
  const sameReviewer = approvedAssignment(); sameReviewer.independentReviewerId = sameReviewer.ownerId;
  assert.equal(planLocalAgentDispatch(sameReviewer, permissions).accepted, false);
});

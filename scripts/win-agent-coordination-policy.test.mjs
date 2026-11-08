import test from "node:test";
import assert from "node:assert/strict";
import { planLocalResearchTask } from "./win-agent-coordination-policy.mjs";

function valid() {
  return {
    id: "research-12345678", division: "R1", status: "approved",
    approvalRequired: true, approvedBy: "owner-1", ownerId: "owner-1",
    approvedAt: "2026-11-08T00:00:00.000Z",
    independentReviewerId: "reviewer-2",
    objective: "Summarize non-sensitive historical football data quality",
    acceptanceCriteria: ["Cite evidence"], sourceScope: ["https://example.org/football"],
    dataRestrictions: ["Public data only"], expectedArtifacts: ["Review note"],
    budgetCeilingUsd: 0, dueAt: null,
  };
}
const requested = { action: "read_only_analysis", model: "ollama/qwen2.5-coder:7b",
  tools: "deny_all", allowWrite: false };

test("allows a bounded local read-only proposal without executing it", () => {
  const outcome = planLocalResearchTask(valid(), requested);
  assert.equal(outcome.eligible, true);
  assert.equal(outcome.execution, "proposal_only");
  assert.equal(outcome.needsRuntimeLeaseAndIdentityValidation, true);
  assert.equal(outcome.needsIndependentReviewBeforePromotion, true);
  assert.equal(Object.isFrozen(outcome), true);
});

test("fails closed when owner approval or independent review is absent", () => {
  for (const mutate of [
    a => { a.status = "proposed"; },
    a => { a.approvedAt = null; },
    a => { a.approvedBy = "someone-else"; },
    a => { a.independentReviewerId = a.ownerId; },
    a => { a.division = "R9"; },
  ]) {
    const a = valid(); mutate(a);
    assert.equal(planLocalResearchTask(a, requested).eligible, false);
  }
});

test("rejects any paid, cloud, editing, shell, or unrestricted request", () => {
  const examples = [
    { ...requested, model: "openrouter/openai/gpt-6" },
    { ...requested, model: "opencode/beam-free" },
    { ...requested, action: "code_edit" },
    { ...requested, tools: "allow" },
    { ...requested, allowWrite: true },
  ];
  for (const r of examples) {
    assert.equal(planLocalResearchTask(valid(), r).eligible, false);
  }
  const paid = valid(); paid.budgetCeilingUsd = 0.01;
  assert.equal(planLocalResearchTask(paid, requested).eligible, false);
});

test("rejects missing task bounds, sensitive requests, and expired tasks", () => {
  const incomplete = valid(); incomplete.sourceScope = [];
  assert.equal(planLocalResearchTask(incomplete, requested).eligible, false);
  const sensitive = valid(); sensitive.objective = "Export billing credentials";
  assert.equal(planLocalResearchTask(sensitive, requested).eligible, false);
  const expired = valid(); expired.dueAt = "2020-01-01T00:00:00Z";
  assert.equal(planLocalResearchTask(expired, requested).eligible, false);
  assert.equal(planLocalResearchTask(null, requested).eligible, false);
});

test("invalid requests fail closed without throwing", () => {
  assert.deepEqual(planLocalResearchTask(valid(), null), {
    eligible: false, reason: "invalid_request", execution: "none",
  });
  assert.equal(planLocalResearchTask(valid(), [] ).eligible, false);
  assert.equal(planLocalResearchTask(valid(), "read_only_analysis").eligible, false);
});

test("enforces the assignment manager array and string bounds", () => {
  const overlongObjective = valid(); overlongObjective.objective = "x".repeat(5001);
  assert.equal(planLocalResearchTask(overlongObjective, requested).eligible, false);
  const tooManySources = valid(); tooManySources.sourceScope = Array(21).fill("https://example.org");
  assert.equal(planLocalResearchTask(tooManySources, requested).eligible, false);
  const tooLongCriterion = valid(); tooLongCriterion.acceptanceCriteria = ["x".repeat(1001)];
  assert.equal(planLocalResearchTask(tooLongCriterion, requested).eligible, false);
  const badDueAt = valid(); badDueAt.dueAt = { toString: () => "2028-01-01" };
  assert.equal(planLocalResearchTask(badDueAt, requested).eligible, false);
});

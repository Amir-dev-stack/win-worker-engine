/**
 * WIN local multi-agent routing — planning only, no agent execution.
 *
 * Reuses the canonical R1-R8 research assignment approval model. The
 * dispatch/worker processes must independently enforce permissions, leases,
 * identity, file access, network policy and provider configuration.
 */
import { planLocalResearchTask } from "./win-agent-coordination-policy.mjs";

export const LOCAL_AGENT_ROLES = Object.freeze({
  research_extraction: Object.freeze({
    model: "ollama/qwen3.5:4b",
    purpose: "Bounded evidence extraction and summarization",
    tools: "deny_all",
    writes: false,
  }),
  research_code_review: Object.freeze({
    model: "ollama/qwen2.5-coder:7b",
    purpose: "Review code samples or offline test fixtures; no edits",
    tools: "deny_all",
    writes: false,
  }),
  research_summary: Object.freeze({
    model: "ollama/llama3.2:3b",
    purpose: "Summarize independently reviewed research artifacts",
    tools: "deny_all",
    writes: false,
  }),
});

const ROLE_BY_DIVISION = Object.freeze({
  R1: "research_extraction", R2: "research_extraction",
  R3: "research_extraction", R4: "research_extraction",
  R5: "research_extraction", R6: "research_extraction",
  R7: "research_extraction", R8: "research_extraction",
});
const allowedOptions = new Set(["role", "action", "tools", "allowWrite"]);

/**
 * Returns an immutable, non-executable dispatch proposal.
 * Never claims an assignment, fetches external content, calls Ollama,
 * executes OpenCode or writes to GitHub.
 */
export function planLocalAgentDispatch(assignment, options = {}) {
  const reject = reason => Object.freeze({
    accepted: false, reason, dispatch: "none",
  });
  if (!options || typeof options !== "object" || Array.isArray(options))
    return reject("invalid_dispatch_options");
  if (Object.keys(options).some(key => !allowedOptions.has(key)))
    return reject("unrecognized_dispatch_option");
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment))
    return reject("invalid_assignment");

  const selected = ROLE_BY_DIVISION[assignment.division];
  if (!selected) return reject("unknown_research_division");
  const role = options.role === undefined ? selected : options.role;
  if (typeof role !== "string" || !Object.hasOwn(LOCAL_AGENT_ROLES, role))
    return reject("unrecognized_agent_role");
  // Explicitly selected roles remain proposal-only: role assignment itself
  // never grants runtime execution rights or bypasses owner/reviewer checks.
  if (options.action !== "read_only_analysis" ||
      options.tools !== "deny_all" || options.allowWrite !== false)
    return reject("unsafe_execution_request");

  const agent = LOCAL_AGENT_ROLES[role];
  const decision = planLocalResearchTask(assignment, {
    action: "read_only_analysis",
    model: agent.model,
    tools: "deny_all",
    allowWrite: false,
  });
  if (!decision.eligible) return reject("policy_" + decision.reason);

  return Object.freeze({
    accepted: true,
    dispatch: "proposal_only",
    assignmentId: decision.assignmentId,
    division: decision.division,
    role,
    model: agent.model,
    provider: "ollama_local",
    tools: "deny_all",
    allowWrite: false,
    budgetCeilingUsd: 0,
    requireOwnerApproval: true,
    requireIndependentReviewer: true,
    requireRuntimeLeaseAndIdentityValidation: true,
    requiresIsolatedRuntime: true,
    taskTextNotExecuted: true,
  });
}

export function listSupportedLocalAgents() {
  return Object.entries(LOCAL_AGENT_ROLES).map(([role, config]) =>
    Object.freeze({ role, ...config }));
}

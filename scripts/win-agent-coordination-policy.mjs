/**
 * WIN agent coordination policy V1: pure planning only.
 *
 * No network calls, model calls, filesystem reads, assignment claims, or side effects.
 * Decisions are advisory; the runtime must independently authenticate identities,
 * validate approvals/leases and enforce OS/process permissions.
 */
const DIVISIONS = new Set(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]);
const LOCAL_MODELS = new Set([
  "ollama/qwen2.5-coder:7b",
  "ollama/qwen3.5:4b",
  "ollama/llama3.2:3b",
]);
const FORBIDDEN_SCOPES = /(?:payment|billing|credential|secret|production|deploy|betting|merge|push|live.trade|api.key)/i;
const ALLOWED_ACTION = "read_only_analysis";

export function planLocalResearchTask(assignment, requested = {}) {
  const reject = reason => Object.freeze({ eligible: false, reason, execution: "none" });
  if (!assignment || typeof assignment !== "object" || Array.isArray(assignment))
    return reject("invalid_assignment");
  if (!requested || typeof requested !== "object" || Array.isArray(requested))
    return reject("invalid_request");
  if (!DIVISIONS.has(assignment.division)) return reject("unknown_division");
  if (assignment.status !== "approved") return reject("not_approved");
  if (assignment.approvalRequired !== true ||
      typeof assignment.approvedBy !== "string" || !assignment.approvedBy.trim() ||
      typeof assignment.approvedAt !== "string" ||
      !Number.isFinite(Date.parse(assignment.approvedAt)) ||
      Date.parse(assignment.approvedAt) > Date.now())
    return reject("missing_or_invalid_approval");
  if (typeof assignment.ownerId !== "string" || !assignment.ownerId.trim() ||
      assignment.approvedBy !== assignment.ownerId)
    return reject("owner_approval_mismatch");
  if (assignment.createdAt !== undefined &&
      (typeof assignment.createdAt !== "string" ||
       !Number.isFinite(Date.parse(assignment.createdAt)) ||
       Date.parse(assignment.createdAt) > Date.parse(assignment.approvedAt)))
    return reject("invalid_creation_time");
  if (typeof assignment.independentReviewerId !== "string" ||
      !assignment.independentReviewerId.trim() ||
      assignment.independentReviewerId === assignment.ownerId)
    return reject("independent_review_required");
  if (typeof assignment.id !== "string" || !/^research-[a-zA-Z0-9-]{8,80}$/.test(assignment.id))
    return reject("invalid_assignment_id");
  if (typeof assignment.objective !== "string" || !assignment.objective.trim() ||
      assignment.objective.length > 5000)
    return reject("invalid_objective");
  const bounds = {
    acceptanceCriteria: [12, 1000], sourceScope: [20, 500],
    dataRestrictions: [20, 500], expectedArtifacts: [12, 500],
  };
  for (const [field, [maxCount, maxLength]] of Object.entries(bounds)) {
    if (!Array.isArray(assignment[field]) || !assignment[field].length ||
        assignment[field].length > maxCount ||
        assignment[field].some(x => typeof x !== "string" || !x.trim() || x.length > maxLength))
      return reject("invalid_" + field);
  }
  if (!Number.isFinite(assignment.budgetCeilingUsd) || assignment.budgetCeilingUsd !== 0)
    return reject("nonzero_task_budget");
  if (assignment.dueAt !== null && assignment.dueAt !== undefined && assignment.dueAt !== "") {
    if (typeof assignment.dueAt !== "string" ||
        !Number.isFinite(Date.parse(assignment.dueAt)) || Date.parse(assignment.dueAt) < Date.now())
      return reject("invalid_or_expired_due_date");
  }
  const scope = [assignment.objective, ...assignment.sourceScope,
    ...assignment.dataRestrictions, ...assignment.expectedArtifacts].join("\n");
  if (FORBIDDEN_SCOPES.test(scope)) return reject("sensitive_or_prohibited_scope");
  // Extra caller-provided options must not become implicit privileges later.
  const allowedRequestKeys = new Set(["action", "model", "tools", "allowWrite"]);
  if (Object.keys(requested).some(key => !allowedRequestKeys.has(key)))
    return reject("unknown_request_option");
  if (requested.action !== ALLOWED_ACTION) return reject("action_not_allowlisted");
  if (!LOCAL_MODELS.has(requested.model)) return reject("non_local_model");
  if (requested.tools !== "deny_all" || requested.allowWrite !== false)
    return reject("unsafe_permissions");

  return Object.freeze({
    eligible: true,
    execution: "proposal_only",
    assignmentId: assignment.id,
    division: assignment.division,
    action: ALLOWED_ACTION,
    model: requested.model,
    budgetCeilingUsd: 0,
    tools: "deny_all",
    allowWrite: false,
    needsRuntimeLeaseAndIdentityValidation: true,
    needsIndependentReviewBeforePromotion: true,
  });
}

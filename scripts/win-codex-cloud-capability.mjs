/**
 * Pure capability assessment and continuation policy for Codex Cloud.
 *
 * This module never runs the Codex CLI, launches a task, reads credentials,
 * polls a provider, or mutates a queue. Host observations are untrusted input;
 * the only dispatch result is a proposal for a separately verified launcher.
 */

const MIN_DISPATCH_BUDGET_MS = 5 * 60 * 1000;
const TASK_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/u;
const CAPABILITY_STATUSES = new Set([
  "LIVE_LAUNCH_READY",
  "SUPPORTED_INTERFACE_BLOCKED_ACCESS",
  "BLOCKED_PLATFORM"
]);

function fixed(status, reason, details = {}) {
  return Object.freeze({
    schema: "WIN_CODEX_CLOUD_CAPABILITY_V1",
    status,
    reason,
    launchOperations: 0,
    ...details
  });
}

function row(capability, status, evidenceClass, detail) {
  return Object.freeze({ capability, status, evidenceClass, detail });
}

function plain(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Classify credential-free observations collected by a trusted host.
 * Boolean flags are deliberately explicit: omitted evidence never becomes yes.
 */
export function assessCodexCloudCapability(observation) {
  if (!plain(observation) || !plain(observation.cli) ||
      !plain(observation.access) || !plain(observation.schedule)) {
    return fixed("BLOCKED_PLATFORM", "INVALID_CAPABILITY_OBSERVATION", { matrix: [] });
  }

  const { cli, access, schedule } = observation;
  const version = typeof cli.version === "string" && /^codex-cli [0-9A-Za-z.-]+$/u.test(cli.version)
    ? cli.version : "unverified";
  const cloudExec = cli.cloudExecAdvertised === true;
  const cloudStatus = cli.cloudStatusAdvertised === true;
  const authenticated = access.loginReported === true;
  const reachable = access.providerReachable === true;
  const listReadable = access.taskListReadable === true;
  const environment = access.environmentIdVerified === true;
  const quota = access.quotaVerifiedAvailable === true;
  const model = access.modelVerifiedAvailable === true;
  const timeBudget = access.timeBudgetVerified === true;
  const receiptContract = access.taskReceiptContractVerified === true;

  const matrix = Object.freeze([
    row("managed_schedule", schedule.hourlyChatgptAutomationVerified === true
      ? "AVAILABLE" : "UNVERIFIED", "REPORTED_PLATFORM_CONFIG",
      "Hourly ChatGPT automation is continuation scheduling, not a Codex Cloud task receipt."),
    row("codex_cli", version === "unverified" ? "UNVERIFIED" : "AVAILABLE",
      version === "unverified" ? "BLOCKED_EVIDENCE" : "LOCAL_OBSERVATION", version),
    row("codex_cloud_exec", cloudExec ? "SUPPORTED" : "UNAVAILABLE",
      cloudExec ? "LOCAL_HELP_OUTPUT" : "BLOCKED_EVIDENCE",
      "Experimental CLI submission command; support does not prove account access."),
    row("codex_cloud_status", cloudStatus ? "SUPPORTED" : "UNAVAILABLE",
      cloudStatus ? "LOCAL_HELP_OUTPUT" : "BLOCKED_EVIDENCE",
      "Task status command must be usable before lifecycle polling is enabled."),
    row("chatgpt_login", authenticated ? "REPORTED" : "UNVERIFIED",
      authenticated ? "LOCAL_LOGIN_STATUS" : "BLOCKED_AUTH",
      "Login status alone does not prove Codex Cloud environment entitlement."),
    row("provider_reachability", reachable ? "AVAILABLE" : "BLOCKED",
      reachable ? "LIVE_READ_ONLY" : "FAILED_READ_ONLY_PROBE",
      "Required provider endpoints must be reachable without weakening network controls."),
    row("task_listing", listReadable ? "AVAILABLE" : "BLOCKED",
      listReadable ? "LIVE_READ_ONLY" : "NO_TASK_LIST_RECEIPT",
      "A failed or unreadable list cannot supply environment or task provenance."),
    row("environment_id", environment ? "VERIFIED" : "UNVERIFIED",
      environment ? "LIVE_READ_ONLY" : "BLOCKED_EVIDENCE",
      "The target environment must be selected from authorized platform evidence."),
    row("quota", quota ? "VERIFIED_AVAILABLE" : "UNVERIFIED",
      quota ? "LIVE_READ_ONLY" : "BLOCKED_EVIDENCE",
      "Unknown quota never authorizes a launch or paid fallback."),
    row("model", model ? "VERIFIED_AVAILABLE" : "UNVERIFIED",
      model ? "LIVE_READ_ONLY" : "BLOCKED_EVIDENCE",
      "A model preference or CLI flag is not entitlement evidence."),
    row("time_budget", timeBudget ? "VERIFIED" : "UNVERIFIED",
      timeBudget ? "HOST_POLICY" : "BLOCKED_EVIDENCE",
      "A bounded session must have enough time to launch, poll and checkpoint."),
    row("task_receipt_contract", receiptContract ? "VERIFIED" : "UNVERIFIED",
      receiptContract ? "LIVE_READ_ONLY" : "BLOCKED_EVIDENCE",
      "Submission and status output must map to the B1 provenance contract without invention.")
  ]);

  if (!cloudExec || !cloudStatus) {
    return fixed("BLOCKED_PLATFORM", "SUPPORTED_LAUNCH_INTERFACE_NOT_FOUND", { matrix });
  }
  if (!(authenticated && reachable && listReadable && environment && quota && model && timeBudget && receiptContract)) {
    return fixed("SUPPORTED_INTERFACE_BLOCKED_ACCESS", "CLOUD_ACCESS_NOT_VERIFIED", { matrix });
  }
  return fixed("LIVE_LAUNCH_READY", "VERIFIED_INTERFACE_AND_ACCESS", { matrix });
}

function decision(action, reason, details = {}) {
  return Object.freeze({
    schema: "WIN_CODEX_CLOUD_CONTINUATION_V1",
    action,
    reason,
    dispatchOperations: 0,
    ...details
  });
}

/**
 * Decide whether a trusted supervisor may attempt exactly one next dispatch.
 * The function is side-effect free. `propose_one_dispatch` is not execution.
 */
export function decideCodexCloudContinuation(input) {
  if (!plain(input) || !plain(input.current) || !plain(input.next) ||
      !plain(input.lease) || !plain(input.controls) || !plain(input.dispatch) ||
      !CAPABILITY_STATUSES.has(input.capabilityStatus)) {
    return decision("hold", "INVALID_CONTINUATION_INPUT");
  }
  const { current, next, lease, controls, dispatch } = input;
  if (!TASK_KEY.test(current.taskId) || !TASK_KEY.test(next.taskId) ||
      !TASK_KEY.test(dispatch.idempotencyKey) || current.taskId === next.taskId) {
    return decision("hold", "INVALID_TASK_IDENTITY");
  }
  if (current.status === "platform_refused") {
    return decision("dead_letter", "PLATFORM_REFUSED");
  }
  if (current.status === "interrupted" || current.status === "unknown") {
    return decision("checkpoint_and_hold", "CURRENT_TASK_OUTCOME_UNCERTAIN");
  }
  if (current.status !== "completed") {
    return decision("hold", "CURRENT_TASK_NOT_COMPLETED");
  }
  if (next.status !== "queued") {
    return decision("hold", "NEXT_TASK_NOT_QUEUED");
  }
  if (lease.state === "crash_unknown") {
    return decision("reconcile_lease", "LEASE_OWNER_OUTCOME_UNKNOWN");
  }
  if (lease.state !== "free") {
    return decision("hold", "LEASE_NOT_FREE");
  }
  if (dispatch.alreadyDispatched === true || dispatch.activeIdempotencyKey === dispatch.idempotencyKey) {
    return decision("hold", "DUPLICATE_DISPATCH_BLOCKED");
  }
  if (input.capabilityStatus !== "LIVE_LAUNCH_READY") {
    return decision("hold", "CLOUD_ACCESS_NOT_VERIFIED");
  }
  if (controls.quota === "exhausted" || controls.quota === "unknown") {
    return decision("wait", "QUOTA_NOT_VERIFIED_AVAILABLE");
  }
  if (!Number.isSafeInteger(controls.timeBudgetMs) || controls.timeBudgetMs < MIN_DISPATCH_BUDGET_MS) {
    return decision("wait", "TIME_BUDGET_INSUFFICIENT");
  }
  if (controls.model !== "verified_available") {
    return decision("hold", "MODEL_NOT_VERIFIED_AVAILABLE");
  }
  if (controls.freeOnly !== true || controls.approved !== true) {
    return decision("hold", "POLICY_GATE");
  }
  return decision("propose_one_dispatch", "COMPLETION_CHECKPOINT_READY", {
    taskId: next.taskId,
    idempotencyKey: dispatch.idempotencyKey,
    maxDispatches: 1
  });
}


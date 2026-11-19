/**
 * WIN project draft GitHub CAS writer boundary (dependency injected).
 *
 * NOT a GitHub client, credential provider, scheduler, or deployment.
 * The caller MUST independently authenticate worker identity and scope and
 * ensure git.updateHeadIfEquals is a real atomic server-side CAS operation.
 * A read-head followed by unconditional update DOES NOT satisfy this contract.
 */
const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[0-9a-f]{40}$/;
const ACTOR = /^[A-Za-z0-9._:-]{1,120}$/;
const TASK = /^[A-Za-z0-9._-]{1,120}$/;
const BRANCH = /^win-draft\/[a-z0-9][a-z0-9._/-]{0,110}$/;
const RESERVED = /(^|\/)(?:\.{1,2}|main|master|production|release|secrets|credentials|\.github)(?:\/|$)/i;
const BANNED_SUFFIX = /\.(?:env|pem|p12|pfx|key)$/i;

function invalid() { throw Error("UNSAFE_DRAFT_WRITE_REQUEST"); }
function validBranch(branch) {
  return typeof branch === "string" && BRANCH.test(branch) &&
    !branch.includes("//") && !branch.endsWith("/") &&
    !branch.endsWith(".") && !branch.includes("..") && !RESERVED.test(branch);
}
function validPaths(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.length <= 25 &&
    new Set(paths).size === paths.length &&
    paths.every(path => typeof path === "string" && path.length <= 240 &&
      /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(path) &&
      !path.includes("//") && !path.includes("..") && !RESERVED.test(path) &&
      !path.toLowerCase().split("/").some(part => part.startsWith(".env")) &&
      !BANNED_SUFFIX.test(path));
}
function validRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request) ||
    request.repository !== REPOSITORY ||
    !validBranch(request.branch) ||
    !SHA.test(request.expectedHead) || !SHA.test(request.proposedCommit) ||
    request.expectedHead === request.proposedCommit ||
    !TASK.test(request.taskId) || !ACTOR.test(request.actorId) ||
    !Number.isSafeInteger(request.fence) || request.fence < 1 ||
    request.approved !== true || request.productionWriteAllowed !== false ||
    request.paidSpendAllowed !== false || request.draftOnly !== true ||
    !validPaths(request.paths)) invalid();
  return request;
}
function validLease(lease, request) {
  return lease && typeof lease === "object" && lease.task_id === request.taskId &&
    lease.owner_id === request.actorId &&
    Number.isSafeInteger(Number(lease.fence)) &&
    Number(lease.fence) === request.fence &&
    lease.status === "running" && lease.approved === true &&
    // A read-only review lease can NEVER authorize a GitHub mutation.
    lease.task_type === "draft_only_development" &&
    // Strict initial-source gate: checkpoint descendant support requires
    // separate trusted ancestry proof, not a caller-declared relationship.
    lease.source_commit_sha === request.expectedHead &&
    (typeof lease.expires_at === "string" || lease.expires_at instanceof Date) &&
    Date.parse(lease.expires_at) > Date.now();
}
// The proposed commit must be independently read back from trusted GitHub
// metadata, not described by a caller-supplied changed-paths assertion.
function validProposedCommit(commit, request) {
  if (!commit || typeof commit !== "object" || Array.isArray(commit) ||
      commit.sha !== request.proposedCommit ||
      !Array.isArray(commit.parents) || commit.parents.length !== 1 ||
      commit.parents[0] !== request.expectedHead ||
      !Array.isArray(commit.files) || !validPaths(commit.files) ||
      commit.files.length !== request.paths.length ||
      !request.paths.every(path => commit.files.includes(path)) ||
      commit.secretScanPassed !== true ||
      commit.sourceVerified !== true) return false;
  return true;
}
function hold(reason) {
  // Closed output; don't serialize provider tokens, source, or exceptions.
  return Object.freeze({status:"hold",reason,writeOperations:0});
}

/**
 * Safe result only when injected host implements *atomic* GitHub CAS and
 * authenticated DB lease inspection. A changed branch or uncertain outcome
 * stops, never performs a second write or retries automatically.
 *
 * git.updateHeadIfEquals must guarantee server-side atomic expected-head
 * matching. This module cannot verify the implementation is atomic.
 */
export async function guardedDraftUpdate(input, {leaseReader, git} = {}) {
  validRequest(input);
  // Capture a complete immutable value snapshot before the first async
  // boundary. Callers can mutate input while lease/GitHub checks are pending.
  const request = Object.freeze({
    repository: input.repository, branch: input.branch,
    expectedHead: input.expectedHead, proposedCommit: input.proposedCommit,
    taskId: input.taskId, actorId: input.actorId, fence: input.fence,
    approved: input.approved, productionWriteAllowed: input.productionWriteAllowed,
    paidSpendAllowed: input.paidSpendAllowed, draftOnly: input.draftOnly,
    paths: Object.freeze([...input.paths])
  });
  if (!leaseReader || typeof leaseReader.getCurrent !== "function" ||
      !git || typeof git.getHead !== "function" ||
      typeof git.inspectProposedCommit !== "function" ||
      typeof git.updateHeadIfEquals !== "function" ||
      git.atomicCompareAndSwapVerified !== true) return hold("TRUSTED_IO_NOT_CONFIGURED");
  let lease;
  try {
    lease = await leaseReader.getCurrent(request.taskId);
  } catch { return hold("LEASE_UNVERIFIED"); }
  if (!validLease(lease,request)) return hold("LEASE_NOT_CURRENT");
  let head;
  try {
    head = await git.getHead(REPOSITORY,request.branch);
  } catch { return hold("HEAD_UNVERIFIED"); }
  if (head !== request.expectedHead) return hold("BRANCH_HEAD_CHANGED");
  let commit;
  try {
    commit = await git.inspectProposedCommit(REPOSITORY,request.proposedCommit);
  } catch { return hold("PROPOSED_COMMIT_UNVERIFIED"); }
  if (!validProposedCommit(commit,request)) return hold("PROPOSED_COMMIT_UNVERIFIED");
  // Narrow the time-of-check window, without pretending this is sufficient
  // for atomicity across the two systems. The GitHub write must be atomic CAS.
  try {
    lease = await leaseReader.getCurrent(request.taskId);
  } catch { return hold("LEASE_UNVERIFIED"); }
  if (!validLease(lease,request)) return hold("LEASE_NOT_CURRENT");
  try {
    const result=await git.updateHeadIfEquals({
      repository:REPOSITORY,branch:request.branch,
      expectedHead:request.expectedHead,newHead:request.proposedCommit,
      taskId:request.taskId,actorId:request.actorId,fence:request.fence,
      paths:[...request.paths]
    });
    if (!result || result.updated !== true ||
        result.oldHead !== request.expectedHead ||
        result.newHead !== request.proposedCommit) {
      return hold("GITHUB_CAS_UNCERTAIN_OR_REJECTED");
    }
    return Object.freeze({
      status:"draft_written",repository:REPOSITORY,
      branch:request.branch,head:request.proposedCommit,
      taskId:request.taskId,fence:request.fence,
      writeOperations:1,requiresIndependentReview:true
    });
  } catch {
    // An exception may happen after a successful remote write. No retry.
    return hold("GITHUB_CAS_UNCERTAIN_OR_REJECTED");
  }
}

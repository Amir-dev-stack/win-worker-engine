import { createTrustedGitHubCommitInspector } from "./win-github-trusted-commit-inspector.mjs";

const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[a-f0-9]{40}$/;
const TASK = /^[A-Za-z0-9._-]{1,120}$/;
const ACTOR = /^[A-Za-z0-9._:-]{1,120}$/;

function hold(reason) {
  return Object.freeze({ status: "HOLD", reason, writeOperations: 0 });
}

function validRequest(input) {
  return input && typeof input === "object" && !Array.isArray(input) &&
    input.repository === REPOSITORY && SHA.test(input.proposedCommit) &&
    SHA.test(input.expectedHead) && input.proposedCommit !== input.expectedHead &&
    TASK.test(input.taskId) && ACTOR.test(input.actorId) &&
    Number.isSafeInteger(input.fence) && input.fence > 0 &&
    Array.isArray(input.paths) && input.paths.length > 0;
}

function snapshot(input) {
  if (!validRequest(input)) throw Error("UNSAFE_DRAFT_PREFLIGHT_REQUEST");
  return Object.freeze({
    repository: input.repository,
    proposedCommit: input.proposedCommit,
    expectedHead: input.expectedHead,
    taskId: input.taskId,
    actorId: input.actorId,
    fence: input.fence,
    paths: Object.freeze([...input.paths])
  });
}

function currentLease(lease, request, now) {
  return lease && typeof lease === "object" && !Array.isArray(lease) &&
    lease.task_id === request.taskId && lease.owner_id === request.actorId &&
    Number.isSafeInteger(Number(lease.fence)) && Number(lease.fence) === request.fence &&
    lease.status === "running" && lease.approved === true &&
    lease.task_type === "draft_only_development" &&
    lease.source_commit_sha === request.expectedHead &&
    lease.production_write_allowed === false && lease.paid_spend_allowed === false &&
    (typeof lease.expires_at === "string" || lease.expires_at instanceof Date) &&
    Date.parse(lease.expires_at) > now;
}

/**
 * Trusted, read-only preflight. It cannot update GitHub or the lease store.
 * The host constructs dependencies once; per-task requests cannot replace them.
 */
export function createTrustedDraftAuthorizationPreflight({
  token,
  scannerAppId,
  checkName,
  fetch = globalThis.fetch,
  leaseReader,
  now = () => Date.now()
} = {}) {
  if (!leaseReader || typeof leaseReader.getCurrent !== "function" ||
      typeof now !== "function") {
    throw Error("DRAFT_PREFLIGHT_NOT_CONFIGURED");
  }
  const inspector = createTrustedGitHubCommitInspector({
    token,
    scannerAppId,
    checkName,
    fetch
  });

  return Object.freeze({
    async inspect(input) {
      const request = snapshot(input);
      let lease;
      try {
        lease = await leaseReader.getCurrent(request.taskId);
      } catch {
        return hold("LEASE_UNVERIFIED");
      }
      if (!currentLease(lease, request, now())) return hold("LEASE_NOT_CURRENT");

      const inspection = await inspector.inspect({
        repository: request.repository,
        commitSha: request.proposedCommit,
        expectedParent: request.expectedHead,
        expectedPaths: request.paths
      });
      if (inspection.status !== "verified" ||
          inspection.commitSha !== request.proposedCommit ||
          inspection.parentSha !== request.expectedHead ||
          inspection.scanEvidence?.scannerAppId !== scannerAppId ||
          inspection.scanEvidence?.checkName !== checkName) {
        return hold("COMMIT_EVIDENCE_UNVERIFIED");
      }

      try {
        lease = await leaseReader.getCurrent(request.taskId);
      } catch {
        return hold("LEASE_UNVERIFIED");
      }
      if (!currentLease(lease, request, now())) return hold("LEASE_NOT_CURRENT");

      return Object.freeze({
        status: "READY_FOR_SEPARATE_ATOMIC_WRITER",
        repository: REPOSITORY,
        taskId: request.taskId,
        actorId: request.actorId,
        fence: request.fence,
        expectedHead: request.expectedHead,
        proposedCommit: request.proposedCommit,
        paths: Object.freeze([...request.paths]),
        scanEvidence: inspection.scanEvidence,
        writeOperations: 0,
        requiresSeparateAtomicWriter: true
      });
    }
  });
}

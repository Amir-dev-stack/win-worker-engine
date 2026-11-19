import { createTrustedGitHubCommitInspector } from "./win-github-trusted-commit-inspector.mjs";

const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[a-f0-9]{40}$/;

function result(status, reason, details = {}) {
  return Object.freeze({
    status,
    reason,
    repository: REPOSITORY,
    writeOperations: 0,
    ...details
  });
}

function blocked(reason, nextStep) {
  return result("BLOCKED_AUTH", reason, { nextStep });
}

function missingConfiguration(config) {
  if (typeof config?.token !== "string" || config.token.length === 0) {
    return blocked("CREDENTIAL_NOT_CONFIGURED",
      "Install an owner-approved read-only GitHub credential as WIN_GITHUB_READ_TOKEN in the trusted cloud host.");
  }
  if (!Number.isSafeInteger(config.scannerAppId) || config.scannerAppId < 1 ||
      typeof config.checkName !== "string" || config.checkName.length === 0) {
    return blocked("SCANNER_NOT_CONFIGURED",
      "Configure the independently reviewed scanner app ID and check name in the trusted cloud host.");
  }
  if (!SHA.test(config.commitSha) || !SHA.test(config.expectedParent) ||
      !Array.isArray(config.expectedPaths) || config.expectedPaths.length === 0) {
    return blocked("TARGET_NOT_CONFIGURED",
      "Configure the exact commit SHA, expected parent and reviewed changed-path list.");
  }
  return null;
}

function failureReason(statuses, inspection) {
  if ([401, 403].includes(statuses.commit) || [401, 403].includes(statuses.evidence)) {
    return "CREDENTIAL_REJECTED";
  }
  if (statuses.commit === 404 || statuses.evidence === 404) return "TARGET_OR_SCANNER_NOT_FOUND";
  if (inspection.reason === "SCAN_EVIDENCE_UNVERIFIED") return "SCANNER_EVIDENCE_UNVERIFIED";
  return "COMMIT_METADATA_UNVERIFIED";
}

/**
 * Trusted-host read-only smoke harness. Returned diagnostics never include
 * credentials, request headers, response bodies, file contents or paths.
 */
export function createGitHubReadOnlySmokeHarness(config = {}) {
  const unavailable = missingConfiguration(config);
  if (unavailable) return Object.freeze({ run: async () => unavailable });
  if (typeof config.fetch !== "function") {
    return Object.freeze({ run: async () => blocked("TRANSPORT_NOT_CONFIGURED",
      "Enable HTTPS fetch in the trusted cloud host without adding a writer credential.") });
  }

  const statuses = { commit: null, evidence: null };
  const observedFetch = async (url, options) => {
    const phase = url.includes("/check-runs?") ? "evidence" : "commit";
    const response = await config.fetch(url, options);
    statuses[phase] = response.status;
    return response;
  };
  const inspector = createTrustedGitHubCommitInspector({
    token: config.token,
    scannerAppId: config.scannerAppId,
    checkName: config.checkName,
    fetch: observedFetch
  });

  return Object.freeze({
    async run() {
      statuses.commit = null;
      statuses.evidence = null;
      const inspection = await inspector.inspect({
        repository: REPOSITORY,
        commitSha: config.commitSha,
        expectedParent: config.expectedParent,
        expectedPaths: config.expectedPaths
      });
      if (inspection.status !== "verified") {
        return blocked(failureReason(statuses, inspection),
          "Verify the read-only credential, exact target and independently reviewed scanner installation.");
      }
      const status = config.transport === "live" ? "LIVE_VERIFIED" : "MOCK_ONLY";
      return result(status, status === "LIVE_VERIFIED" ? "READ_ONLY_EVIDENCE_VERIFIED" : "SIMULATED_TRANSPORT", {
        commitSha: config.commitSha,
        changedPathCount: inspection.changedPaths.length,
        scannerAppId: inspection.scanEvidence.scannerAppId,
        checkName: inspection.scanEvidence.checkName,
        completedAt: inspection.scanEvidence.completedAt
      });
    }
  });
}

export function smokeConfigurationFromEnvironment(environment = {}) {
  let expectedPaths;
  try {
    expectedPaths = JSON.parse(environment.WIN_GITHUB_SMOKE_PATHS_JSON ?? "");
  } catch {
    expectedPaths = undefined;
  }
  return {
    token: environment.WIN_GITHUB_READ_TOKEN,
    scannerAppId: Number(environment.WIN_GITHUB_SCANNER_APP_ID),
    checkName: environment.WIN_GITHUB_SCANNER_CHECK_NAME,
    commitSha: environment.WIN_GITHUB_SMOKE_COMMIT_SHA,
    expectedParent: environment.WIN_GITHUB_SMOKE_PARENT_SHA,
    expectedPaths,
    transport: "live",
    fetch: globalThis.fetch
  };
}

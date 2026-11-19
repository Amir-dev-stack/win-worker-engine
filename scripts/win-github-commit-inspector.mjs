/**
 * Read-only verifier for a WIN draft commit before any GitHub CAS writer.
 *
 * This module never updates refs, creates branches, scans arbitrary content,
 * or retries an uncertain read. The injected readers must be independently
 * authenticated GitHub metadata and pinned scanner-evidence operations; their
 * outputs are treated as untrusted data and reduced to a closed safe summary.
 */
const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[0-9a-f]{40}$/;
const RESERVED = /(^|\/)(?:\.{1,2}|main|master|production|release|secrets|credentials|\.github)(?:\/|$)/i;
const BANNED_SUFFIX = /\.(?:env|pem|p12|pfx|key)$/i;

function hold(reason) {
  return Object.freeze({ status: "hold", reason, writeOperations: 0 });
}

function safePath(path) {
  return typeof path === "string" && path.length > 0 && path.length <= 240 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(path) &&
    !path.includes("//") && !path.includes("..") && !RESERVED.test(path) &&
    !path.toLowerCase().split("/").some(part => part.startsWith(".env")) &&
    !BANNED_SUFFIX.test(path);
}

function validInput(input) {
  return input && typeof input === "object" && !Array.isArray(input) &&
    input.repository === REPOSITORY && SHA.test(input.commitSha) &&
    SHA.test(input.expectedParent) &&
    (!input.expectedPaths || (Array.isArray(input.expectedPaths) && input.expectedPaths.length > 0 &&
      input.expectedPaths.length <= 25 && new Set(input.expectedPaths).size === input.expectedPaths.length &&
      input.expectedPaths.every(safePath)));
}

function validCommit(commit, input) {
  if (!commit || typeof commit !== "object" || Array.isArray(commit) ||
    commit.sha !== input.commitSha || !Array.isArray(commit.parents) ||
    commit.parents.length !== 1 || commit.parents[0] !== input.expectedParent ||
    !Array.isArray(commit.files) || commit.files.length === 0 || commit.files.length > 25 ||
    new Set(commit.files).size !== commit.files.length || !commit.files.every(safePath)) return false;
  if (input.expectedPaths && (commit.files.length !== input.expectedPaths.length ||
      !input.expectedPaths.every(path => commit.files.includes(path)))) return false;
  return true;
}

function validEvidence(evidence, input) {
  return evidence && typeof evidence === "object" && !Array.isArray(evidence) &&
    evidence.commitSha === input.commitSha && evidence.secretScanPassed === true &&
    Number.isSafeInteger(evidence.scannerAppId) && evidence.scannerAppId > 0 &&
    typeof evidence.checkName === "string" && evidence.checkName.length > 0 &&
    typeof evidence.completedAt === "string" && Number.isFinite(Date.parse(evidence.completedAt));
}

function snapshotInput(input) {
  return Object.freeze({
    repository: input.repository,
    commitSha: input.commitSha,
    expectedParent: input.expectedParent,
    expectedPaths: input.expectedPaths ? Object.freeze([...input.expectedPaths]) : undefined
  });
}

/**
 * Inspect one already-created draft commit using read-only metadata only.
 * No writer is accepted by this API, so a successful result cannot itself
 * mutate GitHub.
 */
export async function inspectDraftCommit(input, { commitReader, evidenceReader } = {}) {
  if (!validInput(input)) throw Error("UNSAFE_COMMIT_INSPECTION_REQUEST");
  const request = snapshotInput(input);
  if (!commitReader || typeof commitReader.readCommit !== "function") {
    return hold("COMMIT_READER_NOT_CONFIGURED");
  }
  if (!evidenceReader || typeof evidenceReader.readEvidence !== "function") {
    return hold("EVIDENCE_READER_NOT_CONFIGURED");
  }
  let commit;
  try {
    commit = await commitReader.readCommit(request.repository, request.commitSha);
  } catch {
    return hold("COMMIT_UNVERIFIED");
  }
  if (!validCommit(commit, request)) return hold("COMMIT_UNVERIFIED");
  let evidence;
  try {
    evidence = await evidenceReader.readEvidence(request.repository, request.commitSha);
  } catch {
    return hold("SCAN_EVIDENCE_UNVERIFIED");
  }
  if (!validEvidence(evidence, request)) return hold("SCAN_EVIDENCE_UNVERIFIED");
  return Object.freeze({
    status: "verified",
    repository: request.repository,
    commitSha: request.commitSha,
    parentSha: request.expectedParent,
    changedPaths: Object.freeze([...commit.files]),
    sourceVerified: true,
    secretScanPassed: true,
    scanEvidence: Object.freeze({
      scannerAppId: evidence.scannerAppId,
      checkName: evidence.checkName,
      completedAt: evidence.completedAt
    }),
    writeOperations: 0
  });
}


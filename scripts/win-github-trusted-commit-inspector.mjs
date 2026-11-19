import { inspectDraftCommit } from "./win-github-commit-inspector.mjs";
import { createGitHubCommitReader } from "./win-github-commit-reader.mjs";
import { createGitHubSecurityEvidenceReader } from "./win-github-security-evidence-reader.mjs";

/**
 * Trusted construction boundary for read-only commit inspection.
 *
 * The host supplies credential and scanner identity once during construction.
 * Per-task input can request only an exact commit inspection and cannot replace
 * either reader or change the pinned scanner identity.
 */
export function createTrustedGitHubCommitInspector({
  token,
  scannerAppId,
  checkName,
  fetch = globalThis.fetch
} = {}) {
  const commitReader = createGitHubCommitReader({ token, fetch });
  const evidenceReader = createGitHubSecurityEvidenceReader({
    token,
    scannerAppId,
    checkName,
    fetch
  });

  return Object.freeze({
    inspect(input) {
      return inspectDraftCommit(input, { commitReader, evidenceReader });
    }
  });
}

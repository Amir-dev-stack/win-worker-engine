import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DETECTORS = Object.freeze([
  ["openai_api_key", String.raw`sk-(proj-)?[A-Za-z0-9_-]{20,}`],
  ["github_token", String.raw`(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})`],
  ["aws_access_key_id", String.raw`(AKIA|ASIA)[A-Z0-9]{16}`],
  ["private_key", String.raw`-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----`],
  ["authorization_bearer", String.raw`[Aa]uthorization["' ]*[:=]["' ]*[Bb]earer [A-Za-z0-9._~+/-]{20,}`],
  ["credentialed_url", String.raw`[A-Za-z][A-Za-z0-9+.-]*://[^/@[:space:]]+:[^/@[:space:]]+@`]
]);

function git(repo, args) {
  const completed = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (completed.status !== 0) throw new Error("SECRET_AUDIT_GIT_FAILURE");
  return completed.stdout;
}

function lines(value) {
  return value.split(/\r?\n/u).filter(Boolean);
}

function parseHistoryFindings(output, credentialType) {
  const findings = [];
  let commit;
  for (const line of lines(output)) {
    if (line.startsWith("commit:")) {
      const candidate = line.slice(7);
      commit = /^[a-f0-9]{40}$/u.test(candidate) ? candidate : undefined;
      continue;
    }
    if (commit && !/[\r\n\0]/u.test(line)) {
      findings.push(Object.freeze({
        commit,
        path: line,
        credentialType,
        exposure: "accessible_git_history"
      }));
    }
  }
  return findings;
}

/**
 * Scan accessible Git object history without returning matched content.
 * `git grep -l` emits only commit/path provenance; matched values never enter
 * this process and no value-derived hashes are produced.
 */
export function auditAccessibleGitHistory(repo, runGit = git) {
  const commits = lines(runGit(repo, ["rev-list", "--all"]));
  const refs = lines(runGit(repo, ["for-each-ref", "--format=%(refname)"]));
  const findings = [];

  for (const [credentialType, expression] of DETECTORS) {
    if (commits.length === 0) continue;
    const output = runGit(repo, [
      "log", "--all", "--no-renames", "--format=commit:%H", "--name-only",
      "-E", `-G${expression}`, "--", "."
    ]);
    findings.push(...parseHistoryFindings(output, credentialType));
  }

  const grouped = new Map();
  for (const item of findings) {
    const key = `${item.path}\0${item.credentialType}`;
    const current = grouped.get(key);
    if (current) {
      current.occurrenceCount++;
      current.oldestAccessibleCommit = item.commit;
    } else {
      grouped.set(key, {
        newestAccessibleCommit: item.commit,
        oldestAccessibleCommit: item.commit,
        occurrenceCount: 1,
        path: item.path,
        credentialType: item.credentialType,
        exposure: item.exposure,
        classification: "review_required"
      });
    }
  }
  const unique = [...grouped.values()].map(Object.freeze).sort((left, right) =>
    left.path.localeCompare(right.path) || left.credentialType.localeCompare(right.credentialType));

  return Object.freeze({
    schema: "WIN_SECRET_PROVENANCE_AUDIT_V1",
    generatedAt: new Date().toISOString(),
    redaction: "matched values and value-derived hashes are never emitted",
    coverage: Object.freeze({
      accessibleCommitCount: commits.length,
      accessibleRefCount: refs.length,
      accessibleRefs: Object.freeze(refs),
      gitHistory: "scanned_all_locally_accessible_refs",
      trackedDocsAndWorkflows: "covered_by_git_history",
      trackedBuildBundles: "covered_by_git_history_when_committed",
      untrackedOrExternalBuildBundles: "unverified",
      githubIssuesAndPullRequestComments: "unverified_by_local_scan",
      githubActionsLogsAndArtifacts: "unverified_by_local_scan",
      deploymentBundlesAndProviderLogs: "unverified",
      externalMirrorsAndPastPublicExposure: "unverified",
      repositoryVisibility: "requires_independent_github_metadata_evidence",
      scannerApplicationIdentity: "unverified",
      scannerScopeAndAdequacy: "unverified"
    }),
    findings: Object.freeze(unique)
  });
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const report = auditAccessibleGitHistory(process.argv[2] ?? process.cwd());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// Read one exact successful scanner check from GitHub without accepting caller attestations.
const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[a-f0-9]{40}$/;
const CHECK_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,119}$/;

export function createGitHubSecurityEvidenceReader({
  token,
  scannerAppId,
  checkName,
  fetch: fetchEvidence = globalThis.fetch
} = {}) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_]+$/.test(token) ||
      !Number.isSafeInteger(scannerAppId) || scannerAppId < 1 ||
      typeof checkName !== "string" || !CHECK_NAME.test(checkName) ||
      typeof fetchEvidence !== "function") {
    throw Error("GITHUB_SECURITY_EVIDENCE_READER_NOT_CONFIGURED");
  }

  return Object.freeze({
    async readEvidence(repository, sha) {
      if (repository !== REPOSITORY || typeof sha !== "string" || !SHA.test(sha)) {
        throw Error("UNSAFE_GITHUB_SECURITY_EVIDENCE_READ");
      }

      try {
        const response = await fetchEvidence(
          `https://api.github.com/repos/${REPOSITORY}/commits/${sha}/check-runs?filter=latest&per_page=100`,
          {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28"
            }
          }
        );
        if (response.status !== 200 || response.headers.has("link")) throw Error();
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.check_runs)) throw Error();
        const matches = payload.check_runs.filter(check =>
          check?.name === checkName && check?.app?.id === scannerAppId);
        if (matches.length !== 1) throw Error();
        const check = matches[0];
        if (check.head_sha !== sha || check.status !== "completed" ||
            check.conclusion !== "success" || typeof check.started_at !== "string" ||
            typeof check.completed_at !== "string" ||
            !Number.isFinite(Date.parse(check.started_at)) ||
            !Number.isFinite(Date.parse(check.completed_at)) ||
            Date.parse(check.completed_at) < Date.parse(check.started_at)) throw Error();

        return Object.freeze({
          commitSha: sha,
          scannerAppId,
          checkName,
          completedAt: check.completed_at,
          secretScanPassed: true
        });
      } catch {
        throw Error("GITHUB_SECURITY_EVIDENCE_UNVERIFIED");
      }
    }
  });
}

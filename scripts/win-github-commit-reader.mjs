// Read GitHub metadata through the host's existing repository-scoped credential.
const REPOSITORY = "Amir-dev-stack/win-worker-engine";
const SHA = /^[a-f0-9]{40}$/;
const MAX_FILES = 25;

function isSha(value) {
  return typeof value === "string" && SHA.test(value);
}

export function createGitHubCommitReader({ token, fetch: fetchCommit = globalThis.fetch } = {}) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_]+$/.test(token) || typeof fetchCommit !== "function") {
    throw Error("GITHUB_COMMIT_READER_NOT_CONFIGURED");
  }

  return Object.freeze({
    async readCommit(repository, sha) {
      if (repository !== REPOSITORY || !isSha(sha)) {
        throw Error("UNSAFE_GITHUB_COMMIT_READ");
      }

      try {
        const url = `https://api.github.com/repos/${REPOSITORY}/commits/${sha}?per_page=${MAX_FILES + 1}`;
        const response = await fetchCommit(url, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28"
          }
        });

        if (response.status !== 200 || response.headers.has("link")) {
          throw Error();
        }

        const commit = await response.json();
        if (commit.sha !== sha || !Array.isArray(commit.parents) ||
            commit.parents.length !== 1 || !isSha(commit.parents[0]?.sha) ||
            !Array.isArray(commit.files) || commit.files.length === 0 ||
            commit.files.length > MAX_FILES) {
          throw Error();
        }

        // Renames and copies have a second path that the inspector's contract
        // cannot represent. Reject them even when the destination is allowed.
        const files = commit.files.map(file => {
          if (!["added", "modified", "removed"].includes(file?.status) ||
              file.previous_filename !== undefined ||
              typeof file.filename !== "string" || !file.filename) {
            throw Error();
          }
          return file.filename;
        });
        if (new Set(files).size !== files.length) throw Error();

        // GitHub metadata does not carry independent source approval or
        // secret-scan evidence. The draft inspector must still hold.
        return Object.freeze({
          sha,
          parents: Object.freeze([commit.parents[0].sha]),
          files: Object.freeze(files)
        });
      } catch {
        throw Error("GITHUB_COMMIT_METADATA_UNVERIFIED");
      }
    }
  });
}

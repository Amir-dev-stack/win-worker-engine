import assert from "node:assert/strict";
import test from "node:test";
import { inspectDraftCommit } from "./win-github-commit-inspector.mjs";
import { createGitHubCommitReader } from "./win-github-commit-reader.mjs";

const repository = "Amir-dev-stack/win-worker-engine";
const sha = "a".repeat(40);
const parent = "b".repeat(40);
const filename = "scripts/reader.mjs";
const token = "unit_test_token";
const payload = {
  sha,
  parents: [{ sha: parent }],
  files: [{ filename, status: "added" }],
  sourceVerified: true,
  secretScanPassed: true
};

test("reads exact commit metadata using one authenticated GET and discards claim fields", async () => {
  let calls = 0;
  const reader = createGitHubCommitReader({
    token,
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, `https://api.github.com/repos/${repository}/commits/${sha}?per_page=26`);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return Response.json(payload);
    }
  });
  assert.deepEqual(await reader.readCommit(repository, sha), {
    sha,
    parents: [parent],
    files: [filename]
  });
  assert.equal(calls, 1);
  assert.deepEqual(await inspectDraftCommit({
    repository,
    commitSha: sha,
    expectedParent: parent,
    expectedPaths: [filename]
  }, { commitReader: reader }), {
    status: "hold",
    reason: "EVIDENCE_READER_NOT_CONFIGURED",
    writeOperations: 0
  });
});

test("rejects invalid configuration and rejects invalid scope before making a request", async () => {
  assert.throws(() => createGitHubCommitReader(), /NOT_CONFIGURED/);
  const reader = createGitHubCommitReader({
    token,
    fetch: async () => assert.fail("unexpected request")
  });
  await assert.rejects(reader.readCommit("other/repo", sha), /UNSAFE_GITHUB_COMMIT_READ/);
  await assert.rejects(reader.readCommit(repository, "main"), /UNSAFE_GITHUB_COMMIT_READ/);
});

const invalidResponses = {
  unauthorized: () => new Response(null, { status: 401 }),
  paginated: () => Response.json(payload, { headers: { Link: '<https://example.com>; rel="next"' } }),
  "different SHA": () => Response.json({ ...payload, sha: parent }),
  "merge commit": () => Response.json({ ...payload, parents: [...payload.parents, { sha }] }),
  "duplicate paths": () => Response.json({ ...payload, files: [...payload.files, ...payload.files] }),
  "too many paths": () => Response.json({ ...payload, files: Array.from({ length: 26 }, (_, i) => ({
    filename: `scripts/${i}.mjs`,
    status: "added"
  })) }),
  rename: () => Response.json({ ...payload, files: [{
    filename,
    status: "renamed",
    previous_filename: "secrets/private.txt"
  }] }),
  "transport error": () => { throw Error(token); }
};

for (const [name, fetch] of Object.entries(invalidResponses)) {
  test(`fails closed on ${name}`, async () => {
    const reader = createGitHubCommitReader({ token, fetch });
    await assert.rejects(reader.readCommit(repository, sha), {
      message: "GITHUB_COMMIT_METADATA_UNVERIFIED"
    });
  });
}

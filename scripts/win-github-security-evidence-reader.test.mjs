import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubSecurityEvidenceReader } from "./win-github-security-evidence-reader.mjs";

const repository = "Amir-dev-stack/win-worker-engine";
const sha = "a".repeat(40);
const token = "unit_test_token";
const scannerAppId = 123;
const checkName = "WIN secret scan";
const validCheck = {
  name: checkName,
  app: { id: scannerAppId },
  head_sha: sha,
  status: "completed",
  conclusion: "success",
  started_at: "2026-11-19T08:59:00Z",
  completed_at: "2026-11-19T09:00:00Z"
};

test("returns closed evidence for one exact successful pinned scanner check", async () => {
  let calls = 0;
  const reader = createGitHubSecurityEvidenceReader({
    token, scannerAppId, checkName,
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return Response.json({ check_runs: [validCheck] });
    }
  });
  assert.deepEqual(await reader.readEvidence(repository, sha), {
    commitSha: sha,
    scannerAppId,
    checkName,
    completedAt: "2026-11-19T09:00:00Z",
    secretScanPassed: true
  });
  assert.equal(calls, 1);
});

test("rejects unsafe configuration and scope without a request", async () => {
  assert.throws(() => createGitHubSecurityEvidenceReader(), /NOT_CONFIGURED/);
  const reader = createGitHubSecurityEvidenceReader({
    token, scannerAppId, checkName,
    fetch: async () => assert.fail("unexpected request")
  });
  await assert.rejects(reader.readEvidence("other/repo", sha), /UNSAFE_GITHUB_SECURITY_EVIDENCE_READ/);
  await assert.rejects(reader.readEvidence(repository, "main"), /UNSAFE_GITHUB_SECURITY_EVIDENCE_READ/);
});

const failures = {
  unauthorized: () => new Response(null, { status: 401 }),
  paginated: () => Response.json({ check_runs: [validCheck] }, { headers: { Link: '<https://example.com>; rel="next"' } }),
  missing: () => Response.json({ check_runs: [] }),
  duplicate: () => Response.json({ check_runs: [validCheck, validCheck] }),
  "wrong app": () => Response.json({ check_runs: [{ ...validCheck, app: { id: 999 } }] }),
  "wrong commit": () => Response.json({ check_runs: [{ ...validCheck, head_sha: "b".repeat(40) }] }),
  pending: () => Response.json({ check_runs: [{ ...validCheck, status: "in_progress", conclusion: null }] }),
  failed: () => Response.json({ check_runs: [{ ...validCheck, conclusion: "failure" }] }),
  "invalid time": () => Response.json({ check_runs: [{ ...validCheck, completed_at: "invalid" }] }),
  "reversed time": () => Response.json({ check_runs: [{ ...validCheck, completed_at: "2026-11-19T08:58:00Z" }] }),
  "transport error": () => { throw Error(token); }
};

for (const [name, fetch] of Object.entries(failures)) {
  test(`fails closed on ${name}`, async () => {
    const reader = createGitHubSecurityEvidenceReader({ token, scannerAppId, checkName, fetch });
    await assert.rejects(reader.readEvidence(repository, sha), {
      message: "GITHUB_SECURITY_EVIDENCE_UNVERIFIED"
    });
  });
}

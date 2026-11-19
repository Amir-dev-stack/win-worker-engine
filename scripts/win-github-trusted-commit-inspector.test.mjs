import assert from "node:assert/strict";
import test from "node:test";
import { createTrustedGitHubCommitInspector } from "./win-github-trusted-commit-inspector.mjs";

const repository = "Amir-dev-stack/win-worker-engine";
const sha = "a".repeat(40);
const parent = "b".repeat(40);
const filename = "scripts/trusted-inspector.mjs";
const token = "unit_test_token";
const scannerAppId = 123;
const checkName = "WIN secret scan";
const request = {
  repository,
  commitSha: sha,
  expectedParent: parent,
  expectedPaths: [filename]
};

function commitResponse() {
  return Response.json({
    sha,
    parents: [{ sha: parent }],
    files: [{ filename, status: "added" }],
    sourceVerified: false,
    secretScanPassed: false
  });
}

function evidenceResponse(overrides = {}, init) {
  return Response.json({
    check_runs: [{
      name: checkName,
      app: { id: scannerAppId },
      head_sha: sha,
      status: "completed",
      conclusion: "success",
      started_at: "2026-11-19T09:00:00Z",
      completed_at: "2026-11-19T09:01:00Z",
      ...overrides
    }]
  }, init);
}

function factory(fetch) {
  return createTrustedGitHubCommitInspector({ token, scannerAppId, checkName, fetch });
}

test("constructs both readers once and exposes only exact read-only inspection", async () => {
  const urls = [];
  const inspector = factory(async url => {
    urls.push(url);
    return url.includes("/check-runs?") ? evidenceResponse() : commitResponse();
  });
  assert.deepEqual(Object.keys(inspector), ["inspect"]);
  assert.equal(Object.isFrozen(inspector), true);
  assert.deepEqual(await inspector.inspect(request), {
    status: "verified",
    repository,
    commitSha: sha,
    parentSha: parent,
    changedPaths: [filename],
    sourceVerified: true,
    secretScanPassed: true,
    scanEvidence: {
      scannerAppId,
      checkName,
      completedAt: "2026-11-19T09:01:00Z"
    },
    writeOperations: 0
  });
  assert.equal(urls.length, 2);
});

test("forged per-call evidence reader and scanner identity cannot bypass pinned construction", async () => {
  let evidenceReads = 0;
  const inspector = factory(async url => {
    if (!url.includes("/check-runs?")) return commitResponse();
    evidenceReads++;
    return new Response(null, { status: 401 });
  });
  const forged = {
    evidenceReader: { readEvidence: async () => ({
      commitSha: sha,
      scannerAppId: 999,
      checkName: "attacker scan",
      completedAt: "2026-11-19T09:01:00Z",
      secretScanPassed: true
    }) }
  };
  assert.deepEqual(await inspector.inspect({
    ...request,
    scannerAppId: 999,
    checkName: "attacker scan",
    secretScanPassed: true
  }, forged), {
    status: "hold",
    reason: "SCAN_EVIDENCE_UNVERIFIED",
    writeOperations: 0
  });
  assert.equal(evidenceReads, 1);
});

test("missing trusted construction configuration fails closed before any read", () => {
  assert.throws(() => createTrustedGitHubCommitInspector(), /NOT_CONFIGURED/);
  assert.throws(() => createTrustedGitHubCommitInspector({
    token,
    scannerAppId: 0,
    checkName,
    fetch: async () => assert.fail("unexpected request")
  }), /NOT_CONFIGURED/);
});

const evidenceFailures = {
  "wrong app": { app: { id: 999 } },
  "wrong check": { name: "Other scan" },
  "wrong commit": { head_sha: "c".repeat(40) },
  "malformed timestamp": { completed_at: "invalid" }
};

for (const [name, overrides] of Object.entries(evidenceFailures)) {
  test(`holds on ${name}`, async () => {
    const inspector = factory(async url =>
      url.includes("/check-runs?") ? evidenceResponse(overrides) : commitResponse());
    const result = await inspector.inspect(request);
    assert.deepEqual(result, {
      status: "hold",
      reason: "SCAN_EVIDENCE_UNVERIFIED",
      writeOperations: 0
    });
  });
}

test("holds on incomplete paginated evidence and never exposes a writer", async () => {
  const inspector = factory(async url => {
    if (!url.includes("/check-runs?")) return commitResponse();
    return evidenceResponse({}, { headers: { Link: '<https://example.com>; rel="next"' } });
  });
  assert.deepEqual(await inspector.inspect(request), {
    status: "hold",
    reason: "SCAN_EVIDENCE_UNVERIFIED",
    writeOperations: 0
  });
  assert.equal("write" in inspector, false);
});

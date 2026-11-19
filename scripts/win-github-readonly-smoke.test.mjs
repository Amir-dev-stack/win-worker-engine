import assert from "node:assert/strict";
import test from "node:test";
import {
  createGitHubReadOnlySmokeHarness,
  smokeConfigurationFromEnvironment
} from "./win-github-readonly-smoke.mjs";

const token = "private_unit_test_token";
const commitSha = "a".repeat(40);
const expectedParent = "b".repeat(40);
const expectedPaths = ["scripts/smoke.mjs"];
const scannerAppId = 123;
const checkName = "WIN secret scan";

function responseFor(url, options = {}) {
  if (url.includes("/check-runs?")) {
    return Response.json({ check_runs: options.checkRuns ?? [{
      name: checkName,
      app: { id: scannerAppId },
      head_sha: commitSha,
      status: "completed",
      conclusion: "success",
      started_at: "2026-11-19T09:00:00Z",
      completed_at: "2026-11-19T09:01:00Z"
    }] }, options.evidenceInit);
  }
  return Response.json({
    sha: commitSha,
    parents: [{ sha: expectedParent }],
    files: [{ filename: expectedPaths[0], status: "added" }],
    private_payload: token
  }, options.commitInit);
}

function harness(fetch, overrides = {}) {
  return createGitHubReadOnlySmokeHarness({
    token,
    scannerAppId,
    checkName,
    commitSha,
    expectedParent,
    expectedPaths,
    fetch,
    ...overrides
  });
}

test("mock transport verifies exact evidence without exposing private data", async () => {
  const output = await harness(async url => responseFor(url)).run();
  assert.equal(output.status, "MOCK_ONLY");
  assert.equal(output.reason, "SIMULATED_TRANSPORT");
  assert.equal(output.changedPathCount, 1);
  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes(expectedPaths[0]), false);
});

test("missing credential blocks without any request and gives a no-secret resolution", async () => {
  let calls = 0;
  const output = await harness(async () => { calls++; }, { token: undefined }).run();
  assert.equal(output.status, "BLOCKED_AUTH");
  assert.equal(output.reason, "CREDENTIAL_NOT_CONFIGURED");
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(output).includes(token), false);
});

for (const status of [401, 403]) {
  test(`${status} is a redacted credential rejection`, async () => {
    const output = await harness(async () => new Response(token, { status })).run();
    assert.equal(output.status, "BLOCKED_AUTH");
    assert.equal(output.reason, "CREDENTIAL_REJECTED");
    assert.equal(JSON.stringify(output).includes(token), false);
  });
}

test("404 reports missing target or scanner without response content", async () => {
  const output = await harness(async () => new Response(token, { status: 404 })).run();
  assert.equal(output.status, "BLOCKED_AUTH");
  assert.equal(output.reason, "TARGET_OR_SCANNER_NOT_FOUND");
  assert.equal(JSON.stringify(output).includes(token), false);
});

const scanFailures = {
  missing: [],
  duplicate: [
    { name: checkName, app: { id: scannerAppId }, head_sha: commitSha, status: "completed", conclusion: "success", started_at: "2026-11-19T09:00:00Z", completed_at: "2026-11-19T09:01:00Z" },
    { name: checkName, app: { id: scannerAppId }, head_sha: commitSha, status: "completed", conclusion: "success", started_at: "2026-11-19T09:00:00Z", completed_at: "2026-11-19T09:01:00Z" }
  ],
  "wrong SHA": [{ name: checkName, app: { id: scannerAppId }, head_sha: "c".repeat(40), status: "completed", conclusion: "success", started_at: "2026-11-19T09:00:00Z", completed_at: "2026-11-19T09:01:00Z" }],
  "wrong app": [{ name: checkName, app: { id: 999 }, head_sha: commitSha, status: "completed", conclusion: "success", started_at: "2026-11-19T09:00:00Z", completed_at: "2026-11-19T09:01:00Z" }],
  "wrong check": [{ name: "Other scan", app: { id: scannerAppId }, head_sha: commitSha, status: "completed", conclusion: "success", started_at: "2026-11-19T09:00:00Z", completed_at: "2026-11-19T09:01:00Z" }]
};

for (const [name, checkRuns] of Object.entries(scanFailures)) {
  test(`fails closed when scanner evidence is ${name}`, async () => {
    const output = await harness(async url => responseFor(url, { checkRuns })).run();
    assert.equal(output.status, "BLOCKED_AUTH");
    assert.equal(output.reason, "SCANNER_EVIDENCE_UNVERIFIED");
  });
}

test("incomplete scanner pagination fails closed", async () => {
  const output = await harness(async url => responseFor(url, {
    evidenceInit: url.includes("/check-runs?") ?
      { headers: { Link: '<https://example.com>; rel="next"' } } : undefined
  })).run();
  assert.equal(output.status, "BLOCKED_AUTH");
  assert.equal(output.reason, "SCANNER_EVIDENCE_UNVERIFIED");
});

test("environment parsing never falls back to a general GitHub token", () => {
  const config = smokeConfigurationFromEnvironment({
    GH_TOKEN: token,
    WIN_GITHUB_SMOKE_PATHS_JSON: "invalid"
  });
  assert.equal(config.token, undefined);
  assert.equal(config.expectedPaths, undefined);
  assert.equal(config.transport, "live");
});

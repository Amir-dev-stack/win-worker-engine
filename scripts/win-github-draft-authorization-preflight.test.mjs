import assert from "node:assert/strict";
import test from "node:test";
import { createTrustedDraftAuthorizationPreflight } from "./win-github-draft-authorization-preflight.mjs";

const repository = "Amir-dev-stack/win-worker-engine";
const expectedHead = "a".repeat(40);
const proposedCommit = "b".repeat(40);
const path = "scripts/proposal.mjs";
const scannerAppId = 123;
const checkName = "WIN secret scan";
const now = Date.parse("2026-11-19T10:00:00Z");

function request(overrides = {}) {
  return {
    repository,
    proposedCommit,
    expectedHead,
    taskId: "win-task-1",
    actorId: "codex-cloud-1",
    fence: 7,
    paths: [path],
    ...overrides
  };
}

function services(options = {}) {
  let leaseReads = 0, metadataReads = 0, evidenceReads = 0;
  const lease = {
    task_id: "win-task-1",
    owner_id: "codex-cloud-1",
    fence: "7",
    status: "running",
    approved: true,
    task_type: "draft_only_development",
    source_commit_sha: expectedHead,
    production_write_allowed: false,
    paid_spend_allowed: false,
    expires_at: "2026-11-19T11:00:00Z",
    ...options.lease
  };
  const leaseReader = { getCurrent: async () => {
    leaseReads++;
    if (options.leaseError) throw Error("private lease detail");
    return leaseReads > 1 && options.leaseOnRecheck ?
      { ...lease, ...options.leaseOnRecheck } : lease;
  } };
  const fetch = async url => {
    if (url.includes("/check-runs?")) {
      evidenceReads++;
      if (options.evidenceStatus) return new Response(null, { status: options.evidenceStatus });
      const check = {
        name: checkName,
        app: { id: scannerAppId },
        head_sha: proposedCommit,
        status: "completed",
        conclusion: "success",
        started_at: "2026-11-19T09:00:00Z",
        completed_at: "2026-11-19T09:01:00Z",
        ...options.check
      };
      return Response.json({ check_runs: [check] }, options.evidenceInit);
    }
    metadataReads++;
    return Response.json({
      sha: proposedCommit,
      parents: [{ sha: expectedHead }],
      files: [{ filename: path, status: "added" }],
      ...options.commit
    });
  };
  const preflight = createTrustedDraftAuthorizationPreflight({
    token: "unit_test_token",
    scannerAppId,
    checkName,
    fetch,
    leaseReader,
    now: () => now
  });
  return { preflight, counts: () => ({ leaseReads, metadataReads, evidenceReads }) };
}

test("returns ready only after two current lease reads and trusted exact evidence", async () => {
  const fixture = services();
  const result = await fixture.preflight.inspect(request());
  assert.equal(result.status, "READY_FOR_SEPARATE_ATOMIC_WRITER");
  assert.equal(result.writeOperations, 0);
  assert.equal(result.requiresSeparateAtomicWriter, true);
  assert.deepEqual(result.paths, [path]);
  assert.deepEqual(fixture.counts(), { leaseReads: 2, metadataReads: 1, evidenceReads: 1 });
  assert.equal("write" in fixture.preflight, false);
});

test("rejects forged per-task readers, scan booleans and scanner identity", async () => {
  const fixture = services({ evidenceStatus: 401 });
  const forged = {
    ...request(),
    scannerAppId: 999,
    checkName: "attacker scan",
    secretScanPassed: true,
    evidenceReader: { readEvidence: async () => ({ secretScanPassed: true }) },
    leaseReader: { getCurrent: async () => ({ approved: true }) }
  };
  const result = await fixture.preflight.inspect(forged);
  assert.deepEqual(result, {
    status: "HOLD",
    reason: "COMMIT_EVIDENCE_UNVERIFIED",
    writeOperations: 0
  });
  assert.deepEqual(fixture.counts(), { leaseReads: 1, metadataReads: 1, evidenceReads: 1 });
});

test("expired, revoked and unauthorized leases stop before GitHub reads", async () => {
  for (const lease of [
    { expires_at: "2026-11-19T09:59:59Z" },
    { approved: false },
    { task_type: "read_only_review" },
    { source_commit_sha: "c".repeat(40) },
    { production_write_allowed: true },
    { paid_spend_allowed: true },
    { owner_id: "other" },
    { fence: "8" }
  ]) {
    const fixture = services({ lease });
    const result = await fixture.preflight.inspect(request());
    assert.equal(result.reason, "LEASE_NOT_CURRENT", JSON.stringify(lease));
    assert.deepEqual(fixture.counts(), { leaseReads: 1, metadataReads: 0, evidenceReads: 0 });
  }
});

test("changed owner, fence, approval or source on recheck stops after evidence with zero writes", async () => {
  for (const leaseOnRecheck of [
    { owner_id: "other" },
    { fence: "8" },
    { approved: false },
    { source_commit_sha: "c".repeat(40) }
  ]) {
    const fixture = services({ leaseOnRecheck });
    const result = await fixture.preflight.inspect(request());
    assert.equal(result.reason, "LEASE_NOT_CURRENT", JSON.stringify(leaseOnRecheck));
    assert.deepEqual(fixture.counts(), { leaseReads: 2, metadataReads: 1, evidenceReads: 1 });
  }
});

test("mismatched lineage, paths or scanner evidence never becomes ready", async () => {
  for (const options of [
    { commit: { parents: [{ sha: "c".repeat(40) }] } },
    { commit: { files: [{ filename: "scripts/other.mjs", status: "added" }] } },
    { check: { app: { id: 999 } } },
    { check: { name: "Other scan" } },
    { check: { head_sha: "c".repeat(40) } },
    { check: { completed_at: "invalid" } },
    { evidenceInit: { headers: { Link: '<https://example.com>; rel="next"' } } }
  ]) {
    const fixture = services(options);
    const result = await fixture.preflight.inspect(request());
    assert.equal(result.reason, "COMMIT_EVIDENCE_UNVERIFIED", JSON.stringify(options));
    assert.equal(result.writeOperations, 0);
  }
});

test("missing trusted configuration and unsafe requests fail closed", async () => {
  assert.throws(() => createTrustedDraftAuthorizationPreflight(), /NOT_CONFIGURED/);
  const fixture = services();
  await assert.rejects(fixture.preflight.inspect(request({ expectedHead: "main" })),
    /UNSAFE_DRAFT_PREFLIGHT_REQUEST/);
  assert.deepEqual(fixture.counts(), { leaseReads: 0, metadataReads: 0, evidenceReads: 0 });
});

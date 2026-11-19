import test from "node:test";
import assert from "node:assert/strict";
import { inspectDraftCommit } from "./win-github-commit-inspector.mjs";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
function request(overrides = {}) {
  return {
    repository: "Amir-dev-stack/win-worker-engine",
    commitSha: B,
    expectedParent: A,
    expectedPaths: ["scripts/review-proposal.mjs"],
    ...overrides
  };
}
function reader(options = {}) {
  let reads = 0, evidenceReads = 0;
  return {
    counts: () => ({ reads, evidenceReads }),
    commitReader: { readCommit: async () => {
      reads++;
      if (options.error) throw Error("untrusted upstream detail");
      return options.commit ?? {
        sha: B, parents: [A], files: ["scripts/review-proposal.mjs"]
      };
    } },
    evidenceReader: { readEvidence: async () => {
      evidenceReads++;
      if (options.evidenceError) throw Error("untrusted evidence detail");
      return options.evidence ?? {
        commitSha: B, scannerAppId: 123, checkName: "WIN secret scan",
        completedAt: "2026-11-19T09:00:00Z", secretScanPassed: true
      };
    } }
  };
}

test("valid commit returns a closed read-only summary", async () => {
  const f = reader();
  const result = await inspectDraftCommit(request(), f);
  assert.deepEqual(result, {
    status: "verified", repository: "Amir-dev-stack/win-worker-engine",
    commitSha: B, parentSha: A, changedPaths: ["scripts/review-proposal.mjs"],
    sourceVerified: true, secretScanPassed: true,
    scanEvidence: { scannerAppId: 123, checkName: "WIN secret scan", completedAt: "2026-11-19T09:00:00Z" },
    writeOperations: 0
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.changedPaths), true);
  assert.deepEqual(f.counts(), { reads: 1, evidenceReads: 1 });
});

test("missing reader or read failure holds without any write capability", async () => {
  assert.deepEqual(await inspectDraftCommit(request()), { status: "hold", reason: "COMMIT_READER_NOT_CONFIGURED", writeOperations: 0 });
  const f = reader({ error: true });
  assert.deepEqual(await inspectDraftCommit(request(), f), { status: "hold", reason: "COMMIT_UNVERIFIED", writeOperations: 0 });
  assert.deepEqual(f.counts(), { reads: 1, evidenceReads: 0 });
  const withoutEvidence = reader();
  delete withoutEvidence.evidenceReader;
  assert.deepEqual(await inspectDraftCommit(request(), withoutEvidence), {
    status: "hold", reason: "EVIDENCE_READER_NOT_CONFIGURED", writeOperations: 0
  });
});

test("invalid request never reaches the reader", async () => {
  for (const change of [
    { repository: "other/repository" }, { commitSha: "latest" }, { expectedParent: "latest" },
    { expectedPaths: [".env"] }, { expectedPaths: ["scripts/a.mjs", "scripts/a.mjs"] }
  ]) {
    const f = reader();
    await assert.rejects(inspectDraftCommit(request(change), f), /UNSAFE_COMMIT_INSPECTION_REQUEST/);
    assert.deepEqual(f.counts(), { reads: 0, evidenceReads: 0 });
  }
});

test("ancestry and path mismatches fail closed before evidence lookup", async () => {
  for (const commit of [
    { sha: C, parents: [A], files: ["scripts/review-proposal.mjs"] },
    { sha: B, parents: [C], files: ["scripts/review-proposal.mjs"] },
    { sha: B, parents: [A, C], files: ["scripts/review-proposal.mjs"] },
    { sha: B, parents: [A], files: ["scripts/other.mjs"] },
    { sha: B, parents: [A], files: ["scripts/review-proposal.mjs", "scripts/extra.mjs"] }
  ]) {
    const f = reader({ commit });
    assert.deepEqual(await inspectDraftCommit(request(), f), { status: "hold", reason: "COMMIT_UNVERIFIED", writeOperations: 0 });
    assert.deepEqual(f.counts(), { reads: 1, evidenceReads: 0 });
  }
});

test("caller attestation claims cannot replace pinned scanner evidence", async () => {
  for (const evidence of [
    { commitSha: C, scannerAppId: 123, checkName: "WIN secret scan", completedAt: "2026-11-19T09:00:00Z", secretScanPassed: true },
    { commitSha: B, scannerAppId: 0, checkName: "WIN secret scan", completedAt: "2026-11-19T09:00:00Z", secretScanPassed: true },
    { commitSha: B, scannerAppId: 123, checkName: "", completedAt: "2026-11-19T09:00:00Z", secretScanPassed: true },
    { commitSha: B, scannerAppId: 123, checkName: "WIN secret scan", completedAt: "invalid", secretScanPassed: true },
    { commitSha: B, scannerAppId: 123, checkName: "WIN secret scan", completedAt: "2026-11-19T09:00:00Z", secretScanPassed: false }
  ]) {
    const f = reader({ evidence, commit: {
      sha: B, parents: [A], files: ["scripts/review-proposal.mjs"],
      sourceVerified: true, secretScanPassed: true
    } });
    assert.deepEqual(await inspectDraftCommit(request(), f), {
      status: "hold", reason: "SCAN_EVIDENCE_UNVERIFIED", writeOperations: 0
    });
    assert.deepEqual(f.counts(), { reads: 1, evidenceReads: 1 });
  }
});

test("input is snapshotted before asynchronous read and cannot redirect inspection", async () => {
  const original = request();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let inspected;
  const running = inspectDraftCommit(original, { commitReader: { readCommit: async (_repo, sha) => {
    inspected = sha;
    await gate;
    return { sha: B, parents: [A], files: ["scripts/review-proposal.mjs"] };
  } }, evidenceReader: reader().evidenceReader });
  original.commitSha = C;
  original.expectedParent = C;
  original.expectedPaths[0] = "secrets/password.txt";
  release();
  const result = await running;
  assert.equal(inspected, B);
  assert.equal(result.status, "verified");
  assert.equal(result.commitSha, B);
});


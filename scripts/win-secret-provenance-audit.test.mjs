import assert from "node:assert/strict";
import test from "node:test";
import { auditAccessibleGitHistory } from "./win-secret-provenance-audit.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
const secret = "sk-proj-private-fixture-never-emit-123456";

function fakeGit(_repo, args) {
  if (args[0] === "rev-list") return `${A}\n${B}\n`;
  if (args[0] === "for-each-ref") return "refs/heads/main\nrefs/remotes/origin/main\n";
  if (args[0] === "log") {
    assert.equal(args.includes(secret), false);
    const expression = args.find(value => value.startsWith("-G"));
    if (expression.includes("sk-")) return `commit:${A}\ndocs/example.md\n`;
    if (expression.includes("PRIVATE KEY")) return `commit:${B}\nfixtures/key.txt\n`;
    return "";
  }
  throw new Error("unexpected git operation");
}

test("returns sanitized provenance and explicit coverage gaps", () => {
  const report = auditAccessibleGitHistory("/safe/repo", fakeGit);
  assert.equal(report.schema, "WIN_SECRET_PROVENANCE_AUDIT_V1");
  assert.equal(report.coverage.accessibleCommitCount, 2);
  assert.equal(report.coverage.accessibleRefCount, 2);
  assert.equal(report.coverage.githubActionsLogsAndArtifacts, "unverified_by_local_scan");
  assert.deepEqual(report.findings, [
    { newestAccessibleCommit: A, oldestAccessibleCommit: A, occurrenceCount: 1, path: "docs/example.md", credentialType: "openai_api_key", exposure: "accessible_git_history", classification: "review_required" },
    { newestAccessibleCommit: B, oldestAccessibleCommit: B, occurrenceCount: 1, path: "fixtures/key.txt", credentialType: "private_key", exposure: "accessible_git_history", classification: "review_required" }
  ]);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("private-fixture"), false);
});

test("malformed history provenance is discarded without echoing it", () => {
  const report = auditAccessibleGitHistory("/safe/repo", (_repo, args) => {
    if (args[0] === "rev-list") return `${A}\n`;
    if (args[0] === "for-each-ref") return "refs/heads/main\n";
    if (args[0] === "log") return `commit:malformed\n${secret}\n`;
    return "";
  });
  assert.deepEqual(report.findings, []);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditWorkflow, auditPackageJson, runSecurityAudit
} from "./win-defensive-security-audit.mjs";

test("flags workflow write-all and third-party action version tag", () => {
  const report = auditWorkflow("build.yml", "permissions: write-all\njobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n");
  assert.deepEqual(report.map(x => x.id), ["workflow_write_all", "workflow_action_unpinned"]);
});

test("allows SHA-pinned actions and local relative actions", () => {
  const pinned = "a".repeat(40);
  assert.deepEqual(auditWorkflow("checks.yaml", 
    "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@" + pinned + "\n      - uses: ./path/action\n"), []);
});

test("flags PR-target workflows for manual review", () => {
  assert.equal(auditWorkflow("p.yml", "on:\n  pull_request_target:\n")[0].id, "workflow_pr_target");
});

test("reports unbounded dependency specs, not ordinary pinned versions", () => {
  const items = auditPackageJson(JSON.stringify({
    dependencies: { a: "latest", b: "1.2.3", c: "^2.0.0", d: "git+http://example.invalid" }
  }));
  assert.deepEqual(items.map(x => x.id), ["dependency_unbounded", "dependency_unbounded"]);
  assert.ok(!JSON.stringify(items).includes("example.invalid"));
});

test("malformed manifests are reported without echoing input", () => {
  assert.equal(auditPackageJson("{bad secret-value}")[0].id, "manifest_unreadable");
});

test("repository audit is read-only, bounded, and skips unlisted files", async () => {
  const root = await mkdtemp(join(tmpdir(), "win-defensive-audit-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"dependencies":{"x":"latest"}}');
    await writeFile(join(root, ".github", "workflows", "checks.yml"), "permissions: write-all\n");
    await writeFile(join(root, ".env"), "SECRET=must-not-appear");
    const report = await runSecurityAudit(root, ["checks.yml"]);
    assert.equal(report.status, "REVIEW_REQUIRED");
    assert.deepEqual(report.inspected, ["package.json", ".github/workflows/checks.yml".replaceAll("/", process.platform === "win32" ? "\\" : "/")]);
    assert.ok(!JSON.stringify(report).includes("must-not-appear"));
    assert.equal(report.noSideEffects, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing and invalid workflow input fails closed with incomplete report", async () => {
  const root = await mkdtemp(join(tmpdir(), "win-defensive-missing-"));
  try {
    const report = await runSecurityAudit(root, ["bad/../file.yml", "absent.yml"]);
    assert.equal(report.status, "INCOMPLETE");
    assert.equal(report.inspected.length, 0);
    assert.equal(report.unknown.length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditWorkflows, summarizeWorkflow } from "./win-actions-quota-audit.mjs";

test("identifies common overlap and conservative savings opportunities", () => {
  const yaml = ["name: test", "on:", "  push:", "    branches: [main]",
    "  pull_request:", "    branches: [main]", "jobs:", "  test:", "    runs-on: ubuntu-latest"].join("\n");
  const s = summarizeWorkflow("ci.yml", yaml);
  assert.equal(s.pushTriggerDetected, true);
  assert.equal(s.pullRequestTriggerDetected, true);
  assert.ok(s.recommendations.some(x => x.includes("overlap")));
  assert.ok(s.recommendations.some(x => x.includes("concurrency")));
});

test("does not flag overlap when only one event is configured", () => {
  const onlyPr = ["name: checks", "on:", "  pull_request:",
    "concurrency:", "  group: ci", "  cancel-in-progress: true", "jobs:", "  test:"].join("\n");
  const s = summarizeWorkflow("pr.yaml", onlyPr);
  assert.equal(s.pushTriggerDetected, false);
  assert.equal(s.pullRequestTriggerDetected, true);
  assert.equal(s.cancelInProgressTrue, true);
  assert.ok(!s.recommendations.some(x => x.includes("overlap")));
});

test("audits only local YAML files without printing source contents", async () => {
  const temp = await mkdtemp(join(tmpdir(), "win-actions-audit-test-"));
  try {
    await writeFile(join(temp, "a.yml"), "on: [push, pull_request]\nsecret: PRIVATE_TOKEN_SHOULD_NOT_APPEAR\n");
    await writeFile(join(temp, "skip.txt"), "secret: ignore");
    await mkdir(join(temp, "nested"));
    const result = await auditWorkflows(temp);
    assert.equal(result.found, true);
    assert.equal(result.inspected, 1);
    assert.equal(result.workflows[0].filename, "a.yml");
    assert.ok(!JSON.stringify(result).includes("PRIVATE_TOKEN_SHOULD_NOT_APPEAR"));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("handles missing workflow directories without mutating the checkout", async () => {
  const result = await auditWorkflows(join(tmpdir(), "win-audit-does-not-exist-20261108"));
  assert.equal(result.found, false);
  assert.deepEqual(result.workflows, []);
});

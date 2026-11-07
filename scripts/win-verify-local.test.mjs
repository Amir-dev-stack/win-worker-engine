import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const runner = new URL("./win-verify-local.mjs", import.meta.url);

function run(...args) {
  return spawnSync(process.execPath, [runner.pathname, ...args], {
    encoding: "utf8",
    timeout: 10000,
  });
}

test("local verification plan lists checks without executing npm", () => {
  const result = run("--plan");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Test suite and quality gates/);
  assert.match(result.stdout, /Production build checks/);
  assert.match(result.stdout, /Dashboard JavaScript syntax/);
  assert.match(result.stdout, /Plan complete\. No commands executed\./);
  assert.doesNotMatch(result.stdout, /PASSED:/);
});

test("optional bundling stays opt-in in plan mode", () => {
  const basic = run("--plan");
  const bundled = run("--plan", "--bundle");
  assert.equal(basic.status, 0);
  assert.equal(bundled.status, 0);
  assert.doesNotMatch(basic.stdout, /esbuild@0\.25\.0/);
  assert.match(bundled.stdout, /esbuild@0\.25\.0/);
});

test("unsupported options fail before running any checks", () => {
  const result = run("--unexpected-option");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
  assert.doesNotMatch(result.stdout, /PASSED:/);
});

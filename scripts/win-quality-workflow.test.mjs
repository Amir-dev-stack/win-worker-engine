import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("WIN quality workflow covers the draft roadmap base without secrets or deployment", async () => {
  const source = await readFile(new URL("../.github/workflows/win-quality.yml", import.meta.url), "utf8");
  assert.match(source, /pull_request:\s*\n\s*branches: \[main, master, docs\/win-staged-build-roadmap\]/);
  assert.match(source, /permissions:\s*\n\s*contents: read/);
  assert.match(source, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.doesNotMatch(source, /\bsecrets\./);
  assert.doesNotMatch(source, /\bdeploy\b/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("quality-gate reporting aggregates duplicate logical checks fail closed", async () => {
  const source = await readFile(new URL("./quality-gates.mjs", import.meta.url), "utf8");
  assert.match(source, /const checksByName = new Map\(\)/);
  assert.match(source, /existing\.ok = existing\.ok && check\.ok/);
  assert.match(source, /evaluations: checks\.length/);
  assert.match(source, /total: uniqueChecks\.length/);
  assert.match(source, /checks: uniqueChecks/);
});

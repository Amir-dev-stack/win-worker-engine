import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("AI budget and OAuth retain separate direct storage namespaces", async () => {
  const [budget, oauth] = await Promise.all([
    read("../netlify/lib/ai-budget.mts"),
    read("../netlify/lib/oauth-store.mts")
  ]);

  assert.match(budget, /getStore\(/);
  assert.match(budget, /win-engine/);
  assert.match(budget, /lock|ledger/i);
  assert.match(oauth, /getStore\(/);
  assert.match(oauth, /win-oauth/);
  assert.doesNotMatch(oauth, /MIRRORED_MEMORY_PREFIXES/);
  assert.doesNotMatch(oauth, /win-engine/);
});

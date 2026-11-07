import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("AI budget uses the configured shared store while OAuth retains its separate namespace", async () => {
  const [budget, sharedStore, oauth] = await Promise.all([
    read("../netlify/lib/ai-budget.mts"),
    read("../netlify/lib/store.mts"),
    read("../netlify/lib/oauth-store.mts")
  ]);

  assert.match(budget, /getStoreAdapter\(/);
  assert.match(budget, /lock|ledger/i);
  assert.match(sharedStore, /WIN_TRANSACTIONAL_STORE === "neon"/);
  assert.match(sharedStore, /getStore\(\{ name: "win-engine"/);
  assert.match(oauth, /getStore\(/);
  assert.match(oauth, /win-oauth/);
  assert.doesNotMatch(oauth, /MIRRORED_MEMORY_PREFIXES/);
  assert.doesNotMatch(oauth, /win-engine/);
});

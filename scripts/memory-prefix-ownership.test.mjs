import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

function extractPrefixes(source, declaration) {
  const escaped = declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(escaped + "\\s*=\\s*\\[([\\s\\S]*?)\\]"));
  assert.ok(match, "missing prefix declaration: " + declaration);
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
}

test("Blobs-to-Neon mirror, backup, backfill and restore prefix allowlists remain identical", async () => {
  const [store, backup, backfill, restore] = await Promise.all([
    read("../netlify/lib/store.mts"),
    read("../netlify/functions/neon-memory-backup.mts"),
    read("../netlify/functions/memory-backfill.mts"),
    read("../netlify/functions/memory-restore.mts")
  ]);

  const declarations = [
    extractPrefixes(store, "MIRRORED_MEMORY_PREFIXES"),
    extractPrefixes(backup, "PREFIXES"),
    extractPrefixes(backfill, "PREFIXES"),
    extractPrefixes(restore, "PREFIXES")
  ];

  assert.equal(declarations[0].length, 23, "the currently reviewed allowlist must remain exactly 23 prefixes");
  for (const list of declarations) {
    assert.equal(new Set(list).size, list.length, "allowlist contains duplicate prefixes");
    assert.ok(list.every(prefix => prefix.startsWith("library/") && prefix.endsWith("/")),
      "only explicit library collection prefixes may be mirrored or included in memory snapshots");
    assert.deepEqual(list, declarations[0],
      "storage, backup, backfill and restore allowlists must not drift independently");
  }

  for (const forbidden of [
    "library/model-lab/",
    "library/research-evidence/",
    "library/observed-markets/",
    "library/ai-budget/",
    "library/oauth/"
  ]) {
    assert.ok(!declarations[0].some(prefix => prefix.startsWith(forbidden)),
      "a non-approved collection was added to the structured-memory allowlist: " + forbidden);
  }
});

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
});

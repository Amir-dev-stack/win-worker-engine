import test from "node:test";
import assert from "node:assert/strict";

test("research assignment API is authenticated, bounded and does not execute agents", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../netlify/functions/research-assignments.mts", import.meta.url), "utf8");
  const manager = await readFile(new URL("../netlify/lib/win-research-assignment-manager.mts", import.meta.url), "utf8");
  assert.match(route, /requireAuth\(req\)/);
  assert.match(route, /readBoundedJsonObject\(req, 64 \* 1024\)/);
  for (const action of ["create","approve","claim","submit","challenge","review"]) assert.ok(route.includes('case "'+action+'"'));
  assert.match(manager, /budgetCeilingUsd: Math\.max/);
  assert.match(manager, /modelCallLimit: boundedInteger\(input\?\.modelCallLimit, 3, 12\)/);
  assert.match(manager, /toolCallLimit: boundedInteger\(input\?\.toolCallLimit, 4, 20\)/);
  assert.match(manager, /untrusted_pending_review/);
  assert.match(manager, /separate_owner_action_required/);
  assert.doesNotMatch(manager, /from ["']@openai\/agents["']/);
  assert.doesNotMatch(route, /fetch\(|https?:\/\//);
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createNeonStore } from "../netlify/lib/neon-store.mts";

const connectionString = process.env.WIN_NEON_TEST_DATABASE_URL;
if (!connectionString || process.env.WIN_NEON_TEST_CONFIRM !== "1") {
  throw new Error(
    "Refusing live Neon integration test. Set WIN_NEON_TEST_DATABASE_URL to the dedicated test-branch connection string and WIN_NEON_TEST_CONFIRM=1."
  );
}

const sql = neon(connectionString);
const store = createNeonStore(sql);
const prefix = "win-neon-integration-" + randomUUID();
const claimKey = "integration-claim/" + prefix;
const casKey = "integration-cas/" + prefix;
const plainKey = "integration-record/" + prefix;

try {
  const claims = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      store.setJSON(claimKey, { index }, { onlyIfNew: true })
    )
  );
  assert.equal(claims.filter(result => result.modified).length, 1,
    "exactly one concurrent create-only claim must win");

  const initial = await store.setJSON(casKey, { version: 0 });
  assert.equal(initial.modified, true);
  const current = await store.getWithMetadata(casKey);
  assert.ok(current?.etag, "the stored row must expose an ETag");

  const updates = await Promise.all([
    store.setJSON(casKey, { version: 1, contender: "a" }, { onlyIfMatch: current.etag }),
    store.setJSON(casKey, { version: 1, contender: "b" }, { onlyIfMatch: current.etag })
  ]);
  assert.equal(updates.filter(result => result.modified).length, 1,
    "exactly one concurrent ETag compare-and-swap must win");

  await store.setJSON(plainKey, { marker: prefix, verified: true });
  assert.deepEqual(await store.get(plainKey), { marker: prefix, verified: true });

  const metadata = await store.getWithMetadata(plainKey);
  assert.equal(metadata?.data?.marker, prefix);
  assert.ok(metadata?.etag);

  const listed = [];
  for await (const page of store.list({ prefix: "integration-record/" + prefix })) {
    listed.push(...page.blobs.map(blob => blob.key));
  }
  assert.deepEqual(listed, [plainKey]);

  if (process.env.WIN_NEON_TEST_BUDGET_CONFIRM !== "1") {
    throw new Error("Set WIN_NEON_TEST_BUDGET_CONFIRM=1 to run the isolated AI-budget controller test.");
  }

  process.env.WIN_TRANSACTIONAL_STORE = "neon";
  process.env.WIN_NEON_DATABASE_URL = connectionString;
  const budget = await import("../netlify/lib/ai-budget.mts");
  const { getStoreAdapter } = await import("../netlify/lib/store.mts");
  const budgetStore = await getStoreAdapter();
  const month = new Date().toISOString().slice(0, 7);
  const ledgerKey = "ai-budget/months/" + month;
  const lockKey = "ai-budget/controller-lock";
  const settingsKey = "ai-budget/settings";

  for (const key of [ledgerKey, lockKey, settingsKey]) {
    if (await budgetStore.get(key, { type: "json" })) {
      throw new Error("Refusing AI-budget integration test because a reserved test key already exists: " + key);
    }
  }

  try {
    const budgetReservations = await Promise.all([
      budget.reserveAIRequest({
        id: prefix + "-budget-a", model: "gpt-6-luna", phase: "integration",
        inputChars: 50, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
      }),
      budget.reserveAIRequest({
        id: prefix + "-budget-b", model: "gpt-6-luna", phase: "integration",
        inputChars: 50, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
      })
    ]);
    assert.equal(budgetReservations.filter(item => item.allowed).length, 2,
      "two small concurrent budget reservations should serialize and both be admitted");

    const statusWithReservations = await budget.getAIbudgetStatus();
    assert.ok(statusWithReservations.reservedUsd > 0,
      "the shared Neon ledger must reflect active reservations");

    await Promise.all([
      budget.settleAIRequest(prefix + "-budget-a", null, 0, true),
      budget.settleAIRequest(prefix + "-budget-b", null, 0, true)
    ]);
    const settledStatus = await budget.getAIbudgetStatus();
    assert.equal(settledStatus.reservedUsd, 0,
      "uncertain outcomes must conservatively settle rather than lose reservations");
    assert.ok(settledStatus.spentUsd > 0,
      "conservative settlement must be persisted in the Neon ledger");

    const overLimit = await budget.reserveAIRequest({
      id: prefix + "-budget-over-limit", model: "gpt-6.1-sol", phase: "integration",
      inputChars: 0, maxOutputTokens: 300000, maxToolCalls: 0, maxInputChars: 1000
    });
    assert.equal(overLimit.allowed, false,
      "an estimate above the $2.95 operating stop must be denied before provider invocation");
    const lockedStatus = await budget.getAIbudgetStatus();
    assert.equal(lockedStatus.spendingLocked, true,
      "the operating stop must persist the owner lock in Neon");
  } finally {
    await Promise.allSettled([
      budgetStore.delete(ledgerKey),
      budgetStore.delete(lockKey),
      budgetStore.delete(settingsKey)
    ]);
  }

  console.log("WIN_NEON_INTEGRATION_OK: store concurrency, CAS, reads, pagination and OpenAI budget reservation/settlement/owner-lock behavior verified.");
} finally {
  await Promise.allSettled([
    store.delete(claimKey),
    store.delete(casKey),
    store.delete(plainKey)
  ]);
}

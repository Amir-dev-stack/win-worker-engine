import test from "node:test";
import assert from "node:assert/strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStore() {
  const records = new Map();
  let revision = 0;
  return {
    async get(key) {
      const item = records.get(key);
      return item ? clone(item.value) : null;
    },
    async getWithMetadata(key) {
      const item = records.get(key);
      return item ? { data: clone(item.value), etag: item.etag } : null;
    },
    async setJSON(key, value, options = {}) {
      const existing = records.get(key);
      if (options.onlyIfNew && existing) return { modified: false, etag: existing.etag };
      if (options.onlyIfMatch && (!existing || existing.etag !== options.onlyIfMatch)) {
        return { modified: false, etag: existing?.etag ?? null };
      }
      const etag = "isolated-ai-budget-etag-" + (++revision);
      records.set(key, { value: clone(value), etag });
      return { modified: true, etag };
    },
    async delete(key) { records.delete(key); }
  };
}

test("AI budget controller enforces isolated reservations, settlement and owner lock", async () => {
  const previousFlag = process.env.WIN_AI_BUDGET_TEST_MODE;
  process.env.WIN_AI_BUDGET_TEST_MODE = "1";

  try {
    const budget = await import("../netlify/lib/ai-budget.mts");
    budget.installIsolatedAIBudgetTestStore(createMemoryStore());

    const unknown = await budget.reserveAIRequest({
      id: "unknown-model", model: "unpriced-model", phase: "test",
      inputChars: 10, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 100
    });
    assert.equal(unknown.allowed, false, "unknown model pricing must fail closed");

    const invalid = await budget.reserveAIRequest({
      id: "negative-limits", model: "gpt-6-luna", phase: "test",
      inputChars: 10, maxOutputTokens: -1, maxToolCalls: 0, maxInputChars: 100
    });
    assert.equal(invalid.allowed, false, "negative token limits must fail closed");

    const oversized = await budget.reserveAIRequest({
      id: "oversized", model: "gpt-6-luna", phase: "test",
      inputChars: 101, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 100
    });
    assert.equal(oversized.allowed, false, "oversized input must be blocked");

    const [first, second] = await Promise.all([
      budget.reserveAIRequest({
        id: "concurrent-a", model: "gpt-6-luna", phase: "test",
        inputChars: 100, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
      }),
      budget.reserveAIRequest({
        id: "concurrent-b", model: "gpt-6-luna", phase: "test",
        inputChars: 100, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
      })
    ]);
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    const bothReserved = await budget.getAIbudgetStatus();
    assert.ok(bothReserved.reservedUsd > 0, "both concurrent reservations must be represented in the ledger");

    const duplicate = await budget.reserveAIRequest({
      id: "concurrent-a", model: "gpt-6-luna", phase: "test",
      inputChars: 100, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
    });
    assert.equal(duplicate.allowed, false, "a duplicate reservation ID must not overwrite an existing reservation");
    const afterDuplicate = await budget.getAIbudgetStatus();
    assert.equal(afterDuplicate.reservedUsd, bothReserved.reservedUsd,
      "duplicate reservation attempts must not reduce or replace reserved exposure");

    const settled = await budget.settleAIRequest("concurrent-a", {
      input_tokens: 1000, output_tokens: 500
    }, 0, false);
    assert.equal(settled.source, "usage");
    assert.ok(settled.chargedUsd > 0);

    const uncertain = await budget.settleAIRequest("concurrent-b", null, 0, true);
    assert.equal(uncertain.source, "reserved_estimate",
      "uncertain provider outcomes must conservatively settle the reservation rather than release it");
    assert.ok(uncertain.chargedUsd > 0);

    const settledStatus = await budget.getAIbudgetStatus();
    assert.equal(settledStatus.reservedUsd, 0);
    assert.ok(settledStatus.spentUsd > 0);

    const negativeUsageReservation = await budget.reserveAIRequest({
      id: "negative-usage", model: "gpt-6-luna", phase: "test",
      inputChars: 50, maxOutputTokens: 100, maxToolCalls: 0, maxInputChars: 1000
    });
    assert.equal(negativeUsageReservation.allowed, true);
    const negativeUsageSettlement = await budget.settleAIRequest("negative-usage", {
      input_tokens: -100, output_tokens: 0
    }, 0, false);
    assert.equal(negativeUsageSettlement.source, "reserved_estimate",
      "invalid negative usage must fall back to the conservative reservation estimate");

    const limitTrigger = await budget.reserveAIRequest({
      id: "trip-operating-stop", model: "gpt-6.1-sol", phase: "test",
      inputChars: 0, maxOutputTokens: 2_000_000, maxToolCalls: 0, maxInputChars: 1000
    });
    assert.equal(limitTrigger.allowed, false, "a request projected beyond the operating stop must be blocked");
    const lockedStatus = await budget.getAIbudgetStatus();
    assert.equal(lockedStatus.spendingLocked, true, "crossing the operating stop must persist the spending lock");

    const whileLocked = await budget.reserveAIRequest({
      id: "blocked-while-locked", model: "gpt-6-luna", phase: "test",
      inputChars: 10, maxOutputTokens: 10, maxToolCalls: 0, maxInputChars: 100
    });
    assert.equal(whileLocked.allowed, false, "locked spending must block subsequent requests");

    await assert.rejects(
      () => budget.ownerApproveBudgetUnlock("incorrect confirmation"),
      /confirmation phrase did not match/
    );
    const afterRejectedUnlock = await budget.getAIbudgetStatus();
    assert.equal(afterRejectedUnlock.spendingLocked, true,
      "an invalid owner confirmation must never unlock spending");
  } finally {
    if (previousFlag === undefined) delete process.env.WIN_AI_BUDGET_TEST_MODE;
    else process.env.WIN_AI_BUDGET_TEST_MODE = previousFlag;
  }
});

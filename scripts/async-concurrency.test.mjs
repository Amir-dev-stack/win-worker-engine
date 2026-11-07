import test from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "../netlify/lib/async-concurrency.mts";

test("bounded async mapper never exceeds its concurrency limit and preserves input order", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([0, 1, 2, 3, 4, 5, 6], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return value * 10;
  });
  assert.ok(peak <= 2);
  assert.equal(peak, 2);
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50, 60]);
});

test("bounded async mapper handles empty input and rejects invalid limits", async () => {
  assert.deepEqual(await mapWithConcurrency([], 2, async value => value), []);
  await assert.rejects(mapWithConcurrency([1], 0, async value => value), /invalid_bounded_concurrency_arguments/);
  await assert.rejects(mapWithConcurrency([1], 33, async value => value), /invalid_bounded_concurrency_arguments/);
});

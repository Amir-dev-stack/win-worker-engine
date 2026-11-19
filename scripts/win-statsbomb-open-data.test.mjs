import assert from "node:assert/strict";
import test from "node:test";
import {
  readStatsBombOpenData,
  statsBombOpenDataUrl,
  summarizeStatsBombEvents
} from "./win-statsbomb-open-data.mjs";

const fixed = { clock: () => new Date("2026-11-17T08:00:00.000Z") };
const fake = (data, { status = 200, declared = null, contentType = "application/json" } = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: key => key === "content-length" ? declared : key === "content-type" ? contentType : null },
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(data)).buffer
});

test("validates fixed resource paths and positive numeric identifiers", () => {
  assert.match(statsBombOpenDataUrl("matches", { competitionId: 11, seasonId: 22 }), /matches\/11\/22\.json$/u);
  assert.match(statsBombOpenDataUrl("events", { matchId: 33 }), /events\/33\.json$/u);
  assert.throws(() => statsBombOpenDataUrl("events", { matchId: "../secret" }), /integer/u);
  assert.throws(() => statsBombOpenDataUrl("unknown"), /Unsupported/u);
});

test("returns bounded research-only provenance without granting rights or freshness", async () => {
  const result = await readStatsBombOpenData("competitions", {}, {
    ...fixed,
    fetcher: fake([{ competition_id: 1 }], { contentType: "text/plain; charset=utf-8" })
  });
  assert.equal(result.recordCount, 1);
  assert.equal(result.providerId, "statsbomb-open-data");
  assert.equal(result.researchOnly, true);
  assert.equal(result.licenceReviewRequired, true);
  assert.equal(result.usageApprovalGranted, false);
  assert.equal(result.freshnessGuarantee, "none");
  assert.equal(result.retrievedAt, "2026-11-17T08:00:00.000Z");
});

test("fails closed for oversized, malformed, unavailable or wrong-content data", async () => {
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: fake([], { declared: "9000000" }) }), /limit/u);
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: fake({ foo: 1 }) }), /not an array/u);
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: fake([], { status: 404 }) }), /HTTP 404/u);
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: fake([], { contentType: "text/html" }) }), /content type/u);
});

test("invalid clock, timeout and fetch configuration fail without a provider call", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return fake([])(); };
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, timeoutMs: 0 }), /timeout/u);
  assert.equal(calls, 0);
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, clock: () => new Date("bad") }), /clock/u);
  assert.equal(calls, 0);
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: "bad" }), /fetch implementation/u);
});

test("timeout aborts a stalled request and never retries", async () => {
  let calls = 0;
  const fetcher = async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  };
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, timeoutMs: 5 }), /request failed/u);
  assert.equal(calls, 1);
});

test("stream over the byte cap is cancelled", async () => {
  let cancelled = 0;
  const reader = {
    reads: 0,
    async read() { this.reads++; return this.reads === 1 ? { done: false, value: new Uint8Array(6) } : { done: true }; },
    async cancel() { cancelled++; },
    releaseLock() {}
  };
  const fetcher = async () => ({
    ok: true,
    status: 200,
    headers: { get: key => key === "content-type" ? "application/json" : null },
    body: { getReader: () => reader }
  });
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, maxBytes: 5 }), /byte limit/u);
  assert.equal(cancelled, 1);
});

test("summarizes event types without inventing player or match metrics", () => {
  assert.deepEqual(
    summarizeStatsBombEvents([{ type: { name: "Pass" } }, { type: { name: "Pass" } }, { type: { name: "Shot" } }, {}]),
    { eventCount: 4, byType: { Pass: 2, Shot: 1 } }
  );
});

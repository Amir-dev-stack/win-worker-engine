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
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher: fake([], { contentType: null }) }), /content type/u);
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

test("deadline settles a stalled fetch that ignores AbortSignal and never retries", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return new Promise(() => {});
  };
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, timeoutMs: 5 }), /deadline exceeded/u);
  assert.equal(calls, 1);
});

test("deadline settles a stalled stream read despite stalled cancellation", async () => {
  let cancelled = 0;
  const reader = {
    read: async () => new Promise(() => {}),
    cancel: async () => { cancelled++; return new Promise(() => {}); },
    releaseLock() {}
  };
  const fetcher = async () => ({
    ok: true,
    status: 200,
    headers: { get: key => key === "content-type" ? "application/json" : null },
    body: { getReader: () => reader }
  });
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, timeoutMs: 5 }), /deadline exceeded/u);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, 1);
});

test("deadline bounds a fallback arrayBuffer that ignores AbortSignal", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 200,
    headers: { get: key => key === "content-type" ? "application/json" : null },
    arrayBuffer: async () => new Promise(() => {})
  });
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, timeoutMs: 5 }), /deadline exceeded/u);
});

test("external abort settles a stalled read with a fixed diagnostic and no retry", async () => {
  let calls = 0;
  const controller = new AbortController();
  const reader = {
    read: async () => new Promise(() => {}),
    cancel: async () => {},
    releaseLock() {}
  };
  const fetcher = async () => {
    calls++;
    return {
      ok: true,
      status: 200,
      headers: { get: key => key === "content-type" ? "application/json" : null },
      body: { getReader: () => reader }
    };
  };
  const request = readStatsBombOpenData("competitions", {}, {
    fetcher,
    signal: controller.signal,
    timeoutMs: 100
  });
  setImmediate(() => controller.abort());
  await assert.rejects(request, /request aborted/u);
  assert.equal(calls, 1);
});

test("an already aborted external signal prevents the provider call", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readStatsBombOpenData("competitions", {}, {
    fetcher: async () => { calls++; return fake([])(); },
    signal: controller.signal
  }), /request aborted/u);
  assert.equal(calls, 0);
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
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, 1);
});

test("stream overflow settles without awaiting stalled cancellation", async () => {
  const reader = {
    async read() { return { done: false, value: new Uint8Array(6) }; },
    async cancel() { return new Promise(() => {}); },
    releaseLock() {}
  };
  const fetcher = async () => ({
    ok: true,
    status: 200,
    headers: { get: key => key === "content-type" ? "application/json" : null },
    body: { getReader: () => reader }
  });
  await assert.rejects(readStatsBombOpenData("competitions", {}, { fetcher, maxBytes: 5 }), /byte limit/u);
});

test("summarizes event types without inventing player or match metrics", () => {
  assert.deepEqual(
    summarizeStatsBombEvents([{ type: { name: "Pass" } }, { type: { name: "Pass" } }, { type: { name: "Shot" } }, {}]),
    { eventCount: 4, byType: { Pass: 2, Shot: 1 } }
  );
});

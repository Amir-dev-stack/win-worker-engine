import test from "node:test";
import assert from "node:assert/strict";
import { readScheduledScoutRunId } from "../netlify/functions/scheduled-scout-runner.mts";

const request = (body, options = {}) => new Request("https://win.test/.netlify/functions/scheduled-scout-runner", {
  method: options.method || "POST",
  headers: options.headers || { "content-type": "application/json" },
  body
});

test("scheduled scout request accepts a bounded non-empty run ID", async () => {
  const result = await readScheduledScoutRunId(request(JSON.stringify({ runId: "run-fixture-01" })));
  assert.deepEqual(result, { runId: "run-fixture-01" });
});

test("scheduled scout request rejects non-POST methods", async () => {
  const result = await readScheduledScoutRunId(request(undefined, { method: "GET" }));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 405);
});

test("scheduled scout request requires JSON content type", async () => {
  const result = await readScheduledScoutRunId(request("{}", { headers: { "content-type": "text/plain" } }));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 415);
});

test("scheduled scout request rejects malformed JSON and invalid run IDs", async () => {
  for (const body of ["{", "{}", JSON.stringify({ runId: " " }), JSON.stringify({ runId: "x".repeat(181) }), JSON.stringify({ runId: 123 })]) {
    const result = await readScheduledScoutRunId(request(body));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  }
});

test("scheduled scout request rejects oversized bodies before JSON parsing", async () => {
  const result = await readScheduledScoutRunId(request(" ".repeat(16 * 1024 + 1)));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
});

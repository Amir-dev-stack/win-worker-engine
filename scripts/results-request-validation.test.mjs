import test from "node:test";
import assert from "node:assert/strict";
import { readResultSubmissionBody } from "../netlify/functions/results.mts";

const request = (body, headers = { "content-type": "application/json" }) =>
  new Request("https://win.test/api/results", { method: "POST", headers, body });

test("result submission accepts a bounded JSON object", async () => {
  const result = await readResultSubmissionBody(request(JSON.stringify({ predictionId: "p-1", outcome: "won" })));
  assert.deepEqual(result, { body: { predictionId: "p-1", outcome: "won" } });
});

test("result submission requires JSON content type", async () => {
  const result = await readResultSubmissionBody(request("{}", { "content-type": "text/plain" }));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 415);
});

test("result submission rejects malformed JSON and non-object JSON", async () => {
  for (const raw of ["{", "null", "[]", '"string"', "42"]) {
    const result = await readResultSubmissionBody(request(raw));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  }
});

test("result submission enforces declared and streamed body limits", async () => {
  const declared = await readResultSubmissionBody(request("{}", {
    "content-type": "application/json", "content-length": String(64 * 1024 + 1)
  }));
  assert.ok(declared instanceof Response);
  assert.equal(declared.status, 413);

  const streamed = await readResultSubmissionBody(request(" ".repeat(64 * 1024 + 1)));
  assert.ok(streamed instanceof Response);
  assert.equal(streamed.status, 413);
});

test("result submission rejects invalid UTF-8", async () => {
  const req = new Request("https://win.test/api/results", {
    method: "POST", headers: { "content-type": "application/json" },
    body: new Uint8Array([0xff, 0xfe])
  });
  const result = await readResultSubmissionBody(req);
  assert.ok(result instanceof Response);
  assert.equal(result.status, 400);
});

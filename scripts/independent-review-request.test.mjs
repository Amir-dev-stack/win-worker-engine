import test from "node:test";
import assert from "node:assert/strict";
import { readIndependentReviewBody } from "../netlify/lib/independent-review-request.mts";

const request = (body, headers = { "content-type": "application/json" }) =>
  new Request("https://win.test/api/independent-review", { method: "POST", headers, body });

test("independent-review parser accepts bounded JSON objects with charset parameters", async () => {
  const parsed = await readIndependentReviewBody(request(JSON.stringify({ action: "review_case" }), {
    "content-type": "application/json; charset=utf-8"
  }));
  assert.ok(!(parsed instanceof Response));
  assert.equal(parsed.body.action, "review_case");
});

test("independent-review parser rejects unsupported and misleading media types", async () => {
  for (const contentType of ["text/plain", "application/jsonp", "application/json-evil"]) {
    const parsed = await readIndependentReviewBody(request("{}", { "content-type": contentType }));
    assert.ok(parsed instanceof Response);
    assert.equal(parsed.status, 415);
  }
});

test("independent-review parser rejects oversized streamed and declared bodies", async () => {
  const streamed = await readIndependentReviewBody(request(JSON.stringify({ value: "x".repeat(65 * 1024) })));
  assert.ok(streamed instanceof Response);
  assert.equal(streamed.status, 413);

  const declared = await readIndependentReviewBody(request("{}", {
    "content-type": "application/json",
    "content-length": String(65 * 1024)
  }));
  assert.ok(declared instanceof Response);
  assert.equal(declared.status, 413);
});

test("independent-review parser rejects malformed, non-object and invalid UTF-8 bodies", async () => {
  for (const raw of ["{", "[]", "null", "false"]) {
    const parsed = await readIndependentReviewBody(request(raw));
    assert.ok(parsed instanceof Response);
    assert.equal(parsed.status, 400);
  }
  const invalidUtf8 = await readIndependentReviewBody(request(new Uint8Array([0xff, 0xfe])));
  assert.ok(invalidUtf8 instanceof Response);
  assert.equal(invalidUtf8.status, 400);
});

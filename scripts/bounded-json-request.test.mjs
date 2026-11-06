import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJsonObject } from "../netlify/lib/bounded-json-request.mts";

const request = (body, headers = { "content-type": "application/json" }) =>
  new Request("https://win.test/api/request", { method: "POST", headers, body });

test("bounded JSON parser accepts objects and JSON charset parameters", async () => {
  const result = await readBoundedJsonObject(request(JSON.stringify({ action: "test" }), {
    "content-type": "application/json; charset=utf-8"
  }));
  assert.ok(!(result instanceof Response));
  assert.equal(result.body.action, "test");
});

test("bounded JSON parser rejects misleading and unsupported media types", async () => {
  for (const contentType of ["text/plain", "application/jsonp", "application/json-evil"]) {
    const result = await readBoundedJsonObject(request("{}", { "content-type": contentType }));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 415);
  }
});

test("bounded JSON parser enforces declared and streamed byte limits", async () => {
  const declared = await readBoundedJsonObject(request("{}", {
    "content-type": "application/json",
    "content-length": "1000"
  }), 100);
  assert.ok(declared instanceof Response);
  assert.equal(declared.status, 413);

  const streamed = await readBoundedJsonObject(request(JSON.stringify({ value: "x".repeat(200) })), 100);
  assert.ok(streamed instanceof Response);
  assert.equal(streamed.status, 413);
});

test("bounded JSON parser rejects invalid UTF-8, malformed JSON and non-object JSON", async () => {
  const invalidUtf8 = await readBoundedJsonObject(request(new Uint8Array([0xff, 0xfe])));
  assert.ok(invalidUtf8 instanceof Response);
  assert.equal(invalidUtf8.status, 400);
  for (const raw of ["{", "[]", "null", "42"]) {
    const result = await readBoundedJsonObject(request(raw));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  }
});

test("bounded JSON parser rejects invalid limits instead of silently disabling the cap", async () => {
  await assert.rejects(() => readBoundedJsonObject(request("{}"), 0), /Invalid bounded JSON request limit/);
  await assert.rejects(() => readBoundedJsonObject(request("{}"), 2 * 1024 * 1024), /Invalid bounded JSON request limit/);
});

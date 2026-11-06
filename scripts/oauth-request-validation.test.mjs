import test from "node:test";
import assert from "node:assert/strict";
import { readOAuthFormBody, readOAuthJsonBody } from "../netlify/lib/oauth-request.mts";

const formRequest = (body, headers = { "content-type": "application/x-www-form-urlencoded" }) =>
  new Request("https://win.test/oauth/token", { method: "POST", headers, body });
const jsonRequest = (body, headers = { "content-type": "application/json" }) =>
  new Request("https://win.test/oauth/register", { method: "POST", headers, body });

test("OAuth form parser accepts bounded URL-encoded fields and UTF-8 charset", async () => {
  const result = await readOAuthFormBody(formRequest("grant_type=authorization_code&client_id=client-1", {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
  }));
  assert.ok(!(result instanceof Response));
  assert.equal(result.params.get("grant_type"), "authorization_code");
  assert.equal(result.params.get("client_id"), "client-1");
});

test("OAuth form parser rejects unsupported media types and duplicate keys", async () => {
  const wrongType = await readOAuthFormBody(formRequest("a=1", { "content-type": "multipart/form-data" }));
  assert.ok(wrongType instanceof Response);
  assert.equal(wrongType.status, 415);

  const duplicate = await readOAuthFormBody(formRequest("grant_type=authorization_code&grant_type=refresh_token"));
  assert.ok(duplicate instanceof Response);
  assert.equal(duplicate.status, 400);
});

test("OAuth form parser rejects oversized streamed and declared bodies", async () => {
  const streamed = await readOAuthFormBody(formRequest("x".repeat(16 * 1024 + 1)));
  assert.ok(streamed instanceof Response);
  assert.equal(streamed.status, 413);

  const declared = await readOAuthFormBody(formRequest("a=1", {
    "content-type": "application/x-www-form-urlencoded",
    "content-length": String(16 * 1024 + 1)
  }));
  assert.ok(declared instanceof Response);
  assert.equal(declared.status, 413);
});

test("OAuth parsers reject invalid UTF-8 before decoding form or JSON", async () => {
  const form = await readOAuthFormBody(formRequest(new Uint8Array([0xff, 0xfe])));
  assert.ok(form instanceof Response);
  assert.equal(form.status, 400);

  const json = await readOAuthJsonBody(jsonRequest(new Uint8Array([0xff, 0xfe])));
  assert.ok(json instanceof Response);
  assert.equal(json.status, 400);
});

test("OAuth JSON parser accepts objects and rejects malformed, non-object and misleading media types", async () => {
  const valid = await readOAuthJsonBody(jsonRequest(JSON.stringify({ client_name: "WIN" })));
  assert.ok(!(valid instanceof Response));
  assert.equal(valid.body.client_name, "WIN");

  for (const raw of ["{", "[]", "null", "42"]) {
    const result = await readOAuthJsonBody(jsonRequest(raw));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  }

  const wrongType = await readOAuthJsonBody(jsonRequest("{}", { "content-type": "application/jsonp" }));
  assert.ok(wrongType instanceof Response);
  assert.equal(wrongType.status, 415);
});

test("OAuth JSON parser enforces the 16 KiB streamed request cap", async () => {
  const result = await readOAuthJsonBody(jsonRequest(JSON.stringify({ value: "x".repeat(17 * 1024) })));
  assert.ok(result instanceof Response);
  assert.equal(result.status, 413);
});

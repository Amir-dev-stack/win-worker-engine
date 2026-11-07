import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("independent review binds identity to the separate reviewer credential", async () => {
  const source = await readFile(new URL("../netlify/functions/independent-review.mts", import.meta.url), "utf8");
  assert.match(source, /async function authenticateReviewer\(req: Request\)/);
  assert.match(source, /tokenHash/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /reviewCase\(body, reviewer\)/);
  assert.match(source, /reviewerCredentialId: reviewer\.credentialId/);
  assert.doesNotMatch(source, /body\??\.actorId|body\.actorId/);
  assert.doesNotMatch(source, /body\??\.reviewerCredentialId|body\.reviewerCredentialId/);
});

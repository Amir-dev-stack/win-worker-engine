import test from "node:test";
import assert from "node:assert/strict";
import { createWorkersAiFreeAdapter } from "./win-cloudflare-free-adapter.mjs";
import { prepareCloudBackupReview, requestCloudBackupReview } from "./win-cloud-backup-review-worker.mjs";

const accountId = "a".repeat(32), token = "example-test-token-1234";
function config(fetchImpl) {
  return { accountId, token, freePlanVerified: true,
    privateCodeTransferApproved: true, paidUsageEnabled: false, fetchImpl };
}
test("never creates adapter without externally verified free plan and transfer consent", () => {
  for (const key of ["freePlanVerified", "privateCodeTransferApproved"]) {
    const x = config(async () => null);
    x[key] = false;
    assert.throws(() => createWorkersAiFreeAdapter(x), /verified externally/);
  }
  const x = config(async () => null);
  x.paidUsageEnabled = true;
  assert.throws(() => createWorkersAiFreeAdapter(x), /verified externally/);
});
test("free candidate submits only fixed eligible model and bounded no-tools review", async () => {
  let calls = 0;
  const a = createWorkersAiFreeAdapter(config(async (url, options) => {
    calls++;
    assert.match(url, /\/ai\/run\/@cf\/zai-org\/glm-4\.7-flash$/);
    assert.equal(options.method, "POST");
    const payload = JSON.parse(options.body);
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.max_tokens, 512);
    assert.equal(payload.stream, false);
    assert.ok(!payload.tools);
    return new Response(JSON.stringify({
      success: true, result: { response: "Review: add a focused regression test." }
    }), { status: 200 });
  }));
  assert.equal(a.toolsEnabled, false);
  assert.equal(a.executionMode, "cloud_read_only");
  const out = await a.generate({
    prompt: '{"role":"review","files":[]}', maxOutputBytes: 2048, taskId: "win-123"
  });
  assert.match(out, /regression test/);
  assert.equal(calls, 1);
});
test("free allocation errors stop instead of selecting paid fallback", async () => {
  let calls = 0;
  const a = createWorkersAiFreeAdapter(config(async () => {
    calls++;
    return new Response('{"error":"quota"}', {status: 429});
  }));
  await assert.rejects(a.generate({
    prompt: "bounded", maxOutputBytes: 2048, taskId: "win-123"
  }), /stop, do not retry/);
  assert.equal(calls, 1);
});
test("oversized prompts fail without provider calls", async () => {
  let calls = 0;
  const a = createWorkersAiFreeAdapter(config(async () => {calls++; throw new Error("called");}));
  await assert.rejects(a.generate({
    prompt: "x".repeat(33000), maxOutputBytes: 2048, taskId: "win-123"
  }), /Invalid cloud review request/);
  assert.equal(calls, 0);
});
test("too-large model responses fail without leaking payload content", async () => {
  const a = createWorkersAiFreeAdapter(config(async () => new Response("x".repeat(49000), { status:200 })));
  await assert.rejects(a.generate({
    prompt: "test", maxOutputBytes: 2048, taskId: "win-123"
  }), /Cloud response too large/);
});

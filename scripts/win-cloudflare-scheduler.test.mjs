import test from "node:test";
import assert from "node:assert/strict";
import worker, { dispatchWinCronJob, resolveWinCronJob } from "../cloudflare/win-scheduler/src/index.ts";

const env = {
  WIN_ORIGIN: "https://win-worker-engine.netlify.app",
  WIN_INTERNAL_TOKEN: "test-only-secret"
};

test("Cloudflare scheduler maps only the two approved cron expressions", () => {
  assert.deepEqual(resolveWinCronJob("*/15 * * * *"), {
    id: "health", path: "/api/health", method: "GET"
  });
  assert.deepEqual(resolveWinCronJob("53 */4 * * *"), {
    id: "post_match_failover", path: "/.netlify/functions/post-match-runner", method: "POST"
  });
  assert.equal(resolveWinCronJob("0 * * * *"), null);
});

test("health cron sends one authenticated read-only request", async () => {
  let calls = 0;
  const result = await dispatchWinCronJob("*/15 * * * *", env, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://win-worker-engine.netlify.app/api/health");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only-secret");
    assert.equal(new Headers(init?.headers).get("cache-control"), "no-store");
    assert.ok(init?.signal);
    return new Response("ok", { status: 200 });
  });
  assert.deepEqual(result, { job: "health", status: 200, ok: true });
  assert.equal(calls, 1);
});

test("four-hour failover cron probes heartbeat then posts only when the primary run is stale", async () => {
  let calls = 0;
  const now = Date.now();
  const result = await dispatchWinCronJob("53 */4 * * *", env, async (url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only-secret");
    if (calls === 1) {
      assert.equal(String(url), "https://win-worker-engine.netlify.app/api/health");
      assert.equal(init?.method, "GET");
      return Response.json({ learningSystem: { postMatchFollowup: { lastCompletedAt: new Date(now - 4 * 60 * 60 * 1000).toISOString() } } });
    }
    assert.equal(String(url), "https://win-worker-engine.netlify.app/.netlify/functions/post-match-runner");
    assert.equal(init?.method, "POST");
    return Response.json({ accepted: true, status: "completed", aiCalls: 0 });
  }, now);
  assert.deepEqual(result, { job: "post_match_failover", status: 200, ok: true });
  assert.equal(calls, 2, "one heartbeat probe and one bounded failover dispatch are expected");
});

test("failover skips when the primary Netlify run completed recently", async () => {
  let calls = 0;
  const now = Date.now();
  const result = await dispatchWinCronJob("53 */4 * * *", env, async (url, init) => {
    calls++;
    assert.equal(String(url), "https://win-worker-engine.netlify.app/api/health");
    assert.equal(init?.method, "GET");
    return Response.json({ learningSystem: { postMatchFollowup: { lastCompletedAt: new Date(now - 30 * 60 * 1000).toISOString() } } });
  }, now);
  assert.deepEqual(result, { job: "post_match_failover", skipped: true, reason: "recent_primary_completion" });
  assert.equal(calls, 1, "a recent primary completion must prevent duplicate result checking");
});

test("unknown cron expressions are skipped without making a request", async () => {
  let calls = 0;
  const result = await dispatchWinCronJob("0 * * * *", env, async () => {
    calls++;
    return new Response("unexpected");
  });
  assert.deepEqual(result, { job: "unrecognized", skipped: true });
  assert.equal(calls, 0);
});

test("scheduler rejects missing secrets and unsafe origins before network access", async () => {
  let calls = 0;
  await assert.rejects(() => dispatchWinCronJob("*/15 * * * *",
    { ...env, WIN_INTERNAL_TOKEN: "" }, async () => { calls++; return new Response("ok"); }),
  /WIN_INTERNAL_TOKEN/);
  await assert.rejects(() => dispatchWinCronJob("*/15 * * * *",
    { ...env, WIN_ORIGIN: "http://example.com" }, async () => { calls++; return new Response("ok"); }),
  /HTTPS origin/);
  await assert.rejects(() => dispatchWinCronJob("*/15 * * * *",
    { ...env, WIN_ORIGIN: "https://user:pass@example.com/path" }, async () => { calls++; return new Response("ok"); }),
  /HTTPS origin/);
  assert.equal(calls, 0);
});

test("scheduler treats failed health and result dispatches as errors without retrying", async () => {
  let calls = 0;
  await assert.rejects(() => dispatchWinCronJob("53 */4 * * *", env, async () => {
    calls++;
    if (calls === 1) return Response.json({ learningSystem: { postMatchFollowup: {} } });
    return new Response("not available", { status: 503 });
  }), /HTTP 503/);
  assert.equal(calls, 2, "the only calls are the health probe and one failover dispatch");
});

test("public HTTP surface is closed and does not expose scheduler controls", async () => {
  const response = await worker.fetch(new Request("https://scheduler.example/"));
  assert.equal(response.status, 404);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFilePerformanceStore, createFencedPerformanceLedger } from "./win-agent-performance-fenced.mjs";

const record = (agentId = "agent-a") => ({ agentId, model: "gpt-6.2-sol", status: "success", durationMs: 100, resourceUnits: 2, reviewRejected: 0 });

test("persists performance rows and fences competing owners across store instances", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "win-performance-"));
  const filePath = path.join(dir, "ledger.json");
  try {
    const first = createFilePerformanceStore({ filePath });
    const second = createFilePerformanceStore({ filePath });
    const [one, two] = await Promise.all([first.claim("agent-a", "owner-a"), second.claim("agent-a", "owner-b")]);
    assert.equal([one, two].filter(Boolean).length, 1);
    const winner = one || two;
    const winnerStore = one ? first : second;
    await winnerStore.append("agent-a", winner, record());
    const restarted = createFilePerformanceStore({ filePath });
    assert.equal((await restarted.read("agent-a")).length, 1);
    await assert.rejects(second.append("agent-a", { ownerId: "owner-b", fence: winner.fence, leaseExpiresAt: Date.now() + 1000 }, record()), /STALE_PERFORMANCE_FENCE/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fenced ledger keeps duplicate ownership from recording a second row", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "win-performance-"));
  const filePath = path.join(dir, "ledger.json");
  try {
    const a = createFencedPerformanceLedger({ store: createFilePerformanceStore({ filePath }), ownerId: "owner-a" });
    const b = createFencedPerformanceLedger({ store: createFilePerformanceStore({ filePath }), ownerId: "owner-b" });
    const results = await Promise.allSettled([a.record(record()), b.record(record())]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await createFilePerformanceStore({ filePath }).read("agent-a")).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

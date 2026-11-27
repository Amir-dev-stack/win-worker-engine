import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFilePerformanceStore, createFencedPerformanceLedger } from "./win-agent-performance-fenced.mjs";

const record = (agentId = "agent-a") => ({ agentId, model: "gpt-6.2-sol", status: "success", durationMs: 100, resourceUnits: 2, reviewRejected: 0 });

const childModuleUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "win-agent-performance-fenced.mjs")).href;
const childSource = `
  import { createFilePerformanceStore } from ${JSON.stringify(childModuleUrl)};
  const filePath = process.env.WIN_LEDGER_FILE;
  const ownerId = process.env.WIN_OWNER;
  const store = createFilePerformanceStore({ filePath });
  const held = await store.claim("agent-process", ownerId, Number(process.env.WIN_LEASE_MS));
  if (!held) { console.log(JSON.stringify({ claimed: false })); process.exit(0); }
  if (process.env.WIN_MODE === "append") {
    await store.append("agent-process", held, { agentId: "agent-process", model: "gpt-6.2-sol", status: "success", durationMs: 5, resourceUnits: 1, reviewRejected: 0 }, 20);
  }
  console.log(JSON.stringify({ claimed: true, fence: held.fence }));
`;

function runChild({ filePath, ownerId, mode = "claim", leaseMs = 80 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", childSource], {
      env: { ...process.env, WIN_LEDGER_FILE: filePath, WIN_OWNER: ownerId, WIN_MODE: mode, WIN_LEASE_MS: String(leaseMs) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", code => {
      if (code !== 0) return reject(Error(`CHILD_FAILED_${code}: ${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split("\\n").at(-1))); }
      catch { reject(Error(`CHILD_OUTPUT_INVALID: ${stdout} ${stderr}`)); }
    });
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

test("independent processes sustain fenced contention without duplicate rows", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "win-performance-process-"));
  const filePath = path.join(dir, "ledger.json");
  try {
    const rounds = 4;
    for (let round = 0; round < rounds; round += 1) {
      const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
        runChild({ filePath, ownerId: `process-${round}-${index}`, mode: "append", leaseMs: 500 })));
      assert.equal(results.filter(result => result.claimed).length, 1);
      assert.equal(results.filter(result => !result.claimed).length, 5);
      await sleep(550);
    }
    const rows = await createFilePerformanceStore({ filePath }).read("agent-process");
    assert.equal(rows.length, rounds);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a crashed process leaves a lease that expires before restart recovery", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "win-performance-crash-"));
  const filePath = path.join(dir, "ledger.json");
  try {
    const crashed = await runChild({ filePath, ownerId: "crashed-process", mode: "claim", leaseMs: 80 });
    assert.equal(crashed.claimed, true);
    const blockedRestart = await runChild({ filePath, ownerId: "restart-before-expiry", mode: "append", leaseMs: 80 });
    assert.equal(blockedRestart.claimed, false);
    await sleep(120);
    const recovered = await runChild({ filePath, ownerId: "restart-after-expiry", mode: "append", leaseMs: 80 });
    assert.equal(recovered.claimed, true);
    assert.equal(recovered.fence, 2);
    assert.equal((await createFilePerformanceStore({ filePath }).read("agent-process")).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

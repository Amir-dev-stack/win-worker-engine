import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { claimAssignment, fetchIssueComments, runAutonomousCycle, selectLatestAssignment } from "./win-autonomous-runner.mjs";

test("selects the latest bounded issue handoff", () => {
  const selected = selectLatestAssignment([{ id: 1, body: "WIN_NEXT_V1 A01" }, { id: 2, body: "WIN_HANDOFF_V1 A07" }]);
  assert.deepEqual(selected, { assignmentId: "A07", sourceCommentId: 2, direction: "WIN_HANDOFF_V1 A07" });
});

test("fences competing assignment owners", () => {
  const first = claimAssignment({ fence: 0, active: null }, "A07", "runner-a", "now");
  assert.equal(first.claimed, true);
  const second = claimAssignment(first.state, "A07", "runner-b", "later");
  assert.deepEqual(second, { claimed: false, reason: "OWNERSHIP_CONFLICT" });
});

test("paginates issue comments so the newest handoff is not missed", async () => {
  const pages = new Map([[1, Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: "older" }))], [2, [{ id: 101, body: "WIN_HANDOFF_V1 A07" }]]]);
  const comments = await fetchIssueComments({ repository: "Amir-dev-stack/win-worker-engine", issueNumber: 20, headers: {},
    fetchImpl: async (url) => ({ ok: true, async json() { return pages.get(Number(new URL(url).searchParams.get("page"))) || []; } }) });
  assert.equal(selectLatestAssignment(comments).sourceCommentId, 101);
});

test("retrieves issue comments and writes a durable checkpoint artifact without dispatch", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "win-autonomous-"));
  try {
    const statePath = path.join(dir, "state.json");
    const outputPath = path.join(dir, "result.json");
    const result = await runAutonomousCycle({ repository: "Amir-dev-stack/win-worker-engine", token: "test-token", statePath, outputPath,
      fetchImpl: async (url) => ({ ok: true, async json() { return url.includes("page=1") ? [{ id: 20, body: "WIN_NEXT_V1 A07" }] : []; } }) });
    assert.equal(result.assignment.assignmentId, "A07");
    assert.equal(result.dispatchStatus, "not_configured");
    assert.equal(result.executionEvidence, false);
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).fence, 1);
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).requiresOwnerIntervention, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

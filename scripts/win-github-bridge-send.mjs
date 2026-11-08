#!/usr/bin/env node
// WIN bridge one-shot status acknowledgment. No shell, arbitrary task execution or OpenCode runs.
// This script posts at most one fixed-format status report per authorized task to private issue #26.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

const repo = "Amir-dev-stack/win-worker-engine";
const owner = "Amir-dev-stack";
const issue = "26";
const expectedBranch = "agent/win-bridge-readonly-pilot";
const workspace = resolve(homedir(), "source", "WIN-Agent");
const taskText = "WIN_BRIDGE_TASK_V1\nSTATUS";

function command(binary, args) {
  return execFileSync(binary, args, {
    cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  }).trim();
}
function fail(message) { throw new Error(message); }

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--send-status") {
    fail("Usage: node scripts/win-github-bridge-send.mjs --send-status");
  }
  if (resolve(process.cwd()).toLowerCase() !== workspace.toLowerCase()) {
    fail("Expected isolated WIN-Agent working directory");
  }
  if (resolve(command("git", ["rev-parse", "--show-toplevel"])).toLowerCase() !== workspace.toLowerCase()) {
    fail("Unexpected checkout");
  }
  if (command("git", ["branch", "--show-current"]) !== expectedBranch) fail("Unexpected branch");
  const origin = command("git", ["remote", "get-url", "origin"]);
  if (!/^(https:\/\/github\.com\/Amir-dev-stack\/win-worker-engine(\.git)?|git@github\.com:Amir-dev-stack\/win-worker-engine(\.git)?)$/.test(origin)) {
    fail("Unexpected GitHub remote");
  }
  if (command("gh", ["api", "user", "--jq", ".login"]) !== owner) fail("Unexpected GitHub account");
  // Stop on any uncommitted changes; this relay never commits or modifies project files.
  if (command("git", ["status", "--porcelain"])) fail("Working tree is not clean");
  const response = command("gh", ["api", "repos/" + repo + "/issues/" + issue + "/comments?per_page=100"]);
  const comments = JSON.parse(response);
  if (!Array.isArray(comments) || comments.length >= 100) fail("Comment window cannot be verified safely");
  const task = comments.filter(c =>
    c?.user?.login === owner && typeof c.body === "string" &&
    c.body.replace(/\r\n/g, "\n").trim() === taskText &&
    Number.isSafeInteger(c.id)
  ).sort((a, b) => b.id - a.id)[0];
  if (!task) fail("No authorized exact STATUS task found");
  const reportHeader = "WIN_BRIDGE_RESULT_V1\nTask comment ID: " + task.id + "\n";
  const alreadySent = comments.some(c => c?.user?.login === owner &&
    typeof c.body === "string" && c.body.startsWith(reportHeader));
  if (alreadySent) {
    console.log("WIN bridge: task " + task.id + " has already been acknowledged; no new comment.");
    return;
  }
  const report = reportHeader + [
    "Status: completed",
    "Workspace: isolated WIN-Agent",
    "Branch: " + expectedBranch,
    "Working tree: clean",
    "Node version: " + process.version,
    "OpenCode execution: disabled",
    "Scope: fixed-status GitHub relay only",
    "No production changes, deployments, paid AI or billing actions.",
  ].join("\n");
  // Explicit, bounded remote write with fixed body; task content never becomes an executable command.
  command("gh", ["api", "-X", "POST",
    "repos/" + repo + "/issues/" + issue + "/comments", "-f", "body=" + report]);
  console.log("WIN bridge: fixed status report sent to private issue #26 for task " + task.id);
}
try { main(); } catch (error) {
  console.error("WIN bridge stopped: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

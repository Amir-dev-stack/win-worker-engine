#!/usr/bin/env node
// WIN bridge: one-shot, read-only preview. No PowerShell, shell, or OpenCode execution.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const repo = "Amir-dev-stack/win-worker-engine";
const owner = "Amir-dev-stack";
const issue = "26";
const expectedBranch = "agent/win-bridge-readonly-pilot";
const expectedRoot = resolve(homedir(), "source", "WIN-Agent");
const expectedTask = "WIN_BRIDGE_TASK_V1\nSTATUS";

function read(program, args) {
  return execFileSync(program, args, {
    cwd: expectedRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true,
  }).trim();
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--preview") {
    throw new Error("This pilot supports only --preview; no remote comments or agent execution.");
  }
  if (resolve(process.cwd()).toLowerCase() !== expectedRoot.toLowerCase()) {
    throw new Error("Run only in the isolated WIN-Agent directory.");
  }

  const root = resolve(read("git", ["rev-parse", "--show-toplevel"]));
  if (root.toLowerCase() !== expectedRoot.toLowerCase()) throw new Error("Unexpected Git checkout.");
  const branch = read("git", ["branch", "--show-current"]);
  if (branch !== expectedBranch) throw new Error("Unexpected branch: " + branch);
  const remote = read("git", ["remote", "get-url", "origin"]);
  if (!/^(https:\/\/github\.com\/Amir-dev-stack\/win-worker-engine(\.git)?|git@github\.com:Amir-dev-stack\/win-worker-engine(\.git)?)$/.test(remote)) {
    throw new Error("Unexpected origin repository.");
  }
  const login = read("gh", ["api", "user", "--jq", ".login"]);
  if (login !== owner) throw new Error("GitHub CLI account does not match expected owner.");
  const comments = JSON.parse(read("gh", ["api", "repos/" + repo + "/issues/" + issue + "/comments", "--paginate"]));
  if (!Array.isArray(comments)) throw new Error("Unexpected GitHub comments response.");
  const tasks = comments.filter(c =>
    c && c.user?.login === owner &&
    typeof c.body === "string" && c.body.replace(/\r\n/g, "\n").trim() === expectedTask
  );
  if (!tasks.length) throw new Error("No approved fixed STATUS task found.");
  const taskId = tasks.reduce((max, c) => Math.max(max, c.id), 0);
  const dirty = Boolean(read("git", ["status", "--porcelain"]));
  const nodeVersion = process.version;
  console.log([
    "WIN_BRIDGE_RESULT_V1",
    "Task comment ID: " + taskId,
    "Status: preview",
    "Workspace: isolated WIN-Agent",
    "Branch: " + expectedBranch,
    "Working tree: " + (dirty ? "modified" : "clean"),
    "Node version: " + nodeVersion,
    "OpenCode execution: disabled",
    "Remote write: disabled",
    "No deployment, paid API, billing action, or source modification.",
    "PREVIEW ONLY: no GitHub comment posted.",
  ].join("\n"));
}

try { main(); } catch (error) {
  console.error("WIN bridge preview stopped: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

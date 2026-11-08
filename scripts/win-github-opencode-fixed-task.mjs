#!/usr/bin/env node
// WIN bridge V1: exactly one fixed GitHub task -> local Ollama/OpenCode smoke -> bounded reply.
// This is not a general agent runner; GitHub comments are never interpreted as commands/prompts.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

const repo = "Amir-dev-stack/win-worker-engine";
const expectedRoot = resolve(homedir(), "source", "WIN-Agent");
const expectedBranch = "agent/win-bridge-readonly-pilot";
const exactTask = "WIN_BRIDGE_TASK_V1\nLOCAL_MODEL_SMOKE";
const owner = "Amir-dev-stack";
const issue = "26";
const maxComments = 99;

function run(program, args, timeout = 15000) {
  const r = spawnSync(program, args, {
    cwd: expectedRoot, encoding: "utf8", windowsHide: true, timeout,
    maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0) throw new Error(program + " failed or timed out");
  return (r.stdout || "").trim();
}
function main() {
  if (process.argv.length !== 2) throw new Error("No command-line arguments supported.");
  if (resolve(process.cwd()).toLowerCase() !== expectedRoot.toLowerCase()) throw new Error("Wrong directory");
  if (resolve(run("git", ["rev-parse", "--show-toplevel"])).toLowerCase() !== expectedRoot.toLowerCase())
    throw new Error("Not the isolated WIN-Agent checkout");
  if (run("git", ["branch", "--show-current"]) !== expectedBranch) throw new Error("Wrong branch");
  if (!/^(https:\/\/github\.com\/Amir-dev-stack\/win-worker-engine(\.git)?|git@github\.com:Amir-dev-stack\/win-worker-engine(\.git)?)$/.test(
    run("git", ["remote", "get-url", "origin"])
  )) throw new Error("Wrong repository");
  if (run("git", ["status", "--porcelain"])) throw new Error("Working tree must be clean");
  if (run("gh", ["api", "user", "--jq", ".login"]) !== owner) throw new Error("Wrong GitHub identity");

  // Exact format, exact owner identity, limited comment window; no arbitrary task text enters the model.
  const comments = JSON.parse(run("gh", ["api", "repos/" + repo + "/issues/" + issue + "/comments?per_page=100"]));
  if (!Array.isArray(comments) || comments.length > maxComments) throw new Error("Unsafe or incomplete issue comment window");
  const tasks = comments.filter(c => c?.user?.login === owner &&
    Number.isSafeInteger(c.id) && typeof c.body === "string" &&
    c.body.replace(/\r\n/g, "\n").trim() === exactTask
  ).sort((a, b) => b.id - a.id);
  const task = tasks[0];
  if (!task) throw new Error("No exact LOCAL_MODEL_SMOKE task by owner");

  const prefix = "WIN_BRIDGE_RESULT_V1\nTask comment ID: " + task.id + "\n";
  if (comments.some(c => c?.user?.login === owner &&
      typeof c.body === "string" && c.body.startsWith(prefix))) {
    console.log("WIN bridge: fixed model task already acknowledged; nothing sent.");
    return;
  }

  // Reuse the separately validated fixed local model smoke; no issue text passed to model.
  const r = spawnSync(process.execPath, [resolve(expectedRoot, "scripts", "win-opencode-local-smoke.mjs")], {
    cwd: expectedRoot, encoding: "utf8", windowsHide: true,
    timeout: 120000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.status !== 0 || !(r.stdout || "").includes("WIN_LOCAL_MODEL_OK")) {
    console.error("WIN bridge: local model test failed or timed out; no GitHub report was posted.");
    process.exitCode = 1;
    return;
  }
  if (run("git", ["status", "--porcelain"])) {
    throw new Error("Working tree changed; report withheld");
  }

  const body = prefix + [
    "Status: completed",
    "Task: LOCAL_MODEL_SMOKE (fixed allowlist)",
    "Model: ollama/qwen2.5-coder:7b",
    "Local model marker: WIN_LOCAL_MODEL_OK",
    "Tool permissions: denied in local smoke configuration",
    "GitHub task body passed to model: no",
    "Repository file modifications: none detected",
    "Production deployment, push or merge: not requested",
    "Paid API provider: not selected",
  ].join("\n");
  run("gh", ["api", "-X", "POST", "repos/" + repo + "/issues/" + issue + "/comments", "-f", "body=" + body]);
  console.log("WIN bridge: LOCAL_MODEL_SMOKE acknowledged through GitHub for task " + task.id);
}
try { main(); } catch (error) {
  console.error("WIN bridge stopped: " + error.message);
  process.exitCode = 1;
}

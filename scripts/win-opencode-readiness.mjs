#!/usr/bin/env node
// WIN local OpenCode readiness probe. No model prompts, edits, remote writes, or paid APIs.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const expected = resolve(homedir(), "source", "WIN-Agent");
const expectedBranch = "agent/win-bridge-readonly-pilot";
const expectedOrigin = /^(https:\/\/github\.com\/Amir-dev-stack\/win-worker-engine(\.git)?|git@github\.com:Amir-dev-stack\/win-worker-engine(\.git)?)$/;

function command(binary, args) {
  return execFileSync(binary, args, {
    cwd: expected,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
    maxBuffer: 128 * 1024,
    windowsHide: true,
  }).trim();
}

async function main() {
  if (process.argv.length !== 2) throw new Error("No arguments are accepted.");
  if (resolve(process.cwd()).toLowerCase() !== expected.toLowerCase()) throw new Error("Wrong directory: use the isolated WIN-Agent clone.");
  if (!existsSync(resolve(expected, ".git"))) throw new Error("Missing isolated repository.");
  if (resolve(command("git", ["rev-parse", "--show-toplevel"])).toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Wrong git root.");
  }
  if (command("git", ["branch", "--show-current"]) !== expectedBranch) throw new Error("Wrong bridge pilot branch.");
  if (!expectedOrigin.test(command("git", ["remote", "get-url", "origin"]))) throw new Error("Unrecognized git origin.");

  let opencode = "not found";
  try { opencode = command("opencode", ["--version"]).split(/\r?\n/)[0].slice(0, 100); }
  catch { /* Do not install, log in, or contact providers automatically. */ }

  let ollama = "unavailable";
  let models = [];
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) {
      const result = await response.json();
      ollama = "available";
      models = Array.isArray(result.models) ? result.models
        .map(item => String(item.name || "").slice(0, 120))
        .filter(Boolean).slice(0, 12) : [];
    }
  } catch { /* Ollama is an optional local service. */ }

  const clean = command("git", ["status", "--porcelain"]) === "";
  const summary = {
    bridge: "WIN_OPENCODE_READINESS_V1",
    result: "local capabilities only; no agent execution",
    gitWorkspace: "WIN-Agent",
    branch: expectedBranch,
    workingTree: clean ? "clean" : "modified",
    nodeVersion: process.version,
    openCodeCliVersion: opencode,
    ollama: ollama,
    localModels: models,
    modelRequests: 0,
    gitHubWrites: 0,
    paidApiRequests: 0,
    localFileChanges: 0,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error("WIN OpenCode readiness stopped: " + error.message);
  process.exitCode = 1;
});

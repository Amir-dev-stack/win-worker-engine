#!/usr/bin/env node
// Local-only OpenCode inference smoke test. Does not read GitHub assignments.
// OpenCode may create session/cache files outside this checkout; it is not an OS sandbox.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(homedir(), "source", "WIN-Agent");
const branch = "agent/win-bridge-readonly-pilot";
const model = "ollama/qwen2.5-coder:7b";
const exactPrompt = "WIN isolated local test. Reply with exactly WIN_LOCAL_MODEL_OK. Do not invoke any tools.";
const config = {
  model,
  permission: { "*": "deny" },
  mcp: {},
  plugin: [],
};

function git(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot, encoding: "utf8", timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("git verification failed");
  return result.stdout.trim();
}
function main() {
  if (process.argv.length !== 2) throw new Error("No command-line arguments are supported.");
  if (resolve(process.cwd()).toLowerCase() !== repoRoot.toLowerCase()) {
    throw new Error("Run only inside the isolated WIN-Agent checkout.");
  }
  if (resolve(git(["rev-parse", "--show-toplevel"])).toLowerCase() !== repoRoot.toLowerCase()) {
    throw new Error("Unexpected git working tree.");
  }
  if (git(["branch", "--show-current"]) !== branch) throw new Error("Unexpected branch.");
  if (git(["status", "--porcelain"]) !== "") throw new Error("Please run from a clean checkout.");

  const scratch = mkdtempSync(join(tmpdir(), "win-local-model-"));
  try {
    // Provide only Windows process essentials; do not inherit cloud provider credentials.
    const env = {};
    for (const key of ["SystemRoot", "WINDIR", "ComSpec", "PATH", "Path", "PATHEXT",
      "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
    env.OPENCODE_DISABLE_PROJECT_CONFIG = "true";
    env.NO_COLOR = "1";
    // OpenCode Windows installs expose a .cmd launcher; PowerShell's .ps1 shim is blocked.
    const args = ["/d", "/s", "/c", "opencode.cmd", "run", "--model", model,
      "--agent", "plan", "--format", "default", exactPrompt];
    const result = spawnSync("cmd.exe", args, {
      cwd: scratch, env, encoding: "utf8", timeout: 90000, maxBuffer: 512 * 1024,
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error) {
      if (result.error.code === "ETIMEDOUT") throw new Error("Local model timed out; no cloud fallback attempted.");
      throw new Error("OpenCode invocation failed: " + result.error.message);
    }
    const output = (result.stdout || "").trim();
    if (result.status !== 0) {
      console.error((result.stderr || "").slice(0, 800).replace(/(?:sk-|ghp_|github_pat_)[a-z0-9_-]+/gi, "[REDACTED]"));
      throw new Error("OpenCode local test failed with exit code " + result.status);
    }
    if (!output.includes("WIN_LOCAL_MODEL_OK")) {
      console.log("Local model replied, but the expected marker was absent.");
      console.log("Output excerpt: " + output.slice(0, 280));
      process.exitCode = 1;
      return;
    }
    console.log("WIN_LOCAL_MODEL_OK");
    console.log("Local-only OpenCode inference succeeded using " + model + ".");
    console.log("No GitHub task execution, no repository edits, and no paid provider selected.");
    console.log("Note: OpenCode may still write its own session/cache metadata outside WIN-Agent.");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
try { main(); } catch (error) {
  console.error("WIN local model test stopped: " + error.message);
  process.exitCode = 1;
}

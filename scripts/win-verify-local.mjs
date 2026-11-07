#!/usr/bin/env node
// Run WIN's existing quality checks without consuming GitHub-hosted Actions minutes.
// Node >=22.12; this script does not install dependencies or deploy anything.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const includeBundle = process.argv.includes("--bundle");
const unknown = process.argv.slice(2).filter(arg => arg !== "--bundle");
if (unknown.length) {
  console.error("Unknown option(s): " + unknown.join(", ") + "\nUsage: node scripts/win-verify-local.mjs [--bundle]");
  process.exit(2);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const checks = [
  ["Test suite and quality gates", npm, ["test"]],
  ["Production build checks", npm, ["run", "build"]],
  ["Dashboard JavaScript syntax", process.execPath, ["--check", "public/app.js"]],
];
if (includeBundle) checks.push([
  "Netlify function bundles (may download pinned esbuild; no deployment)",
  npx, ["--yes", "esbuild@0.25.0", "--bundle", "--packages=external",
    "--platform=node", "--target=node22", "--format=esm",
    "--outdir=" + resolve(tmpdir(), "win-local-bundles"), "netlify/functions/*.mts"],
]);

console.log("WIN local verification");
console.log("Working directory: " + root);
console.log("No GitHub Actions, deployment, payment, or production changes.");
for (const [label, command, args] of checks) {
  console.log("\n==> " + label);
  const run = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (run.error || run.status !== 0) {
    console.error("\nFAILED: " + label + (run.error ? " (" + run.error.message + ")" : ""));
    process.exit(run.status || 1);
  }
  console.log("PASSED: " + label);
}
console.log("\nAll selected WIN local checks passed.");

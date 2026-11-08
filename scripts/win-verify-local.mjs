#!/usr/bin/env node
// Run WIN's existing quality checks without consuming GitHub-hosted Actions minutes.
// Node >=22.12; this script does not install dependencies or deploy anything.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const includeBundle = process.argv.includes("--bundle");
const planOnly = process.argv.includes("--plan");
const unknown = process.argv.slice(2).filter(arg => arg !== "--bundle" && arg !== "--plan");
if (unknown.length) {
  console.error("Unknown option(s): " + unknown.join(", ") + "\nUsage: node scripts/win-verify-local.mjs [--bundle] [--plan]");
  process.exit(2);
}

const npm = process.execPath;
const npx = process.execPath;
const npmCli = resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npxCli = resolve(dirname(process.execPath), "node_modules/npm/bin/npx-cli.js");
const checks = [
  ["Test suite and quality gates", npm, [npmCli, "test"]],
  ["Production build checks", npm, [npmCli, "run", "build"]],
  ["Dashboard JavaScript syntax", process.execPath, ["--check", "public/app.js"]],
];
if (includeBundle) checks.push([
  "Netlify function bundles (may download pinned esbuild; no deployment)",
  npx, [npxCli, "--yes", "esbuild@0.25.0", "--bundle", "--packages=external",
    "--platform=node", "--target=node22", "--format=esm",
    "--outdir=" + resolve(tmpdir(), "win-local-bundles"), "netlify/functions/*.mts"],
]);

console.log("WIN local verification");
console.log("Working directory: " + root);
console.log("No GitHub Actions, deployment, payment, or production changes.");
for (const [label, command, args] of checks) {
  console.log("\n==> " + label);
  if (planOnly) {
    console.log("PLAN (not executed): " + [command, ...args].join(" "));
    continue;
  }
  const run = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (run.error || run.status !== 0) {
    console.error("\nFAILED: " + label + (run.error ? " (" + run.error.message + ")" : ""));
    process.exit(run.status || 1);
  }
  console.log("PASSED: " + label);
}
console.log(planOnly ? "\nPlan complete. No commands executed." : "\nAll selected WIN local checks passed.");

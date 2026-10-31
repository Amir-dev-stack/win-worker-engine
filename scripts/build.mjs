import { access, readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "netlify/functions/health.mts",
  "netlify/functions/runs.mts",
  "netlify/functions/worker-runner.mts"
];

for (const file of required) await access(file);

const html = await readFile("public/index.html", "utf8");
if (!html.includes("WIN Worker Engine")) {
  throw new Error("Dashboard entry point is missing the expected title.");
}

console.log("WIN Worker Engine build checks passed.");

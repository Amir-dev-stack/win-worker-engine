#!/usr/bin/env node
// Read-only GitHub Actions quota review. Heuristics only: not a YAML parser.
// Never prints workflow contents, env values, secrets, or credentials.
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LIMIT = 100;
const MAX_BYTES = 512 * 1024;

export function summarizeWorkflow(name, source) {
  const lines = source.split(/\r?\n/);
  // Only top-level event and concurrency declarations are considered.
  const hasTop = key => new RegExp("^" + key + ":", "m").test(source);
  const hasEvent = event => new RegExp("(^|\\n)[ \\t]*(?:on:\\s*\\[[^\\]]*\\b" + event +
    "\\b|(?:on:|['\\\"]on['\\\"]:)[\\s\\S]*?\\n[ \\t]{2}" + event + ":)", "m").test(source);
  const hasEventToken = event => new RegExp("\\b" + event + "\\b").test(source);
  const hasConcurrency = hasTop("concurrency") || /^\s{2,}concurrency:/m.test(source);
  const hasCancel = /cancel-in-progress:\s*true\b/m.test(source);
  const hasPathFilter = /^\s{2,}(?:paths|paths-ignore):/m.test(source);
  const hasSchedule = hasEventToken("schedule");
  const hasPush = hasEvent("push") || /^(?:on|["']on["']):\s*\[[^\]]*\bpush\b/m.test(source);
  const hasPr = hasEvent("pull_request") || /^(?:on|["']on["']):\s*\[[^\]]*\bpull_request\b/m.test(source);
  const hasPullTarget = hasEventToken("pull_request_target");
  const triggerOverlap = hasPush && hasPr;
  const recommendations = [];
  if (triggerOverlap) recommendations.push("Review push + pull_request overlap: the same change may run twice");
  if (!hasConcurrency || !hasCancel)
    recommendations.push("Review concurrency and cancel-in-progress for obsolete branch/PR runs");
  if (!hasPathFilter) recommendations.push("Consider path filters for noncritical/docs-only changes");
  if (hasSchedule) recommendations.push("Review whether scheduled runs are necessary and bounded");
  if (hasPullTarget) recommendations.push("Security review: pull_request_target requires special care");
  return {
    filename: name,
    lineCount: lines.length,
    pushTriggerDetected: hasPush,
    pullRequestTriggerDetected: hasPr,
    scheduleMentioned: hasSchedule,
    concurrencyMentioned: hasConcurrency,
    cancelInProgressTrue: hasCancel,
    pathFilterMentioned: hasPathFilter,
    recommendations,
  };
}

export async function auditWorkflows(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return { found: false, workflows: [], warnings: ["No .github/workflows directory found"] };
    throw error;
  }
  const files = entries.filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map(entry => entry.name).sort();
  if (files.length > LIMIT) throw new Error("Too many workflow files to review safely");
  const workflows = [];
  const warnings = [];
  for (const file of files) {
    const path = join(directory, file);
    const metadata = await stat(path);
    if (metadata.size > MAX_BYTES) { warnings.push("Skipped oversized workflow " + file); continue; }
    const source = await readFile(path, "utf8");
    workflows.push(summarizeWorkflow(file, source));
  }
  return { found: true, inspected: workflows.length, workflows, warnings,
    note: "Static heuristic review only; verify triggers manually before changing YAML. No Actions runs started." };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error("No flags accepted; this command only reads local workflow files.");
    process.exitCode = 2;
  } else {
    auditWorkflows(join(root, ".github", "workflows"))
      .then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(error => { console.error("WIN Actions audit failed: " + error.message); process.exitCode = 1; });
  }
}

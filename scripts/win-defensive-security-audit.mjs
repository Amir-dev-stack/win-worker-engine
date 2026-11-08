#!/usr/bin/env node
/**
 * WIN defensive security report v1.
 * Read-only, offline and repository scoped. No subprocesses, file writes,
 * external services, API keys, antivirus controls or runtime scanning.
 * Checks are heuristics and do not prove a repository is secure.
 */
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1024 * 1024; // Do not read unexpectedly large files.
const SAFE_WORKFLOW_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.ya?ml$/;
const SHA_PIN = /^[a-f0-9]{40}$/i;
function finding(id, level, location, message, recommendation) {
  return { id, level, location, message, recommendation };
}
export function auditWorkflow(name, source) {
  const findings = [];
  if (!SAFE_WORKFLOW_NAME.test(name) || typeof source !== "string") {
    return [finding("invalid_input", "unknown", name, "Invalid workflow input", "Review input manually")];
  }
  // Warning-only static heuristics. Do not claim to parse arbitrary YAML.
  if (/^\s*permissions\s*:\s*write-all(?:\s*#.*)?$/mi.test(source)) {
    findings.push(finding("workflow_write_all", "high", name,
      "Workflow requests broad write-all token permissions",
      "Replace with the minimum read/write permissions needed by each job"));
  }
  if (/^\s*pull_request_target\s*:/mi.test(source) ||
      /^\s*-\s*pull_request_target\s*(?:#.*)?$/mi.test(source)) {
    findings.push(finding("workflow_pr_target", "review", name,
      "pull_request_target is enabled; untrusted PR code could be dangerous if checked out and executed",
      "Review checkout, script execution and token permissions together"));
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*uses\s*:\s*['"]?([^'"\s#]+)['"]?/i);
    if (!match) continue;
    const action = match[1];
    if (/^\.\//.test(action) || /^docker:\/\//.test(action)) continue;
    const at = action.lastIndexOf("@");
    const version = at < 0 ? "" : action.slice(at + 1);
    if (!SHA_PIN.test(version)) {
      const display = action.slice(0, at >= 0 ? at : undefined).slice(0, 120);
      findings.push(finding("workflow_action_unpinned", "review", name,
        "Action " + display + " is not pinned to a full commit SHA",
        "Evaluate pinning to a reviewed full commit SHA and update it deliberately"));
    }
  }
  return findings;
}
export function auditPackageJson(source) {
  const findings = [];
  let parsed;
  try { parsed = JSON.parse(source); }
  catch {
    return [finding("manifest_unreadable", "unknown", "package.json",
      "Unable to parse manifest", "Validate package.json syntax")];
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(parsed[field] || {})) {
      if (typeof version !== "string") continue;
      if (version === "latest" || version === "*" ||
          version.startsWith("http:") || version.startsWith("git+http:")) {
        findings.push(finding("dependency_unbounded", "review", "package.json",
          "Dependency " + name.slice(0, 120) + " has an unbounded or insecure source specification",
          "Use a reviewed version/range and reproducible lockfile; prefer HTTPS"));
      }
    }
  }
  return findings;
}
export async function runSecurityAudit(root = process.cwd(), workflows = []) {
  const base = resolve(root);
  const report = {
    schema: "WIN_SECURITY_REPORT_V1",
    rootScope: "explicit_local_repository_only",
    coverage: "source-configuration-checks-only",
    findings: [],
    inspected: [],
    unknown: [],
    noSideEffects: true
  };
  async function safeRead(relative) {
    const path = resolve(base, relative);
    // Only explicit known paths; never walk user directories or follow arbitrary names.
    if (!path.startsWith(base + (process.platform === "win32" ? "\\" : "/"))) {
      report.unknown.push({ path: relative, reason: "out_of_scope" }); return null;
    }
    try {
      const { lstat } = await import("node:fs/promises");
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) {
        report.unknown.push({ path: relative, reason: "not_regular_file_or_too_large" }); return null;
      }
      const contents = await readFile(path, "utf8");
      report.inspected.push(relative);
      return contents;
    } catch {
      report.unknown.push({ path: relative, reason: "not_accessible" }); return null;
    }
  }
  const manifest = await safeRead("package.json");
  if (manifest !== null) report.findings.push(...auditPackageJson(manifest));
  // Workflow names supplied by reviewer, not automatic recursive scanning.
  for (const name of workflows) {
    if (!SAFE_WORKFLOW_NAME.test(name)) {
      report.unknown.push({ path: "workflow", reason: "invalid_name" }); continue;
    }
    const source = await safeRead(join(".github", "workflows", name));
    if (source !== null) report.findings.push(...auditWorkflow(name, source));
  }
  report.status = report.unknown.length ? "INCOMPLETE" :
    report.findings.some(x => x.level === "high") ? "REVIEW_REQUIRED" :
    report.findings.length ? "ADVISORIES" : "NO_HEURISTIC_FINDINGS";
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Manual invocation only; no timer, schedule or background watcher.
  const args = process.argv.slice(2);
  if (args.some(x => !SAFE_WORKFLOW_NAME.test(x))) {
    console.error("Only plain workflow filenames are accepted");
    process.exitCode = 2;
  } else {
    runSecurityAudit(process.cwd(), args)
      .then(report => {
        console.log(JSON.stringify(report, null, 2));
        if (report.status === "REVIEW_REQUIRED" || report.status === "INCOMPLETE") process.exitCode = 1;
      })
      .catch(() => { console.error("Security audit failed"); process.exitCode = 1; });
  }
}

#!/usr/bin/env node
/**
 * Read-only WIN local disk usage audit.
 * No deletion, file editing, downloads, GitHub writes, network calls or timers.
 * Directory symbolic links/junctions are skipped, unreadable paths are reported.
 */
import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WARN_BYTES = 20 * 1024 ** 3;
export const TARGET_BYTES = 25 * 1024 ** 3;
const MAX_FILES = 250000;
const MAX_DEPTH = 32;
const GB = 1024 ** 3;

export function localStorageRoots(home = homedir(), localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local")) {
  return Object.freeze({
    ollama_models: join(home, ".ollama", "models"),
    win_original: join(home, "source", "WIN"),
    win_agent: join(home, "source", "WIN-Agent"),
    win_backup: join(home, "source", "WIN-backup-20261108"),
    win_agent_backups: join(home, "source", "WIN-Agent-Local-Backups"),
    opencode_data: join(home, ".local", "share", "opencode"),
    opencode_config: join(home, ".config", "opencode"),
    opencode_appdata: join(localAppData, "opencode"),
  });
}

export async function measureRoot(root, limits = {}) {
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1 ||
      !Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error("Invalid scan limits");
  }

  const stack = [{ path: resolve(root), depth: 0 }];
  let bytes = 0, files = 0, skippedLinks = 0, missing = false, complete = true;
  let errors = 0;
  while (stack.length) {
    const { path, depth } = stack.pop();
    let meta;
    try {
      meta = await lstat(path);
    } catch (error) {
      if (error.code === "ENOENT" && path === resolve(root)) { missing = true; break; }
      complete = false; errors++; continue;
    }
    if (meta.isSymbolicLink()) { skippedLinks++; complete = false; continue; }
    if (meta.isFile()) {
      if (files === maxFiles) { complete = false; break; }
      files++;
      bytes += meta.size;
    } else if (meta.isDirectory()) {
      if (depth >= maxDepth) { complete = false; continue; }
      let entries;
      try {
        entries = await readdir(path);
      } catch { complete = false; errors++; continue; }
      for (const name of entries) stack.push({ path: join(path, name), depth: depth + 1 });
    } else {
      // Skip special files; do not open sockets/devices.
      complete = false;
    }
  }
  return { bytes, files, missing, complete, skippedLinks, errors };
}

export async function getLocalStorageReport(roots = localStorageRoots(), limits = {}) {
  const entries = Object.entries(roots);
  const items = [];
  const pathsSeen = new Set();
  let totalBytes = 0, complete = true;
  for (const [name, path] of entries) {
    const normalizedPath = resolve(path).toLowerCase();
    if (pathsSeen.has(normalizedPath)) {
      complete = false;
      items.push({ name, duplicatePath: true, complete: false });
      continue;
    }
    pathsSeen.add(normalizedPath);
    const detail = await measureRoot(path, limits);
    totalBytes += detail.bytes;
    if (!detail.complete) complete = false;
    items.push({ name, gb: Number((detail.bytes / GB).toFixed(3)), ...detail });
  }
  const status = !complete ? "INCOMPLETE" :
    totalBytes >= TARGET_BYTES ? "TARGET_EXCEEDED" :
    totalBytes >= WARN_BYTES ? "WARNING" : "BELOW_WARNING";
  return {
    policy: "WIN_LOCAL_STORAGE_V1",
    status, complete,
    totalGiB: Number((totalBytes / GB).toFixed(3)),
    warningGiB: 20,
    targetGiB: 25,
    belowTargetGiB: Number((Math.max(0, TARGET_BYTES - totalBytes) / GB).toFixed(3)),
    items,
    note: complete ?
      "Measured configured roots only, not all OS/application caches. No files changed." :
      "Incomplete scan: missing roots, links, access errors or limits may underestimate usage. No files changed.",
  };
}

const executedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executedDirectly) {
  if (process.argv.length !== 2) {
    console.error("WIN storage monitor accepts no arguments.");
    process.exitCode = 2;
  } else {
    getLocalStorageReport()
      .then(report => {
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== "BELOW_WARNING") process.exitCode = 1;
      })
      .catch(error => {
        console.error("WIN storage monitor failed: " + error.message);
        process.exitCode = 1;
      });
  }
}

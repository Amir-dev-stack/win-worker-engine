import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const qualityGatePath = fileURLToPath(new URL("./quality-gates.mjs", import.meta.url));
const source = await readFile(qualityGatePath, "utf8");

const syntax = spawnSync(process.execPath, ["--check", qualityGatePath], {
  encoding: "utf8",
});

assert.equal(
  syntax.status,
  0,
  `quality-gates.mjs must parse before any architecture checks execute:\n${syntax.stderr || syntax.stdout}`,
);

assert.equal(
  (source.match(/^const checks = \[\];$/gm) ?? []).length,
  1,
  "All quality-gate sections must share one cumulative check collection.",
);

assert.equal(
  (source.match(/^const add = /gm) ?? []).length,
  1,
  "All quality-gate sections must share one check-registration function.",
);

assert.equal(
  (source.match(/^const failed = checks\.filter\(x => !x\.ok\);$/gm) ?? []).length,
  8,
  "Each staged quality-gate section must report its cumulative failures.",
);

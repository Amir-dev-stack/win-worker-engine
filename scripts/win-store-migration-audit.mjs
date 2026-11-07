import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { neon } from "@neondatabase/serverless";

const required = ["NETLIFY_SITE_ID", "NETLIFY_AUTH_TOKEN", "WIN_NEON_TEST_DATABASE_URL", "WIN_NEON_TEST_EXPECTED_DATABASE"];
for (const name of required) {
  if (!process.env[name]) throw new Error(name + " is required; refusing to guess credentials or database target.");
}
if (process.env.WIN_MIGRATION_AUDIT_CONFIRM !== "1" ||
    process.env.WIN_NEON_TEST_BRANCH_CONFIRM !== "dedicated-test-branch") {
  throw new Error("Read-only audit requires WIN_MIGRATION_AUDIT_CONFIRM=1 and WIN_NEON_TEST_BRANCH_CONFIRM=dedicated-test-branch.");
}
if (process.env.WIN_NEON_DATABASE_URL &&
    process.env.WIN_NEON_DATABASE_URL === process.env.WIN_NEON_TEST_DATABASE_URL) {
  throw new Error("Refusing audit because the test URL matches WIN_NEON_DATABASE_URL.");
}
if (process.env.WIN_TRANSACTIONAL_STORE === "neon") {
  throw new Error("Run this audit with the current Blobs production path as source; do not switch the runtime store.");
}

const maxRecords = Number(process.env.WIN_MIGRATION_AUDIT_MAX_RECORDS || 100000);
if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000000) {
  throw new Error("WIN_MIGRATION_AUDIT_MAX_RECORDS must be an integer from 1 to 1000000.");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const source = getStore({
  name: "win-engine",
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN,
  region: "eu-central-1",
  consistency: "strong"
});
const sql = neon(process.env.WIN_NEON_TEST_DATABASE_URL);
const databaseIdentity = await sql`SELECT current_database() AS name`;
if (databaseIdentity?.[0]?.name !== process.env.WIN_NEON_TEST_EXPECTED_DATABASE) {
  throw new Error("Refusing audit because the connected database does not match WIN_NEON_TEST_EXPECTED_DATABASE.");
}
const sourceHashes = new Map();
let sourceCount = 0;
let missingSourcePayloads = 0;

for await (const page of source.list({ paginate: true })) {
  for (const item of page.blobs) {
    if (++sourceCount > maxRecords) {
      throw new Error("Source record cap exceeded; increase the explicit cap only after reviewing expected size.");
    }
    const value = await source.get(item.key, { type: "json", consistency: "strong" });
    if (value === null) {
      missingSourcePayloads++;
      continue;
    }
    sourceHashes.set(item.key, digest(value));
  }
}

const destinationHashes = new Map();
let cursor = "";
let destinationCount = 0;
while (true) {
  const rows = await sql`SELECT record_key, payload
    FROM public.win_memory_records
    WHERE record_key > ${cursor}
    ORDER BY record_key ASC
    LIMIT 500`;
  if (!rows.length) break;
  for (const row of rows) {
    if (++destinationCount > maxRecords) {
      throw new Error("Destination record cap exceeded; increase the explicit cap only after reviewing expected size.");
    }
    destinationHashes.set(row.record_key, digest(row.payload));
  }
  cursor = rows[rows.length - 1].record_key;
  if (rows.length < 500) break;
}

const missingInNeon = [];
const missingInBlobs = [];
const hashMismatches = [];
for (const [key, hash] of sourceHashes) {
  if (!destinationHashes.has(key)) missingInNeon.push(key);
  else if (destinationHashes.get(key) !== hash) hashMismatches.push(key);
}
for (const key of destinationHashes.keys()) {
  if (!sourceHashes.has(key)) missingInBlobs.push(key);
}

console.log(JSON.stringify({
  mode: "READ_ONLY_DRY_RUN",
  source: "Netlify Blobs win-engine (eu-central-1, strong reads)",
  destination: "Neon public.win_memory_records (connection supplied as test branch)",
  sourceListed: sourceCount,
  sourceReadable: sourceHashes.size,
  sourceMissingPayload: missingSourcePayloads,
  destinationRecords: destinationCount,
  missingInNeon: missingInNeon.length,
  missingInBlobs: missingInBlobs.length,
  payloadHashMismatches: hashMismatches.length,
  samples: {
    missingInNeon: missingInNeon.slice(0, 5),
    missingInBlobs: missingInBlobs.slice(0, 5),
    payloadHashMismatches: hashMismatches.slice(0, 5)
  },
  writesPerformed: 0,
  cutoverAllowed: false
}, null, 2));

if (missingSourcePayloads || missingInNeon.length || missingInBlobs.length || hashMismatches.length) {
  process.exitCode = 2;
}
